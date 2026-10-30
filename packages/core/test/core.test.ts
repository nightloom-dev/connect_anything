import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guards } from '@aurora-is-near/intents-connect';
import { prepareSolanaSteps } from '@aurora-is-near/intents-connect-wallet/solana';
import { BorshCoder, utils } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey, type Connection, type TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import {
  LegacyIdlError,
  argFields,
  buildInstruction,
  listInstructions,
  loadIdl,
  parseIdl,
  resolveAccounts,
  toRecipeCode,
  toSimRequest,
  type AccountHints,
  type FieldType,
  type Idl,
} from '../src/index.ts';
import { flatten } from '../src/idl.ts';

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
    for (const { name: ixName } of listInstructions(idl)) {
      const args = sample({ kind: 'struct', fields: argFields(idl, ixName) }) as Record<string, unknown>;
      // What the form would still ask for gets a filler key, so every instruction goes all the way to bytes.
      const accounts = resolveAccounts(idl, ixName, args, { intermediary: ANY_KEY }).map(a => ({ ...a, pubkey: a.pubkey ?? ANY_KEY }));
      const { data } = buildInstruction(idl, ixName, args, accounts);
      const decoded = coder.instruction.decode(data) as { name: string; data: object };
      assert.equal(decoded.name, ixName);
      assert.equal(coder.instruction.encode(ixName, decoded.data).toString('hex'), data.toString('hex'), ixName);
    }
  });
}

// The instructions of a recorded getTransaction answer, with lookup tables resolved and tx-level flags.
function recordedInstructions(name: string) {
  const tx = fixture(`${name}.tx.json`);
  assert.equal(tx.meta.err, null);
  const { accountKeys, header, instructions } = tx.transaction.message;
  const { writable = [], readonly = [] } = tx.meta.loadedAddresses ?? {};
  const keys: string[] = [...accountKeys, ...writable, ...readonly];
  const isSigner = (i: number) => i < header.numRequiredSignatures;
  const isWritable = (i: number) => {
    if (i >= accountKeys.length) return i < accountKeys.length + writable.length;
    return isSigner(i) ? i < header.numRequiredSignatures - header.numReadonlySignedAccounts : i < accountKeys.length - header.numReadonlyUnsignedAccounts;
  };
  return instructions.map((ix: any) => ({
    programId: keys[ix.programIdIndex],
    data: Buffer.from(utils.bytes.bs58.decode(ix.data)),
    accounts: ix.accounts.map((i: number) => ({ pubkey: keys[i], isSigner: isSigner(i), isWritable: isWritable(i) })),
  })) as { programId: string; data: Buffer; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[] }[];
}

function assertSameInstruction(built: TransactionInstruction, real: ReturnType<typeof recordedInstructions>[number]) {
  assert.equal(built.programId.toBase58(), real.programId);
  assert.equal(built.data.toString('hex'), real.data.toString('hex'));
  assert.deepEqual(built.keys.map(k => k.pubkey.toBase58()), real.accounts.map(a => a.pubkey));
  // Compiled flags belong to the whole transaction, where another instruction can raise them, so only one way holds.
  built.keys.forEach((key, i) => {
    if (key.isSigner) assert.ok(real.accounts[i].isSigner, `account ${i} should sign`);
    if (key.isWritable) assert.ok(real.accounts[i].isWritable, `account ${i} should be writable`);
  });
}

const FARMS = 'FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr';
const seedText = (text: string) => ({ kind: 'const', value: [...Buffer.from(text)] });

// No klend IDL anywhere has seeds or fixed addresses: the on-chain one has none and conversion cannot add them. These
// come from the public klend source (handler_repay_obligation_liquidity.rs, seeds.rs), and the comparison below with
// real transactions is what proves them. Without them these accounts stay form inputs, as the next test shows.
const KLEND_NOTES: Record<string, object> = {
  lending_market_authority: { pda: { seeds: [seedText('lma'), { kind: 'account', path: 'repay_accounts.lending_market' }] } },
  'repay_accounts.instruction_sysvar_account': { address: 'Sysvar1nstructions1111111111111111111111111' },
  'farms_accounts.obligation_farm_user_state': {
    pda: {
      seeds: [seedText('user'), { kind: 'account', path: 'reserve_farm_state' }, { kind: 'account', path: 'repay_accounts.obligation' }],
      program: { kind: 'const', value: [...new PublicKey(FARMS).toBuffer()] },
    },
  },
  farms_program: { address: FARMS },
};

