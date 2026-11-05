import type { Route } from '@playwright/test';
import { KLEND, KLEND_IDL, SIMULATION, WRONG_MARKET_RECIPE } from './fixtures.ts';
import { Gates } from './gates.ts';
import { KAMINO, type KaminoVariant } from './kamino.ts';
import { TOKENS } from './tokens.ts';

// The app's own /api, answered in the shapes of server/api.ts. A test picks a variant by setting a field before the page
// asks; the defaults are the happy path.

const LEGACY_IDL = 'This IDL is in the legacy pre-0.30 format, and only the simulator service converts it. It is not connected here (SIM_URL), so upload a 0.30+ IDL file instead.';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const RECIPE_ID = /^[0-9a-f]{32}$/;

/** Recipes the store holds before a test starts. */
export const RECIPES = {
  /** fixtures/klend-repay-wrong-market.recipe.json, the demo recipe that fails on Solana. */
  demo: 'de000000000000000000000000000001',
  /** Not a version 1 recipe. */
  corrupt: 'c0000000000000000000000000000002',
  /** The demo recipe with the obligation of its refresh left out, so it cannot be built. */
  unbuildable: 'b0000000000000000000000000000003',
  /** The demo recipe told to receive USDT, which none of its steps touches, so Connect would refuse it. */
  foreignToken: 'f0000000000000000000000000000004',
  /** A well-formed id the store does not have. */
  missing: 'a0000000000000000000000000000404',
};

function stored(): Map<string, unknown> {
  const demo = structuredClone(WRONG_MARKET_RECIPE);
  const unbuildable = structuredClone(WRONG_MARKET_RECIPE);
  const refresh = unbuildable.steps.find((step: { ixName: string }) => step.ixName === 'refresh_obligation');
  delete refresh.inputs.obligation;
  delete refresh.hints?.obligation;
  const foreignToken = { ...structuredClone(WRONG_MARKET_RECIPE), destination: { chain: 'sol', assetId: TOKENS.tokens[1].assetId, tokenAddress: TOKENS.tokens[1].contractAddress } };
  return new Map<string, unknown>([
    [RECIPES.demo, demo],
    [RECIPES.corrupt, { version: 2, steps: 'all of them' }],
    [RECIPES.unbuildable, unbuildable],
    [RECIPES.foreignToken, foreignToken],
  ]);
}

// listInstructions of packages/core/src/idl.ts, which flattens account groups
type IdlAccounts = ({ name: string } | { name: string; accounts: IdlAccounts })[];
const count = (accounts: IdlAccounts): number => accounts.reduce((sum, item) => sum + ('accounts' in item ? count(item.accounts) : 1), 0);
const idlAnswer = (idl: any) => ({
  idl,
  instructions: idl.instructions.map((ix: any) => ({ name: ix.name, docs: ix.docs, args: ix.args.length, accounts: count(ix.accounts) })),
});

export type ApiRoute = 'tokens' | 'idl' | 'parse' | 'simulate' | 'kamino' | 'recipes' | 'balance';

export class ApiMocks {
  /** GET /api/tokens. */
  tokens: 'normal' | 'empty' | 'error' | 'no-arbitrum' | 'no-usdc' = 'normal';
  /**
   * GET /api/idl/:programId for klend. `converted` is klend.idl.json, what the server answers with the simulator connected;
   * `recipe` is the IDL a recipe carries, so the published check matches. Any other valid key has no Anchor IDL.
   */
  idl: 'converted' | 'recipe' | 'legacy' | 'missing' | 'error' = 'converted';
  /** POST /api/simulate. */
  simulate: 'ok' | 'warn' | 'fail' | 'offline' = 'ok';
  /** GET /api/kamino/:wallet, for any valid address. An invalid one gets the server's 400 whatever this says. */
  kamino: KaminoVariant = 'healthy';
  /** GET /api/balance/:owner/:mint, in atomic units of the mint. */
  balance = '0';
  /** What the store holds, by id. POST /api/recipes adds to it. */
  readonly recipes = stored();
  /** Every /api request, in order. */
  readonly requests: { method: string; path: string; body?: unknown }[] = [];
  /** Requests no mock answers, which the fixture fails the test on. */
  readonly unexpected: string[] = [];
  private readonly gates = new Gates<ApiRoute>();
  private created = 0;

  /** Holds the next request to this route until `release`. */
  hold(kind: ApiRoute) {
    return this.gates.hold(kind);
  }

