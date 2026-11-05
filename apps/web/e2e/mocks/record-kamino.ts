// Writes data/kamino.json: what GET /api/kamino/:wallet answers for the wallet of server/fixtures/kamino-8FKDyH8g.rpc.json,
// produced by the server's own code against that recorded mainnet read, the way server/api.test.ts replays it.
// Run from apps/web after a change to readObligations: node e2e/mocks/record-kamino.ts
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../../server/api.ts';

const WALLET = '8FKDyH8gkPLTE6Jqm3vkLukeerf8FWJUSDjMKNfgrCpq';
const RECORDED: Record<string, unknown> = JSON.parse(readFileSync(new URL('../../server/fixtures/kamino-8FKDyH8g.rpc.json', import.meta.url), 'utf8'));
const OUT = new URL('./data/kamino.json', import.meta.url);

async function listen(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const rpc = await listen(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const { id, method, params = [] } = JSON.parse(body);
  const key = `${method} ${JSON.stringify(params)}`;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', id, ...(key in RECORDED ? { result: RECORDED[key] } : { error: { code: -32601, message: `not recorded: ${key.slice(0, 120)}` } }) }));
});

const recipesDir = mkdtempSync(join(tmpdir(), 'record-kamino-'));
const handle = createApi({ AURORA_KEY: 'record', CONNECT_API_URL: 'http://127.0.0.1:1', SOLANA_RPC_URL: rpc.url, RECIPES_DIR: recipesDir });
const app = await listen((req, res) => void handle(req, res, () => res.end('next')));

try {
  const response = await fetch(`${app.url}/api/kamino/${WALLET}`);
  const body = await response.json();
  if (response.status !== 200) throw new Error(`GET /api/kamino answered ${response.status}: ${JSON.stringify(body)}`);
  writeFileSync(OUT, `${JSON.stringify({ wallet: WALLET, ...body }, null, 2)}\n`);
  console.log(`${body.obligations.length} obligations written to ${OUT.pathname}`);
} finally {
  for (const { server } of [rpc, app]) {
    server.close();
    server.closeAllConnections();
  }
  rmSync(recipesDir, { recursive: true, force: true });
}