function annotated(idl: Idl, ixName: string, notes: Record<string, object>): Idl {
  const copy = structuredClone(idl);
  const visit = (items: any[], prefix: string) => {
    for (const item of items) {
      if (item.accounts) visit(item.accounts, `${prefix}${item.name}.`);
      else Object.assign(item, notes[`${prefix}${item.name}`]);
    }
  };
  visit(copy.instructions.find(ix => ix.name === ixName)!.accounts, '');
  return copy;
}

const REPAY = 'repay_obligation_liquidity_v2';
const KLEND_REPAY = annotated(KLEND_MODERN, REPAY, KLEND_NOTES);

const namesOf = (idl: Idl, ixName: string) => flatten(idl.instructions.find(ix => ix.name === ixName)!.accounts).map(a => a.path);

// Hints for the named accounts, read from the real transaction. Everything not named here has to be found by the resolver.
const hintsFrom = (idl: Idl, ixName: string, real: { accounts: { pubkey: string }[] }, names: string[]): AccountHints => {
  const order = namesOf(idl, ixName);
  return Object.fromEntries(names.map(name => [name, real.accounts[order.indexOf(name)].pubkey]));
};

const repayCase = (name: string) => {
  const real = recordedInstructions(name).find(ix => ix.programId === KLEND && ix.data.subarray(0, 8).toString('hex') === '74aed54cb435d290')!;
  const owner = real.accounts[0].pubkey;
  const hints = hintsFrom(KLEND_REPAY, REPAY, real, [
    'repay_accounts.lending_market',
    'repay_accounts.repay_reserve',
    'repay_accounts.reserve_liquidity_mint',
    'repay_accounts.reserve_destination_liquidity',
    'repay_accounts.token_program',
  ]);
  const obligation = real.accounts[1].pubkey;
  return { real, owner, obligation, hints };
};

test('klend repay from a real transaction without farms: data, PDA, ATA, order and absent optionals', () => {
  const { real, owner, obligation, hints } = repayCase('klend-repay-plain');
  const args = { liquidity_amount: '491736661' };
  const accounts = resolveAccounts(KLEND_REPAY, REPAY, args, { intermediary: owner, inputs: { obligation } }, { ...hints, reserve_farm_state: null });
  const source = Object.fromEntries(accounts.map(a => [a.name, a.source]));

  assert.deepEqual(source, {
    'repay_accounts.owner': 'auto',
    'repay_accounts.obligation': 'input',
    'repay_accounts.lending_market': 'recipe',
    'repay_accounts.repay_reserve': 'recipe',
    'repay_accounts.reserve_liquidity_mint': 'recipe',
    'repay_accounts.reserve_destination_liquidity': 'recipe',
    'repay_accounts.user_source_liquidity': 'auto',
    'repay_accounts.token_program': 'recipe',
    'repay_accounts.instruction_sysvar_account': 'auto',
    'farms_accounts.obligation_farm_user_state': 'input',
    'farms_accounts.reserve_farm_state': 'recipe',
    lending_market_authority: 'auto',
    farms_program: 'auto',
  });
  const account = (name: string) => accounts.find(a => a.name === name)!;
  assert.equal(account('lending_market_authority').pubkey, '9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo');
  assert.equal(
    account('repay_accounts.user_source_liquidity').pubkey,
    getAssociatedTokenAddressSync(new PublicKey(hints['repay_accounts.reserve_liquidity_mint']!), new PublicKey(owner), true).toBase58(),
  );
  for (const name of ['farms_accounts.obligation_farm_user_state', 'farms_accounts.reserve_farm_state']) {
    assert.deepEqual([account(name).pubkey, account(name).isWritable], [KLEND, false]);
  }

  assertSameInstruction(buildInstruction(KLEND_REPAY, REPAY, args, accounts), real);
});

test('klend repay from a real transaction with farms: the farm PDA with its own program and u64::MAX', () => {
  const { real, owner, obligation, hints } = repayCase('klend-repay-farms');
  const accounts = resolveAccounts(KLEND_REPAY, REPAY, { liquidity_amount: '18446744073709551615' }, { intermediary: owner }, {
    ...hints,
    obligation,
    ...hintsFrom(KLEND_REPAY, REPAY, real, ['farms_accounts.reserve_farm_state']),
  });
  const farm = accounts.find(a => a.name === 'farms_accounts.obligation_farm_user_state')!;
  assert.equal(farm.source, 'auto');
  assert.equal(farm.pubkey, '3TCNjCm6vGJxcjzYug1VNXdsFPwJPtHcPh5rLSVfNdXj');
  assert.equal(farm.derived?.program, FARMS);
  assertSameInstruction(buildInstruction(KLEND_REPAY, REPAY, { liquidity_amount: '18446744073709551615' }, accounts), real);
});

