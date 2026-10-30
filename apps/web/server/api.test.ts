import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, mock, test } from 'node:test';
import { BorshAccountsCoder, utils } from '@coral-xyz/anchor';
import { createApi, type Env } from './api.ts';

// a converter on the developer's machine must not decide what these tests see
delete process.env.SIM_URL;
mock.method(console, 'error', () => {});

const KEY = 'secret-aurora-key-for-tests';
const DEAD = 'http://127.0.0.1:1'; // nothing listens here, so reaching an upstream by mistake shows as a 502
const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
const PUMP_AMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const coreFixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../packages/core/test/fixtures/${name}`, import.meta.url), 'utf8'));
const KLEND_IDL = coreFixture('klend.modern-idl.json');

const recipesDir = mkdtempSync(join(tmpdir(), 'recipes-'));
const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.close();
    server.closeAllConnections();
  }
  rmSync(recipesDir, { recursive: true, force: true });
});

async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function app(env: Env = {}) {
  const api = createApi({ AURORA_KEY: KEY, CONNECT_API_URL: DEAD, SOLANA_RPC_URL: DEAD, RECIPES_DIR: recipesDir, ...env });
  return listen((req, res) => void api(req, res, () => res.end('next')));
}

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.statusCode = status;
  res.setHeader('content-type', type);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };

async function fake(answer: (seen: Seen, res: ServerResponse) => void) {
  const seen: Seen[] = [];
  const url = await listen(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = { method: req.method!, url: req.url!, headers: req.headers, body };
    seen.push(request);
    answer(request, res);
  });
  return { url, seen };
}

const rpc = (answer: (method: string, params: unknown[]) => { result: unknown } | { error: unknown }) =>
  fake(({ body }, res) => {
    const { id, method, params = [] } = JSON.parse(body);
    send(res, 200, { jsonrpc: '2.0', id, ...answer(method, params) });
  });

// every answer of every test goes through here, so all of them are JSON and none carries the key or a stack
async function call(base: string, path: string, init?: RequestInit) {
  const response = await fetch(base + path, init);
  const text = await response.text();
  assert.ok(!text.includes(KEY), `${path} leaked the key: ${text}`);
  assert.ok(!/\n\s+at /.test(text), `${path} leaked a stack: ${text}`);
  return { status: response.status, type: response.headers.get('content-type'), body: JSON.parse(text) };
}

const post = (base: string, path: string, body: unknown) => call(base, path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('only /api is taken and an unknown route is a JSON 404', async () => {
  const base = await app();
  assert.equal(await (await fetch(`${base}/r/abc`)).text(), 'next');
  assert.equal(await (await fetch(`${base}/apiary`)).text(), 'next');
  assert.equal((await call(base, '/api/nope')).status, 404);
  assert.equal((await call(base, '/api/recipes', { method: 'PUT' })).status, 404);
});

test('a public key has to be one, before anything goes upstream', async () => {
  const base = await app();
  const notKeys = ['not-a-key', 'O0Il', utils.bytes.bs58.encode(Buffer.alloc(31, 7)), utils.bytes.bs58.encode(Buffer.alloc(33, 7)), '..%2F..%2Fetc%2Fpasswd', `${KLEND}%00`];
  for (const key of notKeys) {
    assert.equal((await call(base, `/api/idl/${key}`)).status, 400, `idl ${key}`);
    assert.equal((await call(base, `/api/kamino/${key}`)).status, 400, `kamino ${key}`);
    assert.equal((await post(base, `/api/idl/parse?programId=${key}`, KLEND_IDL)).status, 400, `parse ${key}`);
  }
});

const onChain = async (...names: string[]) => {
  const accounts = new Map(names.map(name => coreFixture(`${name}.idl-account.json`)).map(account => [account.address, account]));
  const { url } = await rpc((method, [address]) => {
    assert.equal(method, 'getAccountInfo');
    const account = accounts.get(address as string);
    const value = account && { data: [account.data, 'base64'], executable: false, lamports: 1, owner: account.owner, rentEpoch: 0, space: 1 };
    return { result: { context: { slot: 1 }, value: value ?? null } };
  });
  return app({ SOLANA_RPC_URL: url });
};

test('GET /api/idl answers with the IDL and its instructions', async () => {
  const { status, body } = await call(await onChain('pump_amm'), `/api/idl/${PUMP_AMM}`);
  assert.equal(status, 200);
  assert.equal(body.idl.address, PUMP_AMM);
  assert.ok(body.instructions.some((ix: { name: string }) => ix.name === 'buy'));
});

test('GET /api/idl says a legacy IDL needs role R and offers the upload', async () => {
  const { status, body } = await call(await onChain('klend'), `/api/idl/${KLEND}`);
  assert.equal(status, 422);
  assert.match(body.error, /legacy/);
  assert.match(body.error, /role R/);
  assert.deepEqual([body.legacy, body.upload], [true, true]);
});

test('GET /api/idl tells a missing IDL from a failed read', async () => {
  const missing = await call(await onChain(), `/api/idl/${KLEND}`);
  assert.deepEqual([missing.status, missing.body.upload], [404, true]);
  assert.match(missing.body.error, /no Anchor IDL account/);

  const down = await call(await app(), `/api/idl/${KLEND}`);
  assert.deepEqual([down.status, down.body.upload], [502, true]);
  assert.doesNotMatch(down.body.error, /127\.0\.0\.1|fetch failed/);
});

test('POST /api/idl/parse reads a file', async () => {
  const base = await app();
  const modern = await post(base, '/api/idl/parse', KLEND_IDL);
  assert.equal(modern.status, 200);
  assert.ok(modern.body.instructions.some((ix: { name: string }) => ix.name === 'repay_obligation_liquidity_v2'));

  const retargeted = await post(base, `/api/idl/parse?programId=${PUMP_AMM}`, KLEND_IDL);
  assert.equal(retargeted.body.idl.address, PUMP_AMM);
});

test('POST /api/idl/parse refuses what is not a modern IDL', async () => {
  const base = await app();
  const legacy = await post(base, '/api/idl/parse', { name: 'old', instructions: [{ name: 'a', accounts: [], args: [] }] });
  assert.deepEqual([legacy.status, legacy.body.legacy, legacy.body.upload], [422, true, true]);

  assert.equal((await post(base, '/api/idl/parse', 'not json')).status, 400);
  assert.equal((await post(base, '/api/idl/parse', '"not an idl"')).status, 422);
  for (const file of [{}, [], 1, null, { instructions: 'x' }, { instructions: [null] }, { address: 'nope', instructions: [] }, { address: KLEND, instructions: [{ discriminator: [] }] }]) {
    const { status, body } = await post(base, '/api/idl/parse', file);
    assert.deepEqual([status, body.upload], [422, true], JSON.stringify(file));
  }
  assert.match((await post(base, '/api/idl/parse', {})).body.error, /^Not an Anchor IDL/);
  assert.equal((await post(base, '/api/idl/parse', 'x'.repeat(4 * 1024 * 1024 + 1))).status, 413);
});

const SIM_REQUEST = {
  intermediary: KLEND,
  fund: { mint: USDC, amount: '1000000' },
  instructions: [{ programId: KLEND, data: 'AQID', accounts: [{ pubkey: USDC, isSigner: false, isWritable: true }] }],
  lookupTables: [USDC],
  idls: {},
};

test('POST /api/simulate refuses a malformed request without asking the simulator', async () => {
  const simulator = await fake((_, res) => send(res, 200, { verdict: 'ok' }));
  const base = await app({ SIM_URL: simulator.url });
  const step = SIM_REQUEST.instructions[0];
  const bad = [
    {},
    [],
    { ...SIM_REQUEST, intermediary: 'x' },
    { ...SIM_REQUEST, fund: undefined },
    { ...SIM_REQUEST, fund: { mint: 'x', amount: '1' } },
    { ...SIM_REQUEST, fund: { mint: USDC, amount: 1 } },
    { ...SIM_REQUEST, fund: { mint: USDC, amount: '-1' } },
    { ...SIM_REQUEST, fund: { mint: USDC, amount: (2n ** 64n).toString() } },
    { ...SIM_REQUEST, instructions: [] },
    { ...SIM_REQUEST, instructions: Array(51).fill(step) },
    { ...SIM_REQUEST, instructions: [null] },
    { ...SIM_REQUEST, instructions: [{ ...step, programId: 'x' }] },
    { ...SIM_REQUEST, instructions: [{ ...step, data: 'not base64!' }] },
    { ...SIM_REQUEST, instructions: [{ ...step, accounts: [{ pubkey: USDC, isSigner: 'no', isWritable: true }] }] },
    { ...SIM_REQUEST, instructions: [{ ...step, accounts: [null] }] },
    { ...SIM_REQUEST, lookupTables: Array(17).fill(USDC) },
    { ...SIM_REQUEST, lookupTables: ['x'] },
    { ...SIM_REQUEST, idls: [] },
  ];
  for (const body of bad) assert.equal((await post(base, '/api/simulate', body)).status, 400, JSON.stringify(body).slice(0, 120));
  assert.equal((await post(base, '/api/simulate', { ...SIM_REQUEST, fund: { mint: USDC, amount: (2n ** 64n - 1n).toString() } })).status, 200);
  assert.equal(simulator.seen.length, 1);
});

test('POST /api/simulate forwards with the token and returns the result', async () => {
  const result = { verdict: 'warn', computeUnits: 230000, txBytes: 1300, logs: ['a'], warnings: ['CU 230k > 200k'] };
  const simulator = await fake((_, res) => send(res, 200, result));
  const { status, body } = await post(await app({ SIM_URL: `${simulator.url}/`, SIM_TOKEN: 'sim-token' }), '/api/simulate', SIM_REQUEST);
  assert.deepEqual([status, body], [200, result]);
  const [{ method, url, headers, body: sent }] = simulator.seen;
  assert.deepEqual([method, url, headers['x-sim-token'], JSON.parse(sent)], ['POST', '/simulate', 'sim-token', SIM_REQUEST]);
  assert.equal(headers['x-api-key'], undefined);
});

test('POST /api/simulate is a clear 503 while there is no simulator', async () => {
  const unset = await post(await app(), '/api/simulate', SIM_REQUEST);
  assert.equal(unset.status, 503);
  assert.match(unset.body.error, /offline.*SIM_URL/);

  const unreachable = await post(await app({ SIM_URL: DEAD }), '/api/simulate', SIM_REQUEST);
  assert.deepEqual([unreachable.status, unreachable.body], [503, { error: 'The simulator is offline: it did not answer' }]);

  const answers: [number, string, string][] = [
    [200, '<html>', 'text/html'],
    [200, '{}', 'application/json'],
    [401, '{"message":"bad token"}', 'application/json'],
    [500, 'boom', 'text/plain'],
  ];
  for (const [code, text, type] of answers) {
    const simulator = await fake((_, res) => send(res, code, text, type));
    const { status, body } = await post(await app({ SIM_URL: simulator.url }), '/api/simulate', SIM_REQUEST);
    assert.equal(status, 503, text);
    assert.match(body.error, /offline/);
  }
});

test('POST /api/simulate passes on why the simulator refused a recipe', async () => {
  const simulator = await fake((_, res) => send(res, 400, { message: 'ComputeBudget is not allowed' }));
  const { status, body } = await post(await app({ SIM_URL: simulator.url }), '/api/simulate', SIM_REQUEST);
  assert.deepEqual([status, body.error], [400, 'ComputeBudget is not allowed']);
});

test('a recipe comes back under the id it got', async () => {
  const base = await app();
  const recipe = { title: 'Repay', steps: [{ ixName: 'repay' }] };
  const created = await post(base, '/api/recipes', recipe);
  assert.equal(created.status, 201);
  assert.match(created.body.id, /^[0-9a-f]{32}$/);
  const { status, type, body } = await call(base, `/api/recipes/${created.body.id}`);
  assert.deepEqual([status, type, body], [200, 'application/json', recipe]);
  assert.notEqual((await post(base, '/api/recipes', recipe)).body.id, created.body.id);
});

test('a recipe id has one form, so no path can leave the store', async () => {
  // this is where a traversal would land if an id reached the file system unchecked
  writeFileSync(join(recipesDir, '..', 'outside.json'), '{"outside":true}');
  after(() => rmSync(join(recipesDir, '..', 'outside.json')));
  const base = await app();
  const bad = ['..%2Foutside', '..%5Coutside', '%2e%2e%2Foutside', 'abc', 'A'.repeat(32), 'g'.repeat(32), `${'a'.repeat(32)}.json`, 'a'.repeat(33), `${'a'.repeat(32)}%00`];
  for (const id of bad) assert.equal((await call(base, `/api/recipes/${id}`)).status, 400, id);
  assert.equal((await call(base, `/api/recipes/${'a'.repeat(32)}`)).status, 404);
});

test('a recipe is a JSON object of a limited size in a store of a limited size', async () => {
  const base = await app();
  for (const body of ['nope', '[]', '1', '"text"', 'null']) assert.equal((await post(base, '/api/recipes', body)).status, 400, body);
  assert.equal((await post(base, '/api/recipes', 'x'.repeat(4 * 1024 * 1024 + 1))).status, 413);

  const full = mkdtempSync(join(tmpdir(), 'recipes-full-'));
  after(() => rmSync(full, { recursive: true, force: true }));
  for (let i = 0; i < 1000; i++) writeFileSync(join(full, `${i}.json`), '{}');
  assert.equal((await post(await app({ RECIPES_DIR: full }), '/api/recipes', {})).status, 507);
  assert.equal(readdirSync(full).length, 1000);
});

test('the store is created on first use', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'recipes-new-'));
  after(() => rmSync(parent, { recursive: true, force: true }));
  const { status } = await post(await app({ RECIPES_DIR: join(parent, 'deep', 'recipes') }), '/api/recipes', {});
  assert.equal(status, 201);
});

test('GET /api/tokens lists the Solana targets, asked for with the key', async () => {
  const sol = { blockchain: 'sol', symbol: 'USDC', contractAddress: USDC };
  const connect = await fake((_, res) => send(res, 200, { result: { in: [{ blockchain: 'sol', symbol: 'ONLY-IN' }], out: [sol, { blockchain: 'base', symbol: 'USDC' }] } }));
  const { status, body } = await call(await app({ CONNECT_API_URL: connect.url }), '/api/tokens');
  assert.deepEqual([status, body], [200, { tokens: [sol] }]);
  const [{ method, url, headers }] = connect.seen;
  assert.deepEqual([method, url, headers['x-api-key']], ['GET', '/api/v1/supported_tokens', KEY]);
});

test('GET /api/tokens is a JSON error when Connect fails', async () => {
  assert.equal((await call(await app(), '/api/tokens')).status, 502);
  const answers: [number, string, string][] = [
    [500, `{"error":"bad key ${KEY}"}`, 'application/json'],
    [502, '<html>gateway</html>', 'text/html'],
    [200, '{"result":{}}', 'application/json'],
  ];
  for (const [code, text, type] of answers) {
    const connect = await fake((_, res) => send(res, code, text, type));
    assert.equal((await call(await app({ CONNECT_API_URL: connect.url }), '/api/tokens')).status, 502, text);
  }
});

test('the proxy adds the key and passes everything else on as it is', async () => {
  const connect = await fake((_, res) => send(res, 201, { ok: true }, 'application/json; charset=utf-8'));
  const base = await app({ CONNECT_API_URL: connect.url });
  const { status, type, body } = await call(base, '/api/intents-connect/api/v1/executions/0xabc?flow=x&y=1', { method: 'PATCH', body: '{"a":1}' });
  assert.deepEqual([status, type, body], [201, 'application/json; charset=utf-8', { ok: true }]);
  const [{ method, url, headers, body: sent }] = connect.seen;
  assert.deepEqual([method, url, headers['x-api-key'], headers['content-type'], sent], ['PATCH', '/api/v1/executions/0xabc?flow=x&y=1', KEY, 'application/json', '{"a":1}']);

  await call(base, '/api/intents-connect/api/v1/x');
  assert.deepEqual([connect.seen[1].method, connect.seen[1].body], ['GET', '']);
});

test('the proxy keeps the statuses the SDK acts on', async () => {
  for (const status of [400, 409, 503]) {
    const answer = { error: 'from Connect', status };
    const connect = await fake((_, res) => send(res, status, answer));
    const got = await call(await app({ CONNECT_API_URL: connect.url }), '/api/intents-connect/api/v1/x', { method: 'POST', body: '{}' });
    assert.deepEqual([got.status, got.body], [status, answer]);
  }
});

test('the proxy never passes a failure on as anything but JSON', async () => {
  const down = await call(await app(), '/api/intents-connect/api/v1/x', { method: 'POST', body: '{}' });
  assert.deepEqual([down.status, down.body], [502, { error: 'Intents Connect did not answer' }]);

  const connect = await fake((_, res) => send(res, 503, '<html>gateway</html>', 'text/html'));
  const gateway = await call(await app({ CONNECT_API_URL: connect.url }), '/api/intents-connect/api/v1/x');
  assert.deepEqual([gateway.status, gateway.type], [503, 'application/json']);
});

test('the proxy does not follow a redirect, which would take the key along', async () => {
  const elsewhere = await fake((_, res) => send(res, 200, {}));
  const connect = await fake((_, res) => {
    res.statusCode = 307;
    res.setHeader('location', elsewhere.url);
    res.end();
  });
  assert.equal((await call(await app({ CONNECT_API_URL: connect.url }), '/api/intents-connect/api/v1/x')).status, 502);
  assert.equal(elsewhere.seen.length, 0);
});

test('the proxy has a body limit', async () => {
  const connect = await fake((_, res) => send(res, 200, {}));
  assert.equal((await post(await app({ CONNECT_API_URL: connect.url }), '/api/intents-connect/api/v1/x', 'x'.repeat(4 * 1024 * 1024 + 1))).status, 413);
  assert.equal(connect.seen.length, 0);
});

// read once from mainnet through this route at slot 463374955, the wallet that signed klend-repay-plain in core's fixtures
const WALLET = '8FKDyH8gkPLTE6Jqm3vkLukeerf8FWJUSDjMKNfgrCpq';
const RECORDED: Record<string, any> = JSON.parse(readFileSync(new URL('fixtures/kamino-8FKDyH8g.rpc.json', import.meta.url), 'utf8'));
const replayed = (method: string, params: unknown[]) => {
  const key = `${method} ${JSON.stringify(params)}`;
  return key in RECORDED ? { result: RECORDED[key] } : { error: { code: -32601, message: `not recorded: ${key.slice(0, 120)}` } };
};

const coder = new BorshAccountsCoder(KLEND_IDL);
const fixedPoint = (value: { toString(): string }) => Number(BigInt(value.toString())) / 2 ** 60;
const wide = ({ value }: { value: { toString(): string }[] }) => value.reduce<bigint>((sum, word, i) => sum + (BigInt(word.toString()) << BigInt(64 * i)), 0n);

// the same position from the raw accounts with none of the SDK, at the prices the reserves cached at their last refresh
// the values an obligation stores are no use here, they date from its last refresh and PfqP2R8 still says LTV 0.008
function fromRawAccounts(address: string) {
  const accounts = new Map<string, Buffer>();
  for (const [key, result] of Object.entries(RECORDED)) {
    if (!key.startsWith('getMultipleAccounts ')) continue;
    const [addresses] = JSON.parse(key.slice('getMultipleAccounts '.length));
    addresses.forEach((account: string, i: number) => accounts.set(account, Buffer.from(result.value[i].data[0], 'base64')));
  }
  const [, found] = Object.entries(RECORDED).find(([key]) => key.startsWith('getProgramAccounts'))!;
  const obligation = coder.decode('Obligation', Buffer.from(found.find((item: any) => item.pubkey === address).account.data[0], 'base64'));
  const reserveAt = (key: { toBase58(): string }) => coder.decode('Reserve', accounts.get(key.toBase58())!);
  const isUsed = (key: { toBase58(): string }) => accounts.has(key.toBase58());
  const usd = (amount: number, { liquidity }: any) => (amount / 10 ** Number(liquidity.mint_decimals)) * fixedPoint(liquidity.market_price_sf);

  const deposits = obligation.deposits.filter((d: any) => isUsed(d.deposit_reserve)).map((d: any) => {
    const reserve = reserveAt(d.deposit_reserve);
    const { liquidity, collateral } = reserve;
    const supply = Number(liquidity.total_available_amount) + fixedPoint(liquidity.borrowed_amount_sf) - fixedPoint(liquidity.accumulated_protocol_fees_sf) - fixedPoint(liquidity.accumulated_referrer_fees_sf) - fixedPoint(liquidity.pending_referrer_fees_sf);
    const amount = (Number(d.deposited_amount) * supply) / Number(collateral.mint_total_supply);
    return { reserve: d.deposit_reserve.toBase58(), raw: reserve, amount, usd: usd(amount, reserve) };
  });
  const borrows = obligation.borrows.filter((b: any) => isUsed(b.borrow_reserve)).map((b: any) => {
    const reserve = reserveAt(b.borrow_reserve);
    const growth = Number((wide(reserve.liquidity.cumulative_borrow_rate_bsf) * 10n ** 18n) / wide(b.cumulative_borrow_rate_bsf)) / 1e18;
    const amount = fixedPoint(b.borrowed_amount_sf) * growth;
    return { reserve: b.borrow_reserve.toBase58(), raw: reserve, amount, usd: usd(amount, reserve) };
  });
  const collateralUsd = deposits.reduce((sum: number, d: any) => sum + d.usd, 0);
  const debtUsd = borrows.reduce((sum: number, b: any) => sum + b.usd, 0);
  return {
    market: obligation.lending_market.toBase58(),
    deposits,
    borrows,
    collateralUsd,
    debtUsd,
    adjustedDebtUsd: borrows.reduce((sum: number, b: any) => sum + (b.usd * Number(b.raw.config.borrow_factor_pct)) / 100, 0),
    liquidationLimit: deposits.reduce((sum: number, d: any) => sum + (d.usd * d.raw.config.liquidation_threshold_pct) / 100, 0),
  };
}

const within = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) <= expected * 0.001, `${what}: ${actual} is not within 0.1% of ${expected}`);

async function kaminoAnswer() {
  const { url } = await rpc(replayed);
  const { status, body } = await call(await app({ SOLANA_RPC_URL: url }), `/api/kamino/${WALLET}`);
  assert.equal(status, 200, JSON.stringify(body));
  return body.obligations as any[];
}

test('GET /api/kamino gives the numbers of a real position', async () => {
  const obligations = await kaminoAnswer();
  assert.deepEqual(obligations.map(o => o.address).sort(), ['GoD6qy7kDpJQgkV5cZqdXtJmmjGhNvLzmdJNofjMCCN8', 'PfqP2R8NB8gNjegeNrsjTVv4epj3WqcH8S58QQL5UwH']);

  for (const obligation of obligations) {
    const raw = fromRawAccounts(obligation.address);
    assert.equal(obligation.market, raw.market);
    within(obligation.collateralUsd, raw.collateralUsd, 'collateral');
    within(obligation.debtUsd, raw.debtUsd, 'debt');
    within(obligation.adjustedDebtUsd, raw.adjustedDebtUsd, 'adjusted debt');
    within(obligation.ltv, raw.adjustedDebtUsd / raw.collateralUsd, 'LTV');
    within(obligation.liquidationLtv, raw.liquidationLimit / raw.collateralUsd, 'liquidation LTV');

    for (const [rows, rawRows] of [[obligation.deposits, raw.deposits], [obligation.borrows, raw.borrows]]) {
      assert.deepEqual(rows.map((row: any) => row.reserve), rawRows.map((row: any) => row.reserve));
      rows.forEach((row: any, i: number) => {
        const { amount, usd, raw: { liquidity, config } } = rawRows[i];
        within(Number(row.amount), amount, 'amount');
        within(row.usd, usd, 'usd');
        assert.deepEqual([row.mint, row.decimals, row.supplyVault, row.tokenProgram], [liquidity.mint_pubkey.toBase58(), Number(liquidity.mint_decimals), liquidity.supply_vault.toBase58(), liquidity.token_program.toBase58()]);
        assert.equal(row.scopePrices, config.token_info.scope_configuration.price_feed.toBase58());
      });
    }
  }

  // and pinned, so a change in the SDK's math cannot hide inside the tolerance above
  const plain = obligations.find(o => o.address.startsWith('GoD6'));
  assert.deepEqual([plain.ltv.toFixed(4), plain.liquidationLtv.toFixed(4), plain.borrows[0].symbol, plain.borrows[0].amount, plain.deposits[0].symbol], ['0.7133', '0.8000', 'USDT', '5218745016', 'cbBTC']);
  const small = obligations.find(o => o.address.startsWith('Pfq'));
  assert.deepEqual([small.ltv.toFixed(4), small.liquidationLtv.toFixed(4), small.borrows[0].symbol, small.borrows[0].amount], ['0.8020', '0.9100', 'CASH', '3231051']);
});

test('GET /api/kamino gives the accounts a real repay used', async () => {
  const [obligations, tx] = [await kaminoAnswer(), coreFixture('klend-repay-plain.tx.json')];
  const { accountKeys, instructions } = tx.transaction.message;
  const { writable = [], readonly = [] } = tx.meta.loadedAddresses ?? {};
  const keys: string[] = [...accountKeys, ...writable, ...readonly];
  const named = (ix: { accounts: number[] }) => ix.accounts.map(i => keys[i]);
  const klendIxs = instructions.filter((ix: { programIdIndex: number }) => keys[ix.programIdIndex] === KLEND);
  const discriminator = (ix: { data: string }) => Buffer.from(utils.bytes.bs58.decode(ix.data)).subarray(0, 8).toString('hex');
  const repay = named(klendIxs.find((ix: { data: string }) => discriminator(ix) === '74aed54cb435d290'));
  const [refresh] = klendIxs.filter((ix: { data: string }) => discriminator(ix) === '02da8aeb4fc91966').map(named);

  assert.equal(repay[0], WALLET);
  const obligation = obligations.find(o => o.address === repay[1]);
  assert.equal(obligation.market, repay[2]);
  const [debt] = obligation.borrows;
  assert.deepEqual([debt.reserve, debt.mint, debt.supplyVault, debt.tokenProgram], [repay[3], repay[4], repay[5], repay[7]]);
  assert.equal(debt.debtFarm, null);
  // an optional account the reserve leaves empty is klend itself in the transaction and null here
  assert.deepEqual([debt.pythOracle, debt.switchboardPriceOracle, debt.switchboardTwapOracle, debt.scopePrices], refresh.slice(2).map((key: string) => (key === KLEND ? null : key)));
});

test('GET /api/kamino sees a debt farm and a Token-2022 mint', async () => {
  const obligations = await kaminoAnswer();
  const [debt] = obligations.find(o => o.address.startsWith('Pfq')).borrows;
  assert.deepEqual([debt.debtFarm, debt.tokenProgram], ['3Dsn7mXKCxQ54QxDtogFsGqgMhhgWnVtN5MGLHvowh3E', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
});

test('GET /api/kamino gives an empty list for a wallet without positions', async () => {
  const { url } = await rpc(() => ({ result: [] }));
  const { status, body } = await call(await app({ SOLANA_RPC_URL: url }), `/api/kamino/${USDC}`);
  assert.deepEqual([status, body], [200, { obligations: [] }]);
});

test('GET /api/kamino waits out a 429 and is a JSON error when Solana fails', async () => {
  let limited = false;
  const patient = await fake(({ body }, res) => {
    if (!limited) {
      limited = true;
      return send(res, 429, {});
    }
    const { id, method, params = [] } = JSON.parse(body);
    send(res, 200, { jsonrpc: '2.0', id, ...replayed(method, params) });
  });
  const answer = await call(await app({ SOLANA_RPC_URL: patient.url }), `/api/kamino/${WALLET}`);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.obligations.length, 2);
  assert.ok(limited);

  const down = await call(await app(), `/api/kamino/${WALLET}`);
  assert.equal(down.status, 502);
  assert.doesNotMatch(down.body.error, /127\.0\.0\.1|fetch/);

  const { url } = await rpc(() => ({ error: { code: -32005, message: 'node is behind' } }));
  const failing = await call(await app({ SOLANA_RPC_URL: url }), `/api/kamino/${WALLET}`);
  assert.equal(failing.status, 502);
  assert.doesNotMatch(failing.body.error, /behind/);
});
