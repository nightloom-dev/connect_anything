import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { LegacyIdlError, listInstructions, loadIdl, parseIdl, type Idl } from '@connect-anything/core';
import type { Obligation as RescuePosition, ObligationRow } from '@connect-anything/kamino-rescue';
import type { Position } from '@kamino-finance/klend-sdk';
import {
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  getBase58Decoder,
  isSolanaError,
  type Address,
  type Base58EncodedBytes,
  type RpcTransport,
} from '@solana/kit';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseStored } from '../src/recipe.ts';

export type Env = Record<string, string | undefined>;

const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const CONNECT_PROXY = '/api/intents-connect/';
// The only calls the SDK (7.28.0) sends with the key: createExecution and createStepsExecution.
// The wallet segment allows no '%', '/' or '\' and is never '.' or '..', so it cannot resolve to another path upstream.
const CONNECT_CREATE = /^api\/v1\/executions\/(?!\.\.?(?:\/|\?|$))[\w.~-]+(?:\/steps)?(?:\?.*)?$/;
const RECIPE_ID = /^[0-9a-f]{32}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_BODY = 4 * 1024 * 1024; // klend, one of the largest real IDLs, is 240 KB
// Known limit: no rate limit, one client can fill the store and new recipes then get 507 while the old ones keep working
const MAX_RECIPES = 1000;
const MAX_STEPS = 50; // Connect's limits, a recipe over them could not run anyway
const MAX_LOOKUP_TABLES = 16;
const RPC_TIMEOUT = 30_000;
const UPSTREAM_TIMEOUT = 60_000;
const SOURCE_CHAINS = ['base', 'arb', 'eth'];
const LEGACY_IDL = 'This IDL is in the legacy pre-0.30 format, and only the simulator service converts it. It is not connected here (SIM_URL), so upload a 0.30+ IDL file instead.';