test('what a klend IDL alone can resolve: the signer and the ATA, the rest stays for hints and inputs', () => {
  const owner = Keypair.generate().publicKey.toBase58();
  const accounts = resolveAccounts(KLEND_MODERN, REPAY, { liquidity_amount: '1' }, { intermediary: owner, mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' });
  assert.deepEqual(accounts.filter(a => a.source === 'auto').map(a => a.name), ['repay_accounts.owner', 'repay_accounts.user_source_liquidity']);
  assert.equal(accounts.find(a => a.name === 'lending_market_authority')?.pubkey, null);
  assert.throws(() => buildInstruction(KLEND_MODERN, REPAY, { liquidity_amount: '1' }, accounts), /no address for .*lending_market_authority/);
});

test('refresh_reserve and refresh_obligation resolve and encode as in the real transaction, and pass the SDK', () => {
  const [reserveA, reserveB, obligation, repay] = recordedInstructions('klend-repay-plain').filter(ix => ix.programId === KLEND);
  const owner = repay.accounts[0].pubkey;

  const refreshReserve = (real: typeof reserveA) => {
    const hints = hintsFrom(KLEND_MODERN, 'refresh_reserve', real, ['reserve', 'lending_market', 'scope_prices']);
    const accounts = resolveAccounts(KLEND_MODERN, 'refresh_reserve', {}, { intermediary: owner }, hints);
    assert.deepEqual(accounts.filter(a => a.pubkey === KLEND).map(a => a.name), ['pyth_oracle', 'switchboard_price_oracle', 'switchboard_twap_oracle']);
    const built = buildInstruction(KLEND_MODERN, 'refresh_reserve', {}, accounts);
    assertSameInstruction(built, real);
    return built;
  };
  const built = [refreshReserve(reserveA), refreshReserve(reserveB)];

  const refreshHints = hintsFrom(KLEND_MODERN, 'refresh_obligation', obligation, ['lending_market', 'obligation']);
  const refreshAccounts = resolveAccounts(KLEND_MODERN, 'refresh_obligation', {}, { intermediary: owner }, refreshHints);
  const remaining = obligation.accounts.slice(refreshAccounts.length);
  assert.equal(remaining.length, 2);
  const refresh = buildInstruction(KLEND_MODERN, 'refresh_obligation', {}, [...refreshAccounts, ...remaining]);
  assertSameInstruction(refresh, obligation);
  built.push(refresh);

  const { hints } = repayCase('klend-repay-plain');
  const args = { liquidity_amount: '491736661' };
  const inputs = { obligation: repay.accounts[1].pubkey };
  built.push(buildInstruction(KLEND_REPAY, REPAY, args, resolveAccounts(KLEND_REPAY, REPAY, args, { intermediary: owner, inputs }, { ...hints, reserve_farm_state: null })));

  const { steps } = prepareSolanaSteps(built, { intermediary: owner });
  guards.solanaStepsAreLegal(steps);
  assert.equal(steps.length, 4);
  assert.equal(steps[3].discriminator, repay.data.toString('hex'));
  assert.deepEqual(steps[3].accounts[0], { pubkey: '{INTERMEDIARY}', isSigner: true, isWritable: false });
  assert.ok(!JSON.stringify(steps).includes(owner), 'the intermediary must not stay in the steps');
  assert.ok(steps.flatMap(s => s.accounts).filter(a => a.isSigner).every(a => a.pubkey === '{INTERMEDIARY}'));
});

test('an unmodified on-chain IDL with a real transaction: pump_amm sell, with own-program seeds and ATAs by name', async () => {
  const idl = await onChainIdl('pump_amm');
  const real = recordedInstructions('pump_amm-sell').find(ix => ix.programId === programIdOf('pump_amm'))!;
  const args = { base_amount_in: real.data.readBigUInt64LE(8), min_quote_amount_out: real.data.readBigUInt64LE(16) };
  const hints = hintsFrom(idl, 'sell', real, [
    'global_config',
    'base_mint',
    'quote_mint',
    'pool_base_token_account',
    'pool_quote_token_account',
    'protocol_fee_recipient',
    'base_token_program',
    'quote_token_program',
    'coin_creator_vault_authority', // its seed is pool.coin_creator, a field inside account data
  ]);
  const pool = real.accounts[0].pubkey;
  const accounts = resolveAccounts(idl, 'sell', args, { intermediary: real.accounts[1].pubkey, inputs: { pool } }, hints);
  assert.deepEqual(accounts.filter(a => a.source === 'auto').map(a => a.name), [
    'user',
    'user_base_token_account',
    'user_quote_token_account',
    'protocol_fee_recipient_token_account',
    'system_program',
    'associated_token_program',
    'event_authority',
    'program',
    'coin_creator_vault_ata',
    'fee_config',
    'fee_program',
  ]);
  const remaining = real.accounts.slice(accounts.length);
  assertSameInstruction(buildInstruction(idl, 'sell', args, [...accounts, ...remaining]), real);
});

test('an unmodified on-chain IDL with a real transaction: meteora_dlmm, a negative i64 argument as a seed', async () => {
  const idl = await onChainIdl('meteora_dlmm');
  const real = recordedInstructions('meteora_dlmm-init-bin-array').find(ix => ix.programId === programIdOf('meteora_dlmm'))!;
  const args = { index: '-7' };
  const accounts = resolveAccounts(idl, 'initialize_bin_array', args, { intermediary: real.accounts[2].pubkey, inputs: { lb_pair: real.accounts[0].pubkey } });
  assert.deepEqual(accounts.map(a => a.source), ['input', 'auto', 'auto', 'auto']);
  assert.equal(accounts[1].derived?.seeds.length, 3);
  assertSameInstruction(buildInstruction(idl, 'initialize_bin_array', args, accounts), real);
  // The seed waits for the argument instead of failing the form.
  assert.equal(resolveAccounts(idl, 'initialize_bin_array', {}, { intermediary: ANY_KEY, inputs: { lb_pair: ANY_KEY } })[1].pubkey, null);
});

test('the resolver keeps the priority order, in any account order and inside groups', () => {
  const other = Keypair.generate().publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();
  const pda = (text: string) => ({ seeds: [seedText(text)] });
  const idl = {
    address: KLEND,
    metadata: { name: 'order', version: '0.0.0', spec: '0.1.0' },
    instructions: [
      {
        name: 'order',
        discriminator: [1],
        args: [],
        accounts: [
          { name: 'signer_first', signer: true, writable: true, address: other, pda: pda('a') },
          { name: 'address_second', address: other, pda: pda('a') },
          { name: 'user_token_account', pda: pda('b') },
          { name: 'user_source_token', optional: true },
          { name: 'plain_hinted' },
          { name: 'plain_asked' },
          { name: 'plain_open' },
          { name: 'optional_open', optional: true, writable: true },
          { name: 'optional_out', optional: true, writable: true, signer: true },
          { name: 'forward_seed', pda: { seeds: [{ kind: 'account', path: 'plain_hinted' }, { kind: 'account', path: 'group.inner.deep' }] } },
          { name: 'data_seed', pda: { seeds: [{ kind: 'account', path: 'plain_hinted.owner' }] } },
          { name: 'cycle_a', pda: { seeds: [{ kind: 'account', path: 'cycle_b' }] } },
          { name: 'cycle_b', pda: { seeds: [{ kind: 'account', path: 'cycle_a' }] } },
          { name: 'long_seed', pda: { seeds: [{ kind: 'const', value: Array(33).fill(1) }] } },
          {
            name: 'group',
            accounts: [
              { name: 'sibling', pda: pda('c') },
              { name: 'inner', accounts: [{ name: 'deep', pda: { seeds: [{ kind: 'account', path: 'sibling' }, { kind: 'account', path: 'group.sibling' }] } }] },
            ],
          },
        ],
      },
    ],
  } as unknown as Idl;
  const accounts = resolveAccounts(
    idl,
    'order',
    {},
    { intermediary: ANY_KEY, mint, inputs: { plain_asked: other, plain_hinted: mint } },
    { plain_hinted: other, optional_out: null, user_source_token: mint },
  );
  const get = (name: string) => accounts.find(a => a.name === name)!;
  const programPda = (...seeds: (string | Buffer)[]) =>
    PublicKey.findProgramAddressSync(seeds.map(s => (typeof s === 'string' ? Buffer.from(s) : s)), new PublicKey(KLEND))[0].toBase58();
  const sibling = programPda('c');
  const deep = programPda(keyBytes(sibling), keyBytes(sibling));

  assert.deepEqual([get('signer_first').pubkey, get('signer_first').source], [ANY_KEY, 'auto']);
  assert.deepEqual([get('address_second').pubkey, get('address_second').source], [other, 'auto']);
  assert.deepEqual([get('user_token_account').pubkey, get('user_token_account').source], [programPda('b'), 'auto']);
  // The ATA rule outranks the hint, and the funded mint stands in when the instruction names no mint.
  assert.deepEqual([get('user_source_token').pubkey, get('user_source_token').source], [getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(ANY_KEY), true).toBase58(), 'auto']);
  assert.deepEqual([get('plain_hinted').pubkey, get('plain_hinted').source], [other, 'recipe']);
  assert.deepEqual([get('plain_asked').pubkey, get('plain_asked').source], [other, 'input']);
  assert.deepEqual([get('plain_open').pubkey, get('plain_open').source], [null, 'input']);
  assert.deepEqual([get('optional_open').pubkey, get('optional_open').isWritable, get('optional_open').source], [KLEND, false, 'input']);
  assert.deepEqual([get('optional_out').pubkey, get('optional_out').isSigner, get('optional_out').source], [KLEND, false, 'recipe']);
  assert.equal(get('group.sibling').pubkey, sibling);
  assert.equal(get('group.inner.deep').pubkey, deep);
  assert.equal(get('forward_seed').pubkey, programPda(keyBytes(other), keyBytes(deep)));
  assert.equal(get('forward_seed').derived?.seeds.length, 2);
  for (const name of ['data_seed', 'cycle_a', 'cycle_b', 'long_seed']) assert.deepEqual([get(name).pubkey, get(name).source], [null, 'input']);

  assert.throws(() => resolveAccounts(idl, 'order', {}, { intermediary: '{INTERMEDIARY}' }), /ctx\.intermediary: not a public key/);
  assert.throws(() => resolveAccounts(idl, 'order', {}, { intermediary: ANY_KEY }, { plain_hinted: 'nope' }), /plain_hinted: not a public key/);
});

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// The whole Kamino sequence for any intermediary: what is specific to the position comes from the real transaction.
function kaminoSteps(intermediary: string) {
  const [reserveA, reserveB, obligation, repay] = recordedInstructions('klend-repay-plain').filter(ix => ix.programId === KLEND);
  const refreshReserve = (real: typeof reserveA) => {
    const hints = hintsFrom(KLEND_MODERN, 'refresh_reserve', real, ['reserve', 'lending_market', 'scope_prices']);
    return { idl: KLEND_MODERN, ixName: 'refresh_reserve', args: {}, accounts: resolveAccounts(KLEND_MODERN, 'refresh_reserve', {}, { intermediary }, hints) };
  };
  const refreshHints = hintsFrom(KLEND_MODERN, 'refresh_obligation', obligation, ['lending_market', 'obligation']);
  const refreshAccounts = resolveAccounts(KLEND_MODERN, 'refresh_obligation', {}, { intermediary }, refreshHints);
  const { hints } = repayCase('klend-repay-plain');
  const repayAccounts = (amount: string) =>
    resolveAccounts(KLEND_REPAY, REPAY, { liquidity_amount: amount }, { intermediary, inputs: { obligation: repay.accounts[1].pubkey } }, { ...hints, reserve_farm_state: null });
  return {
    refreshes: [
      refreshReserve(reserveA),
      refreshReserve(reserveB),
      { idl: KLEND_MODERN, ixName: 'refresh_obligation', args: {}, accounts: [...refreshAccounts, ...obligation.accounts.slice(refreshAccounts.length)] },
    ],
    repay: (amount: string) => ({ idl: KLEND_REPAY, ixName: REPAY, args: { liquidity_amount: amount }, accounts: repayAccounts(amount) }),
  };
}

test('toSimRequest follows the /simulate contract with any key as the intermediary', () => {
  const { refreshes, repay } = kaminoSteps(ANY_KEY);
  const built = [...refreshes, repay('1000000')].map(s => buildInstruction(s.idl, s.ixName, s.args, s.accounts));
  const fund = { mint: USDC, amount: '1000000' };
  const request = toSimRequest(built, { intermediary: ANY_KEY, fund, lookupTables: [KLEND], idls: { [KLEND]: KLEND_MODERN } });

  assert.deepEqual(Object.keys(request).sort(), ['fund', 'idls', 'instructions', 'intermediary', 'lookupTables']);
  assert.deepEqual(request.fund, fund);
  assert.equal(request.instructions.length, 4);
  const last = request.instructions[3];
  assert.deepEqual(Object.keys(last).sort(), ['accounts', 'data', 'programId']);
  assert.equal(last.programId, KLEND);
  assert.equal(Buffer.from(last.data, 'base64').toString('hex'), '74aed54cb435d29040420f0000000000');
  assert.deepEqual(last.accounts[0], { pubkey: ANY_KEY, isSigner: true, isWritable: false });
  assert.ok(!JSON.stringify(request).includes('{INTERMEDIARY}'));
  // Optional fields disappear on the wire when they are not given.
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(toSimRequest(built, { intermediary: ANY_KEY, fund })))).sort(), ['fund', 'instructions', 'intermediary']);
});

