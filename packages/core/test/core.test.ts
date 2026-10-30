import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { BorshCoder } from '@coral-xyz/anchor';
import { Keypair, PublicKey, type Connection } from '@solana/web3.js';
import BN from 'bn.js';
import {
  LegacyIdlError,
  argFields,
  buildInstruction,
  listInstructions,
  loadIdl,
  parseIdl,
  type FieldType,
  type Idl,
} from '../src/index.ts';

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
const keyBytes = (key: string) => new PublicKey(key).toBuffer();

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

const ANY_KEY = Keypair.generate().publicKey.toBase58();

// Every kind of value the form schema promises, in an IDL small enough to read.
const ALL_TYPES = {
  address: KLEND,
  metadata: { name: 'all_types', version: '0.0.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'everything',
      discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
      accounts: [],
      args: [
        ...['u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16', 'i32', 'i64', 'i128'].map(type => ({ name: `an_${type}`, type })),
        { name: 'flag', type: 'bool' },
        { name: 'key', type: 'pubkey' },
        { name: 'text', type: 'string' },
        { name: 'blob', type: 'bytes' },
        { name: 'none', type: { option: 'u64' } },
        { name: 'some', type: { option: 'i64' } },
        { name: 'list', type: { vec: 'u16' } },
        { name: 'hash', type: { array: ['u8', 4] } },
        { name: 'pair', type: { defined: { name: 'Pair' } } },
        { name: 'alias', type: { defined: { name: 'Alias' } } },
        { name: 'unit_side', type: { defined: { name: 'Side' } } },
        { name: 'named_side', type: { defined: { name: 'Side' } } },
        { name: 'tuple_side', type: { defined: { name: 'Side' } } },
      ],
    },
  ],
  types: [
    { name: 'Pair', type: { kind: 'struct', fields: [{ name: 'a', type: 'u8' }, { name: 'b', type: { vec: { defined: { name: 'Tuple' } } } }] } },
    { name: 'Tuple', type: { kind: 'struct', fields: ['u64', 'bool'] } },
    { name: 'Alias', type: { kind: 'type', alias: 'u32' } },
    {
      name: 'Side',
      type: {
        kind: 'enum',
        variants: [{ name: 'Left' }, { name: 'Up', fields: [{ name: 'by', type: 'u128' }] }, { name: 'Down', fields: ['pubkey', 'u8'] }],
      },
    },
  ],
} as unknown as Idl;

const ALL_VALUES = {
  an_u8: 255,
  an_u16: '65535',
  an_u32: 4294967295,
  an_u64: '18446744073709551615',
  an_u128: '340282366920938463463374607431768211455',
  an_i8: -128,
  an_i16: -32768,
  an_i32: '-2147483648',
  an_i64: '-9223372036854775808',
  an_i128: '-170141183460469231731687303715884105728',
  flag: true,
  key: ANY_KEY,
  text: 'hello',
  blob: 'cafe',
  none: null,
  some: '-5',
  list: [1, 2],
  hash: 'deadbeef',
  pair: { a: 7, b: [{ 0: '9', 1: false }] },
  alias: 12,
  unit_side: 'Left',
  named_side: { Up: { by: '1' } },
  tuple_side: { Down: { 0: ANY_KEY, 1: 3 } },
};

test('the form schema describes every promised type as data', () => {
  const fields = argFields(ALL_TYPES, 'everything');
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));
  assert.deepEqual(
    ['an_u8', 'an_u64', 'an_i128'].map(n => {
      const { kind, big, min, max } = byName[n] as any;
      return [kind, big, min, max];
    }),
    [
      ['int', false, '0', '255'],
      ['int', true, '0', '18446744073709551615'],
      ['int', true, '-170141183460469231731687303715884105728', '170141183460469231731687303715884105727'],
    ],
  );
  assert.deepEqual(['flag', 'key', 'text', 'blob'].map(n => byName[n].kind), ['bool', 'pubkey', 'string', 'bytes']);
  assert.equal((byName.some as any).of.kind, 'int');
  assert.equal((byName.list as any).of.type, 'u16');
  assert.equal((byName.hash as any).len, 4);
  assert.equal((byName.alias as any).type, 'u32');
  assert.deepEqual((byName.pair as any).fields[1].of.fields.map((f: any) => f.name), ['0', '1']);
  assert.deepEqual((byName.unit_side as any).variants.map((v: any) => v.name), ['Left', 'Up', 'Down']);
});

test('every promised type encodes with the exact bytes and decodes through BorshCoder', () => {
  const { data } = buildInstruction(ALL_TYPES, 'everything', ALL_VALUES, []);
  const expected = [
    '0102030405060708',
    'ff',
    'ffff',
    'ffffffff',
    'ffffffffffffffff',
    'ffffffffffffffffffffffffffffffff',
    '80',
    '0080',
    '00000080',
    '0000000000000080',
    '00000000000000000000000000000080',
    '01',
    keyBytes(ANY_KEY).toString('hex'),
    '0500000068656c6c6f',
    '02000000cafe',
    '00',
    '01fbffffffffffffff',
    '0200000001000200',
    'deadbeef',
    '07010000000900000000000000' + '00',
    '0c000000',
    '00',
    '01' + '01000000000000000000000000000000',
    '02' + keyBytes(ANY_KEY).toString('hex') + '03',
  ].join('');
  assert.equal(data.toString('hex'), expected);

  const decoded = new BorshCoder(ALL_TYPES).instruction.decode(data) as { name: string; data: any };
  assert.equal(decoded.name, 'everything');
  assert.ok(new BN('-9223372036854775808').eq(decoded.data.an_i64));
  assert.equal(decoded.data.none, null);
  assert.equal(decoded.data.pair.b[0]['0'].toString(), '9');
  assert.ok('Left' in decoded.data.unit_side);
  assert.equal(decoded.data.named_side.Up.by.toString(), '1');
});