class HttpError extends Error {
  readonly status: number;
  readonly extra: object;
  constructor(status: number, message: string, extra: object = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function isPubkey(value: unknown): value is string {
  try {
    return typeof value === 'string' && new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function requirePubkey(value: string) {
  if (!isPubkey(value)) throw new HttpError(400, 'Not a public key');
}

const isObject = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);

// past the limit it drains without keeping, because closing now could cut the 413 off on its way out
const readBody = (req: IncomingMessage) =>
  new Promise<Buffer<ArrayBuffer>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
      else reject(new HttpError(413, `The body is over ${MAX_BODY} bytes`));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = (await readBody(req)).toString();
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'The body is not JSON');
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

// The detail goes to the log only, since it can name internals.
function logError(what: string, error: unknown) {
  console.error(`[api] ${what}: ${String(error)}`);
}

// Matches on core's error messages; api.test.ts fails if one of them changes.
async function toIdlResponse(load: () => Promise<Idl>, failed: HttpError) {
  let idl: Idl;
  try {
    idl = await load();
  } catch (error) {
    if (error instanceof LegacyIdlError) throw new HttpError(422, LEGACY_IDL, { legacy: true, upload: true });
    const message = error instanceof Error ? error.message : '';
    if (message.includes('no Anchor IDL account')) throw new HttpError(404, message, { upload: true });
    if (message.startsWith('Not an Anchor IDL')) throw new HttpError(422, message, { upload: true });
    logError('IDL', error);
    throw failed;
  }
  try {
    requirePubkey(idl.address);
    return { idl, instructions: listInstructions(idl) };
  } catch {
    throw new HttpError(422, 'This IDL is malformed: its address or an instruction cannot be read', { upload: true });
  }
}

function validateSimRequest(body: unknown): string | null {
  if (!isObject(body)) return 'not an object';
  if (!isPubkey(body.intermediary)) return 'intermediary is not a public key';
  if (!isPubkey(body.fund?.mint)) return 'fund.mint is not a public key';
  if (typeof body.fund.amount !== 'string' || !/^\d{1,20}$/.test(body.fund.amount) || BigInt(body.fund.amount) >> 64n) return 'fund.amount is not a u64 as a decimal string';
  const { instructions, lookupTables, idls } = body;
  if (!Array.isArray(instructions) || !instructions.length || instructions.length > MAX_STEPS) return `instructions is not a list of 1 to ${MAX_STEPS}`;
  for (const ix of instructions) {
    if (!isPubkey(ix?.programId)) return 'an instruction has a programId that is not a public key';
    if (typeof ix.data !== 'string' || !BASE64.test(ix.data)) return 'an instruction has data that is not base64';
    const accounts = ix.accounts;
    if (!Array.isArray(accounts) || !accounts.every(a => isPubkey(a?.pubkey) && typeof a.isSigner === 'boolean' && typeof a.isWritable === 'boolean')) return 'an instruction has a malformed account';
  }
  if (lookupTables !== undefined && !(Array.isArray(lookupTables) && lookupTables.length <= MAX_LOOKUP_TABLES && lookupTables.every(isPubkey))) return `lookupTables is not a list of up to ${MAX_LOOKUP_TABLES} public keys`;
  if (idls !== undefined && !isObject(idls)) return 'idls is not an object';
  return null;
}

// The public endpoint often answers 429 and only asks to wait: back off as web3.js Connection does.
const retryOn429 = (transport: RpcTransport): RpcTransport => async config => {
  for (let delay = 500; ; delay *= 2) {
    try {
      return await transport({ ...config, signal: AbortSignal.timeout(RPC_TIMEOUT) });
    } catch (error) {
      const limited = isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) && error.context.statusCode === 429;
      if (!limited || delay > 8000) throw error;
      await wait(delay);
    }
  }
};

const kaminoRpc = (url: string) => createSolanaRpcFromTransport(retryOn429(createDefaultRpcTransport({ url })));

// the SDK's own math on only the reserves a wallet uses, because KaminoMarket.load pulls every reserve of a market
// through getProgramAccounts on each call and the public RPC does not take that
// Known limit: one getMultipleAccounts per kind of account, so a wallet using over 100 reserves gets a 502
async function readObligations(wallet: string, rpc: ReturnType<typeof kaminoRpc>): Promise<RescuePosition[]> {
  // 170 MB and over a second to load, so only once somebody asks and never in a build
  const { DEFAULT_RECENT_SLOT_DURATION_MS, KaminoMarket, KaminoObligation, KaminoReserve, LendingMarket, Obligation, PROGRAM_ID, Reserve, getCurrentLedgerInstant, getTokenOracleData, isNotNullPubkey, obligationFarmStatePda } =
    await import('@kamino-finance/klend-sdk');

  const accounts = await rpc
    .getProgramAccounts(PROGRAM_ID, {
      encoding: 'base64',
      filters: [
        { dataSize: BigInt(Obligation.layout.span + 8) },
        { memcmp: { offset: 0n, bytes: getBase58Decoder().decode(Obligation.discriminator) as Base58EncodedBytes, encoding: 'base58' } },
        { memcmp: { offset: 64n, bytes: wallet as Base58EncodedBytes, encoding: 'base58' } },
      ],
    })
    .send();

  const reservesOf = (state: InstanceType<typeof Obligation>) => [...state.deposits.map(d => d.depositReserve), ...state.borrows.map(b => b.borrowReserve)].filter(isNotNullPubkey);
  const found = accounts
    .map(({ pubkey: address, account }) => {
      const data = Buffer.from(account.data[0], 'base64');
      return { address, data, state: Obligation.decode(data) };
    })
    .filter(({ state }) => reservesOf(state).length); // an empty obligation stays on chain after a full exit
  if (!found.length) return [];

  const reserveAddresses = [...new Set(found.flatMap(({ state }) => reservesOf(state)))];
  const marketAddresses = [...new Set(found.map(({ state }) => state.lendingMarket))];
  const reserveStates = await Reserve.fetchMultiple(rpc, reserveAddresses, PROGRAM_ID);
  const marketStates = await LendingMarket.fetchMultiple(rpc, marketAddresses, PROGRAM_ID);
  const priced = await getTokenOracleData(rpc, reserveAddresses.map((address, i) => ({ address, state: reserveStates[i]! })));
  // finalized, because a node can still lack the block time of a slot that is only confirmed, and an older instant is safe since the SDK clamps at zero
  const instant = await getCurrentLedgerInstant(rpc, 'finalized');

  const markets = new Map(
    marketAddresses.map((marketAddress, i) => {
      const market = marketStates[i]!;
      const reserves = new Map(
        priced
          .filter(([{ state }]) => state.lendingMarket === marketAddress)
          .map(([{ address, state }, oracle]) => [address, KaminoReserve.initialize(address, state, oracle!, rpc, DEFAULT_RECENT_SLOT_DURATION_MS, market.reserveRewardsMaxAprBps)]),
      );
      return [marketAddress, KaminoMarket.loadWithReserves(rpc, market, reserves, marketAddress, DEFAULT_RECENT_SLOT_DURATION_MS)];
    }),
  );

  const orNull = (key: Address) => (isNotNullPubkey(key) ? key : null);

  return Promise.all(found.map(async ({ address, data, state }) => {
    const market = markets.get(state.lendingMarket)!;
    const obligation = KaminoObligation.fromAccountData(markets, address, data, instant)!;
    const stats = obligation.refreshedStats;
    // the reserve's accounts are here because only the server decodes reserves, and a recipe takes them as hints
    const row = (position: Position): ObligationRow => {
      const reserve = market.getReserveByAddress(position.reserveAddress)!;
      const { liquidity, farmDebt, config: { tokenInfo } } = reserve.state;
      return {
        reserve: position.reserveAddress,
        mint: position.mintAddress,
        symbol: reserve.getTokenSymbol(),
        decimals: reserve.getMintDecimals(),
        amount: position.amount.toFixed(0),
        usd: position.marketValueRefreshed.toNumber(),
        tokenProgram: liquidity.tokenProgram,
        supplyVault: liquidity.supplyVault,
        debtFarm: orNull(farmDebt),
        pythOracle: orNull(tokenInfo.pythConfiguration.price),
        switchboardPriceOracle: orNull(tokenInfo.switchboardConfiguration.priceAggregator),
        switchboardTwapOracle: orNull(tokenInfo.switchboardConfiguration.twapAggregator),
        scopePrices: orNull(tokenInfo.scopeConfiguration.priceFeed),
      };
    };
    const borrows = obligation.getBorrows().map(row);
    // a farm added after the borrow leaves no user state, which the SDK creates first and a recipe has no rent to create
    const farms = [...new Set(borrows.flatMap(({ debtFarm }) => debtFarm ?? []))] as Address[];
    const farmUsers = await Promise.all(farms.map(farm => obligationFarmStatePda(farm, address)));
    const { value: joined } = farmUsers.length ? await rpc.getMultipleAccounts(farmUsers, { encoding: 'base64' }).send() : { value: [] };
    return {
      address,
      market: state.lendingMarket,
      deposits: obligation.getDeposits().map(row),
      borrows,
      collateralUsd: stats.userTotalCollateralDeposit.toNumber(),
      debtUsd: stats.userTotalBorrow.toNumber(),
      adjustedDebtUsd: stats.userTotalBorrowBorrowFactorAdjusted.toNumber(), // the debt LTV counts, with the borrow factor
      ltv: stats.loanToValue.toNumber(),
      liquidationLtv: stats.liquidationLtv.toNumber(),
      // the SDK's own answers, or the program refuses the repay: refresh_obligation takes the reserves and then a referred
      // obligation's referrer token states, and repay takes the deposit reserves too in an elevation group
      refreshRemaining: (await obligation.getRefreshObligationIx()).accounts!.slice(2).map(account => account.address),
      repayRemaining: state.elevationGroup > 0 ? obligation.getDepositReserves() : [],
      unjoinedDebtFarms: farms.filter((_, index) => !joined[index]),
    };
  }));
}

type Handler = (params: string[], context: { req: IncomingMessage; res: ServerResponse; query: string }) => Promise<unknown>;

/** every /api route as one connect-style middleware, anything else goes on to next() */
export function createApi(env: Env) {
  const rpcUrl = env.SOLANA_RPC_URL || PUBLIC_RPC;
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT) }) });
  const kamino = kaminoRpc(rpcUrl);
  const recipesDir = env.RECIPES_DIR || fileURLToPath(new URL('../data/recipes', import.meta.url));
  const simHeaders: Record<string, string> = env.SIM_TOKEN ? { 'x-sim-token': env.SIM_TOKEN } : {};
  const converter = { convertUrl: env.SIM_URL, headers: simHeaders };

  // a redirect would carry the key to wherever it points
  const connect = (path: string, method = 'GET', body?: BodyInit) =>
    fetch(`${env.CONNECT_API_URL}/${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-api-key': env.AURORA_KEY ?? '' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    }).catch(error => {
      logError('Connect', error);
      throw new HttpError(502, 'Intents Connect did not answer');
    });

  // Known limit: anyone who can reach this server can still create executions with the key
  async function proxyConnect(url: string, req: IncomingMessage, res: ServerResponse) {
    const path = url.slice(CONNECT_PROXY.length);
    if (req.method !== 'POST' || !CONNECT_CREATE.test(path)) throw new HttpError(404, 'The key proxy only forwards the create calls of Intents Connect');
    const body = await readBody(req);
    const upstream = await connect(path, req.method, body.length ? body : undefined);
    const type = upstream.headers.get('content-type') ?? 'application/json';
    const bytes = Buffer.from(await upstream.arrayBuffer());
    // the status stays because the SDK acts on 409 and 503, but a gateway's HTML page is not an answer to pass on
    if (!upstream.ok && !type.includes('json')) throw new HttpError(upstream.status, `Intents Connect answered ${upstream.status}`);
    res.statusCode = upstream.status;
    res.setHeader('content-type', type);
    res.end(bytes);
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/idl\/([^/]+)$/, async ([programId]) => {
      requirePubkey(programId);
      return toIdlResponse(
        () => loadIdl(programId, connection, converter),
        new HttpError(502, 'Could not read the IDL: the Solana RPC or the converter failed. Try again or upload a 0.30+ IDL file.', { upload: true }),
      );
    }],

    ['POST', /^\/api\/idl\/parse$/, async (_, { req, query }) => {
      const programId = new URLSearchParams(query).get('programId') ?? undefined;
      if (programId !== undefined) requirePubkey(programId);
      const file = await readJson(req);
      return toIdlResponse(
        () => parseIdl(file, { ...converter, programId }),
        new HttpError(422, 'Could not read this file: it is a malformed IDL, or the converter failed on it.', { upload: true }),
      );
    }],

    ['POST', /^\/api\/simulate$/, async (_, { req }) => {
      const body = await readJson(req);
      const problem = validateSimRequest(body);
      if (problem) throw new HttpError(400, `Not a simulation request: ${problem}`);
      if (!env.SIM_URL) throw new HttpError(503, 'The simulator is offline: SIM_URL is not set');
      const upstream = await fetch(`${env.SIM_URL.replace(/\/$/, '')}/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...simHeaders },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      }).catch(error => {
        logError('simulator', error);
        throw new HttpError(503, 'The simulator is offline: it did not answer');
      });
      const result = (await upstream.json().catch(() => null)) as Record<string, any> | null;
      if (upstream.ok && result?.verdict) return result;
      // the service refuses a bad recipe with these, and anything else means it is not working
      if (upstream.status === 400 || upstream.status === 422) throw new HttpError(upstream.status, String(result?.message ?? result?.error?.message ?? 'The simulator refused the request'));
      throw new HttpError(503, `The simulator is offline: it gave no usable answer (${upstream.status})`);
    }],

    ['POST', /^\/api\/recipes$/, async (_, { req, res }) => {
      const recipe = await readJson(req);
      // the same check /r/:id runs, so a link is never made for a recipe its page would refuse
      try {
        parseStored(recipe);
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      await mkdir(recipesDir, { recursive: true });
      if ((await readdir(recipesDir)).length >= MAX_RECIPES) throw new HttpError(507, 'The recipe store is full');
      const id = randomBytes(16).toString('hex');
      await writeFile(join(recipesDir, `${id}.json`), JSON.stringify(recipe), { flag: 'wx' });
      res.statusCode = 201;
      return { id };
    }],

    ['GET', /^\/api\/recipes\/([^/]+)$/, async ([id], { res }) => {
      if (!RECIPE_ID.test(id)) throw new HttpError(400, 'Not a recipe id');
      const recipe = await readFile(join(recipesDir, `${id}.json`)).catch(error => {
        throw error.code === 'ENOENT' ? new HttpError(404, 'No such recipe') : error;
      });
      res.setHeader('content-type', 'application/json');
      res.end(recipe);
    }],

    ['GET', /^\/api\/kamino\/([^/]+)$/, async ([wallet]) => {
      requirePubkey(wallet);
      try {
        return { obligations: await readObligations(wallet, kamino) };
      } catch (error) {
        logError('Kamino', error);
        throw new HttpError(502, 'Could not read the position from Solana, try again');
      }
    }],

    ['GET', /^\/api\/tokens$/, async () => {
      const upstream = await connect('api/v1/supported_tokens');
      const body = (await upstream.json().catch(() => null)) as { result?: { in?: unknown; out?: unknown } } | null;
      const { in: incoming, out } = body?.result ?? {};
      if (!upstream.ok || !Array.isArray(incoming) || !Array.isArray(out)) throw new HttpError(502, `Intents Connect gave no token list (${upstream.status})`);
      return {
        tokens: out.filter(token => token?.blockchain === 'sol'), // every recipe runs on Solana, so nothing else is a target
        sources: incoming.filter(token => SOURCE_CHAINS.includes(token?.blockchain)),
      };
    }],

    // what an intermediary holds after an execution, which sizes Retry and Refund
    ['GET', /^\/api\/balance\/([^/]+)\/([^/]+)$/, async ([owner, mint]) => {
      requirePubkey(owner);
      requirePubkey(mint);
      const { value } = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) }).catch(error => {
        logError('balance', error);
        throw new HttpError(502, 'Could not read the balance from Solana, try again');
      });
      const accounts = value.map(({ pubkey, account }) => ({ account: pubkey.toBase58(), tokenProgram: account.owner.toBase58(), amount: String(account.data.parsed.info.tokenAmount.amount) }));
      // an intermediary holds a mint in its one associated account, so the largest is that one
      return accounts.sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)))[0] ?? { account: null, tokenProgram: null, amount: '0' };
    }],
  ];

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    const [path, query = ''] = url.split('?', 2);
    if (!path.startsWith('/api/')) return next();
    try {
      if (url.startsWith(CONNECT_PROXY)) return await proxyConnect(url, req, res);
      const route = routes.find(([method, pattern]) => method === req.method && pattern.test(path));
      if (!route) throw new HttpError(404, 'No such API route');
      const answer = await route[2](route[1].exec(path)!.slice(1), { req, res, query });
      if (answer !== undefined) json(res, res.statusCode, answer);
    } catch (error) {
      if (error instanceof HttpError) return json(res, error.status, { error: error.message, ...error.extra });
      logError(`${req.method} ${path}`, error);
      json(res, 500, { error: 'Internal error' });
    }
  };
}