test('toRecipeCode exports a recipe that gives the same steps for another intermediary and amount', async t => {
  const generatedWith = Keypair.generate().publicKey.toBase58();
  const { refreshes, repay } = kaminoSteps(generatedWith);
  const destination = { chain: 'sol' as const, assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', tokenAddress: USDC };
  const meta = { id: 'kamino-rescue', intent: 'kamino_repay', title: 'Repay "a" Kamino debt', destination, intermediary: generatedWith };
  const code = toRecipeCode([...refreshes, { ...repay('5'), amountArg: 'liquidity_amount' }], meta);

  // Inside the package, so that the code resolves its imports the way a consumer's would.
  const dir = mkdtempSync(fileURLToPath(new URL('.generated-', import.meta.url)));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'recipe.ts');
  writeFileSync(file, code);
  const { recipe } = await import(pathToFileURL(file).href);
  assert.deepEqual([recipe.id, recipe.intent, recipe.title, recipe.type, recipe.flow], ['kamino-rescue', 'kamino_repay', 'Repay "a" Kamino debt', 'solana', 'bridge-in']);
  assert.deepEqual(recipe.destination, destination);

  const user = Keypair.generate().publicKey.toBase58();
  const amount = '1234567';
  const actual = recipe.buildSteps({ intermediary: user, userAddress: '0x0', amount });

  const direct = kaminoSteps(user);
  const built = [...direct.refreshes, direct.repay(amount)].map(s => buildInstruction(s.idl, s.ixName, s.args, s.accounts));
  assert.deepEqual(actual, prepareSolanaSteps(built, { intermediary: user }));
  guards.solanaStepsAreLegal(actual.steps);

  const steps = actual.steps;
  assert.equal(steps[3].discriminator, '74aed54cb435d29087d6120000000000');
  assert.equal(steps[3].accounts[0].pubkey, '{INTERMEDIARY}');
  const mint = new PublicKey(steps[3].accounts[4].pubkey);
  assert.equal(steps[3].accounts[6].pubkey, getAssociatedTokenAddressSync(mint, new PublicKey(user), true).toBase58());
  assert.ok(!code.includes(generatedWith), 'nothing of the key used for generation may stay in the code');

  assert.throws(() => recipe.buildSteps({ intermediary: user, userAddress: '0x0', amount: '18446744073709551616' }), /does not fit 8 bytes/);
  assert.throws(() => recipe.buildSteps({ intermediary: user, userAddress: '0x0', amount: '' }), /does not fit/);
  assert.throws(() => toRecipeCode([{ ...repay('5'), amountArg: 'nope' }], meta), /amountArg "nope"/);
  assert.throws(() => toRecipeCode([{ ...repay('5'), accounts: repay('5').accounts.map(a => ({ ...a, pubkey: null })) }], meta), /no address for/);
});

test('toRecipeCode keeps an untrusted IDL name out of the code', () => {
  const idl = {
    address: KLEND,
    metadata: { name: 'x', version: '0', spec: '0.1.0' },
    instructions: [{ name: 'evil\nprocess.exit(1)', discriminator: [1], args: [], accounts: [] }],
  } as unknown as Idl;
  const destination = { chain: 'sol' as const, assetId: 'x' };
  const code = toRecipeCode([{ idl, ixName: 'evil\nprocess.exit(1)', args: {}, accounts: [] }], { id: 'a', intent: 'b', title: '\'; process.exit(1); //', destination, intermediary: ANY_KEY });
  assert.ok(!code.split('\n').some(line => line.trim().startsWith('process.exit')));
  assert.ok(code.includes(`title: ${JSON.stringify("'; process.exit(1); //")}`));
  assert.ok(!code.includes('const le ='), 'helpers the code does not use are left out');
});