test('bad form values are refused with the path instead of encoding something else', () => {
  const refused = (patch: Record<string, unknown>, message: RegExp) =>
    assert.throws(() => buildInstruction(ALL_TYPES, 'everything', { ...ALL_VALUES, ...patch }, []), message);
  refused({ an_u64: '-1' }, /everything\.an_u64: -1 is out of range/);
  refused({ an_u64: '18446744073709551616' }, /out of range for u64/);
  refused({ an_u64: '' }, /not an integer/);
  refused({ an_u64: 2 ** 60 }, /not an integer/);
  refused({ an_u8: 256 }, /out of range for u8/);
  refused({ flag: 'false' }, /everything\.flag: not a boolean/);
  refused({ key: 'nope' }, /not a public key/);
  refused({ blob: 'abc' }, /not hex or bytes/);
  refused({ hash: 'dead' }, /expected 4 items, got 2/);
  refused({ hash: 'zzzzzzzz' }, /everything\.hash: not hex or bytes/);
  refused({ list: [1, 70000] }, /everything\.list\[1\]: 70000 is out of range/);
  refused({ pair: { a: 1, b: [], c: 2 } }, /unknown field "c"/);
  refused({ unit_side: 'Sideways' }, /not a variant of Side/);
  refused({ tuple_side: { Down: { 0: ANY_KEY } } }, /tuple_side\.Down\.1: missing/);
  refused({ typo: 1 }, /unknown field "typo"/);
  assert.throws(() => buildInstruction(ALL_TYPES, 'nothing', {}, []), /"nothing" is not in the IDL/);
});

test('unsupported IDL types fail on their own instruction with a clear error', () => {
  const idl = {
    ...ALL_TYPES,
    instructions: [
      { name: 'fine', discriminator: [1], accounts: [], args: [{ name: 'a', type: 'u8' }] },
      { name: 'coption', discriminator: [2], accounts: [], args: [{ name: 'a', type: { coption: 'u8' } }] },
      { name: 'recursive', discriminator: [3], accounts: [], args: [{ name: 'a', type: { defined: { name: 'Node' } } }] },
      { name: 'unknown', discriminator: [4], accounts: [], args: [{ name: 'a', type: { defined: { name: 'Gone' } } }] },
    ],
    types: [
      { name: 'Node', type: { kind: 'struct', fields: [{ name: 'next', type: { option: { defined: { name: 'Node' } } } }] } },
      { name: 'Account', type: { kind: 'struct', fields: [{ name: 'a', type: { coption: 'pubkey' } }] } },
    ],
  } as unknown as Idl;
  assert.equal(buildInstruction(idl, 'fine', { a: 1 }, []).data.toString('hex'), '0101');
  assert.throws(() => argFields(idl, 'coption'), /Unsupported IDL type/);
  assert.throws(() => argFields(idl, 'recursive'), /Recursive IDL type Node/);
  assert.throws(() => argFields(idl, 'unknown'), /Type Gone is missing/);
});

test('accounts must be complete, and extra ones are kept as remaining accounts', () => {
  const idl = {
    ...ALL_TYPES,
    instructions: [{ name: 'two', discriminator: [9], args: [], accounts: [{ name: 'a' }, { name: 'group', accounts: [{ name: 'b' }] }] }],
  } as unknown as Idl;
  const account = { pubkey: ANY_KEY, isSigner: false, isWritable: true };
  assert.throws(() => buildInstruction(idl, 'two', {}, [account]), /expected 2 accounts, got 1/);
  assert.throws(() => buildInstruction(idl, 'two', {}, [account, { ...account, pubkey: null }]), /no address for group\.b/);
  assert.equal(buildInstruction(idl, 'two', {}, [account, account, account]).keys.length, 3);
});

// A valid value for any field, at the top of its range so that every byte of it is exercised.
function sample(type: FieldType): unknown {
  switch (type.kind) {
    case 'int':
      return type.max;
    case 'float':
      return 1.5;
    case 'bool':
      return true;
    case 'pubkey':
      return ANY_KEY;
    case 'string':
      return 'text';
    case 'bytes':
      return 'cafe';
    case 'option':
      return sample(type.of);
    case 'vec':
      return [sample(type.of)];
    case 'array':
      return Array.from({ length: type.len }, () => sample(type.of));
    case 'struct':
      return Object.fromEntries(type.fields.map(f => [f.name, sample(f)]));
    case 'enum': {
      const variant = type.variants[type.variants.length - 1];
      return { [variant.name]: sample({ kind: 'struct', fields: variant.fields }) };
    }
  }
}

const OTHER_PROGRAMS = ['pump_amm', 'meteora_dlmm', 'jupiter_v6'];

for (const name of OTHER_PROGRAMS) {
  test(`${name}: every instruction gets a form and its encoding round-trips through the coder`, async () => {
    const idl = await onChainIdl(name);
    const coder = new BorshCoder(idl);
    assert.ok(idl.instructions.length > 10);
    for (const { name: ixName, accounts: count } of listInstructions(idl)) {
      const args = sample({ kind: 'struct', fields: argFields(idl, ixName) }) as Record<string, unknown>;
      const accounts = Array.from({ length: count }, () => ({ pubkey: ANY_KEY, isSigner: false, isWritable: false }));
      const { data } = buildInstruction(idl, ixName, args, accounts);
      const decoded = coder.instruction.decode(data) as { name: string; data: object };
      assert.equal(decoded.name, ixName);
      assert.equal(coder.instruction.encode(ixName, decoded.data).toString('hex'), data.toString('hex'), ixName);
    }
  });
}