  async handle(route: Route, url: URL) {
    const request = route.request();
    const method = request.method();
    const path = url.pathname;
    const text = request.postData() ?? undefined;
    let body: unknown = text;
    try {
      body = text === undefined ? undefined : JSON.parse(text);
    } catch {
      // kept as text, which is what a bad upload is
    }
    this.requests.push({ method, path, body });
    const answer = (status: number, json: unknown) => route.fulfill({ status, json });
    const error = (status: number, message: string, extra: object = {}) => answer(status, { error: message, ...extra });
    let match: RegExpExecArray | null;

    if (method === 'GET' && path === '/api/tokens') {
      await this.gates.pass('tokens');
      if (this.tokens === 'error') return error(502, 'Intents Connect gave no token list (500)');
      if (this.tokens === 'empty') return answer(200, { tokens: [], sources: [] });
      if (this.tokens === 'no-arbitrum') return answer(200, { ...TOKENS, sources: TOKENS.sources.filter(token => token.blockchain !== 'arb') });
      // Connect takes USDC on every chain, and delivers none on Solana
      if (this.tokens === 'no-usdc') return answer(200, { ...TOKENS, tokens: TOKENS.tokens.filter(token => token.symbol !== 'USDC') });
      return answer(200, TOKENS);
    }

    if (method === 'GET' && (match = /^\/api\/idl\/([^/]+)$/.exec(path))) {
      await this.gates.pass('idl');
      const programId = decodeURIComponent(match[1]);
      if (!BASE58.test(programId)) return error(400, 'Not a public key');
      if (programId !== KLEND || this.idl === 'missing') return error(404, `Program ${programId} has no Anchor IDL account. Upload its IDL file instead.`, { upload: true });
      if (this.idl === 'legacy') return error(422, LEGACY_IDL, { legacy: true, upload: true });
      if (this.idl === 'error') return error(502, 'Could not read the IDL: the Solana RPC or the converter failed. Try again or upload a 0.30+ IDL file.', { upload: true });
      return answer(200, idlAnswer(this.idl === 'recipe' ? WRONG_MARKET_RECIPE.idls[KLEND] : KLEND_IDL));
    }

    if (method === 'POST' && path === '/api/idl/parse') {
      await this.gates.pass('parse');
      const programId = url.searchParams.get('programId');
      if (programId !== null && !BASE58.test(programId)) return error(400, 'Not a public key');
      if (typeof body !== 'object' || body === null) return error(400, 'The body is not JSON');
      const idl = body as Record<string, any>;
      // a pre-0.30 IDL names itself and has no address
      if (!idl.address && idl.name) return error(422, LEGACY_IDL, { legacy: true, upload: true });
      if (!Array.isArray(idl.instructions)) return error(422, 'Not an Anchor IDL: it has no instructions', { upload: true });
      return answer(200, idlAnswer(programId ? { ...idl, address: programId } : idl));
    }

    if (method === 'POST' && path === '/api/simulate') {
      await this.gates.pass('simulate');
      if (this.simulate === 'offline') return error(503, 'The simulator is offline: SIM_URL is not set');
      return answer(200, SIMULATION[this.simulate]);
    }

    if (method === 'POST' && path === '/api/recipes') {
      await this.gates.pass('recipes');
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return error(400, 'A recipe is a JSON object');
      const id = `e2e${String(++this.created).padStart(29, '0')}`;
      this.recipes.set(id, body);
      return answer(201, { id });
    }

    if (method === 'GET' && (match = /^\/api\/recipes\/([^/]+)$/.exec(path))) {
      await this.gates.pass('recipes');
      const id = decodeURIComponent(match[1]);
      if (!RECIPE_ID.test(id)) return error(400, 'Not a recipe id');
      return this.recipes.has(id) ? answer(200, this.recipes.get(id)) : error(404, 'No such recipe');
    }

    if (method === 'GET' && (match = /^\/api\/kamino\/([^/]+)$/.exec(path))) {
      await this.gates.pass('kamino');
      if (!BASE58.test(decodeURIComponent(match[1]))) return error(400, 'Not a public key');
      if (this.kamino === 'error') return error(502, 'Could not read the position from Solana, try again');
      return answer(200, { obligations: KAMINO[this.kamino] });
    }

    if (method === 'GET' && (match = /^\/api\/balance\/([^/]+)\/([^/]+)$/.exec(path))) {
      await this.gates.pass('balance');
      if (![match[1], match[2]].every(key => BASE58.test(key))) return error(400, 'Not a public key');
      // the intermediary's associated USDC account, which is where a bridge-in leaves what a run did not spend
      return answer(200, this.balance === '0' ? { account: null, tokenProgram: null, amount: '0' } : { account: 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B', tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', amount: this.balance });
    }

    this.unexpected.push(`${method} ${path}`);
    return error(404, 'No such API route');
  }
}
