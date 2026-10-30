import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { Connection } from '@solana/web3.js';
import { LegacyIdlError, listInstructions, loadIdl, parseIdl, type Idl } from '../src/index.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));

// A recorded getAccountInfo answer, so loadIdl runs its real decoding offline.
const recordedConnection = (name: string) => {
  const { address, data } = fixture(`${name}.idl-account.json`);
  return {
    getAccountInfo: async (key: { toBase58(): string }) => (key.toBase58() === address ? { data: Buffer.from(data, 'base64') } : null),
  } as unknown as Connection;
};
const programIdOf = (name: string): string => fixture(`${name}.idl-account.json`).programId;
const onChainIdl = (name: string) => loadIdl(programIdOf(name), recordedConnection(name));

// klend publishes only legacy IDLs, on chain and in @kamino-finance/klend-sdk 13.0.6. This is a converted copy,
// byte-identical to sava-software/idl-clients@88f5f31 (Apache-2.0), idl-clients-bundle/.../kamino/lend/gen/idl.json.
const KLEND_MODERN: Idl = fixture('klend.modern-idl.json');

const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';

async function legacyKlend() {
  const error = await onChainIdl('klend').catch(e => e);
  assert.ok(error instanceof LegacyIdlError);
  return error;
}

test('loadIdl says the on-chain klend IDL is legacy and keeps it for the converter', async () => {
  const error = await legacyKlend();
  assert.match(error.message, /legacy pre-0\.30/);
  assert.match(error.message, /kamino_lending 1\.27\.0/);
  assert.match(error.message, new RegExp(KLEND));
  assert.equal((error.idl as any).metadata.address, KLEND);
});

test('loadIdl reports a program without an IDL account', async () => {
  await assert.rejects(loadIdl(programIdOf('pump_amm'), recordedConnection('klend')), /no Anchor IDL account/);
});

test('parseIdl sends a legacy IDL to POST /idl/convert and surfaces the 400 message', async t => {
  const legacy = (await legacyKlend()).idl as any;
  const received: { url?: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    received.push({ url: req.url, body });
    res.setHeader('content-type', 'application/json');
    if (!body.metadata?.address) {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: 'Program id missing in `idl.metadata.address` field' }));
    } else {
      res.end(JSON.stringify(KLEND_MODERN));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const convertUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const converted = await parseIdl(legacy, { convertUrl });
  assert.equal(converted.address, KLEND);
  assert.equal(received[0].url, '/idl/convert');
  assert.equal(received[0].body.name, 'kamino_lending');

  const { metadata, ...withoutProgramId } = legacy;
  await assert.rejects(parseIdl(withoutProgramId, { convertUrl }), /400: Program id missing/);
  assert.equal((await parseIdl(withoutProgramId, { convertUrl, programId: KLEND })).address, KLEND);
  delete process.env.SIM_URL;
  await assert.rejects(parseIdl(legacy), LegacyIdlError);
});

test('parseIdl takes a modern IDL as it is, from an object or JSON text, and refuses anything else', async () => {
  assert.equal(await parseIdl(KLEND_MODERN), KLEND_MODERN);
  assert.equal((await parseIdl(JSON.stringify(KLEND_MODERN))).address, KLEND);
  await assert.rejects(parseIdl({ hello: 'world' }), /Not an Anchor IDL/);
  await assert.rejects(parseIdl('[1,2]'), /Not an Anchor IDL/);
});

test('the modern klend fixture matches the on-chain IDL instruction by instruction', async () => {
  const onChain = (await legacyKlend()).idl as any;
  const snake = (name: string) => name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
  const legacyShape = (items: any[]): unknown[] =>
    items.map(a => (a.accounts ? [snake(a.name), legacyShape(a.accounts)] : [snake(a.name), !!a.isMut, !!a.isSigner, !!a.isOptional]));
  const modernShape = (items: any[]): unknown[] =>
    items.map(a => (a.accounts ? [a.name, modernShape(a.accounts)] : [a.name, !!a.writable, !!a.signer, !!a.optional]));

  assert.deepEqual(
    KLEND_MODERN.instructions.map(ix => [ix.name, ix.args.map(a => a.name), modernShape(ix.accounts)]),
    onChain.instructions.map((ix: any) => [snake(ix.name), ix.args.map((a: any) => snake(a.name)), legacyShape(ix.accounts)]),
  );
});

test('modern on-chain IDLs load, and listInstructions counts accounts inside groups', async () => {
  const dlmm = await onChainIdl('meteora_dlmm');
  assert.equal(dlmm.address, programIdOf('meteora_dlmm'));
  const repay = listInstructions(KLEND_MODERN).find(ix => ix.name === 'repay_obligation_liquidity_v2');
  assert.deepEqual([repay?.args, repay?.accounts], [1, 13]);
});
