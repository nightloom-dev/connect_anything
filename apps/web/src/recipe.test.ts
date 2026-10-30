import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { argFields, flatten, type Idl } from '@connect-anything/core';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { STAND_IN, buildRecipe, defaultValue, matchesPublished, parseStored, recipeCode, resolveStep, simulationRequest, toSolanaRecipe, variantValue, type StoredRecipe } from './recipe.ts';

const KLEND_IDL: Idl = JSON.parse(readFileSync(new URL('../../../packages/core/test/fixtures/klend.modern-idl.json', import.meta.url), 'utf8'));
const KLEND = KLEND_IDL.address;
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const VISITOR = '8FKDyH8gkPLTE6Jqm3vkLukeerf8FWJUSDjMKNfgrCpq';
const ATTACKER = 'GoD6qy7kDpJQgkV5cZqdXtJmmjGhNvLzmdJNofjMCCN8';
const SOME = 'PfqP2R8NB8gNjegeNrsjTVv4epj3WqcH8S58QQL5UwH';
const REPAY = 'repay_obligation_liquidity_v2';

const inputs = () => {
  const names = flatten(KLEND_IDL.instructions.find(ix => ix.name === REPAY)!.accounts).map(({ path }) => path);
  return Object.fromEntries(names.map(name => [name, SOME]));
};

const recipe = (overrides: Partial<StoredRecipe['steps'][number]> = {}): StoredRecipe => ({
  version: 1,
  destination: { chain: 'sol', assetId: 'nep141:sol-usdc.omft.near', tokenAddress: USDC },
  idls: { [KLEND]: KLEND_IDL },
  steps: [{ program: KLEND, ixName: REPAY, args: { liquidity_amount: '' }, inputs: inputs(), amountArg: 'liquidity_amount', ...overrides }],
});

// what travels through /api/recipes, so a test of it is a test of the link
const overTheWire = (stored: StoredRecipe) => parseStored(JSON.parse(JSON.stringify(stored)));

const refused = (change: (stored: any) => void, why: RegExp) => {
  const stored = JSON.parse(JSON.stringify(recipe()));
  change(stored);
  assert.throws(() => parseStored(stored), why);
};

test('a recipe survives the link and builds for whoever opens it', () => {
  const stored = overTheWire(recipe());
  const [{ accounts, instruction, args }] = buildRecipe(stored, VISITOR, '1234');
  assert.equal(args.liquidity_amount, '1234');
  assert.equal(instruction.programId.toBase58(), KLEND);
  assert.equal(accounts[0].pubkey, VISITOR, 'the signer is the visitor, not the stand-in');
  assert.ok(accounts[0].isSigner);
  assert.equal(instruction.data.readBigUInt64LE(8), 1234n);
});

test('what was written for the intermediary follows the one who runs it', () => {
  const obligation = 'repay_accounts.obligation';
  const stored = recipe({ inputs: { ...inputs(), [obligation]: STAND_IN } });
  const row = (intermediary: string) => buildRecipe(stored, intermediary, '1')[0].accounts.find(({ name }) => name === obligation)!;
  assert.equal(row(STAND_IN).pubkey, STAND_IN);
  assert.equal(row(VISITOR).pubkey, VISITOR);
  assert.ok(!JSON.stringify(buildRecipe(stored, VISITOR, '1')[0].accounts).includes(STAND_IN), 'no trace of the stand-in');
});

test('an account left to the name guess is the ATA of the one who runs it', () => {
  const { 'repay_accounts.user_source_liquidity': _guess, ...rest } = inputs();
  const stored = recipe({ inputs: { ...rest, 'repay_accounts.token_program': TOKEN_PROGRAM_ID.toBase58() } });
  const row = (intermediary: string) => buildRecipe(stored, intermediary, '1')[0].accounts.find(({ name }) => name === 'repay_accounts.user_source_liquidity')!;
  assert.equal(row(VISITOR).pubkey, getAssociatedTokenAddressSync(new PublicKey(SOME), new PublicKey(VISITOR), true).toBase58());
  assert.notEqual(row(VISITOR).pubkey, row(STAND_IN).pubkey);
});

test('Connect receives what the page lists: placeholders only for the signer, and no stand-in', async () => {
  const stored = recipe();
  const { steps } = await toSolanaRecipe(stored).buildSteps({ intermediary: VISITOR, userAddress: '0xabc', amount: '77' }, undefined);
  const [listed] = buildRecipe(stored, VISITOR, '77');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].programId, listed.instruction.programId.toBase58());
  assert.equal(steps[0].discriminator, listed.instruction.data.toString('hex'));
  assert.deepEqual(
    steps[0].accounts.map(({ pubkey, isSigner, isWritable }) => ({ pubkey, isSigner, isWritable })),
    listed.instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({ pubkey: pubkey.toBase58() === VISITOR ? '{INTERMEDIARY}' : pubkey.toBase58(), isSigner, isWritable })),
  );
  assert.ok(!JSON.stringify(steps).includes(STAND_IN));
});

test('the author cannot make anyone else sign or point a step at another program', () => {
  // a signer in the IDL is the intermediary whatever was typed or hinted for it
  const signer = 'repay_accounts.owner';
  const stored = recipe({ inputs: { ...inputs(), [signer]: ATTACKER }, hints: { [signer]: ATTACKER } });
  const [{ instruction }] = buildRecipe(stored, VISITOR, '1');
  const signers = instruction.keys.filter(key => key.isSigner).map(key => key.pubkey.toBase58());
  assert.deepEqual(signers, [VISITOR]);

  // a remaining account has no way to say it signs
  const crafted = JSON.parse(JSON.stringify(recipe({ remaining: [{ pubkey: ATTACKER, isWritable: true }] })));
  crafted.steps[0].remaining[0].isSigner = true;
  const [{ instruction: extra }] = buildRecipe(parseStored(crafted), VISITOR, '1');
  assert.deepEqual(extra.keys.at(-1), { pubkey: new PublicKey(ATTACKER), isSigner: false, isWritable: true });

  refused(stored => (stored.idls[KLEND].address = ATTACKER), /no IDL for its program/);
});

test('a malformed or forbidden recipe is refused with its reason', () => {
  refused(stored => (stored.version = 2), /version 1/);
  refused(stored => (stored.destination.tokenAddress = 'nope'), /target token/);
  refused(stored => delete stored.destination.assetId, /target token/);
  refused(stored => (stored.steps = []), /1 to 50 steps/);
  refused(stored => (stored.steps = Array(51).fill(stored.steps[0])), /1 to 50 steps/);
  refused(stored => (stored.lookupTables = Array(17).fill(KLEND)), /lookup tables/);
  refused(stored => (stored.steps[0].program = 'nope'), /has no program/);
  refused(stored => (stored.steps[0].program = '__proto__'), /has no program/);
  refused(stored => (stored.steps[0].ixName = 'nope'), /does not have/);
  refused(stored => (stored.steps[0].args = null), /no arguments/);
  refused(stored => (stored.steps[0].inputs = { a: 1 }), /account inputs/);
  refused(stored => (stored.steps[0].hints = { a: 1 }), /account hints/);
  refused(stored => (stored.steps[0].remaining = [{ pubkey: 'nope', isWritable: true }]), /remaining accounts/);
  refused(stored => (stored.steps[0].amountArg = 'nope'), /not an unsigned integer/);
  refused(stored => {
    const budget = 'ComputeBudget111111111111111111111111111111';
    stored.idls[budget] = { ...stored.idls[KLEND], address: budget };
    stored.steps[0].program = budget;
  }, /ComputeBudget/);
  for (const json of [null, [], 'x', 1]) assert.throws(() => parseStored(json), /version 1/);
});

test('the exported code and the simulation carry the same recipe', () => {
  const stored = recipe();
  const code = recipeCode(stored);
  assert.match(code, /le\(amount, 8\)/);
  assert.ok(!code.includes(STAND_IN), 'the code swaps the stand-in for the real intermediary');

  const request = simulationRequest(stored, '500');
  assert.deepEqual(request.fund, { mint: USDC, amount: '500' });
  assert.equal(request.intermediary, STAND_IN);
  assert.equal(Buffer.from(request.instructions[0].data, 'base64').readBigUInt64LE(8), 500n);
});

test('an IDL that says something else than the published one is told apart', () => {
  const stored = recipe();
  const copy = () => JSON.parse(JSON.stringify(KLEND_IDL));
  assert.ok(matchesPublished(stored, KLEND, copy()));

  const noDocs = copy();
  noDocs.instructions.forEach((ix: { docs?: string[] }) => delete ix.docs);
  assert.ok(matchesPublished(stored, KLEND, noDocs), 'documentation does not run');

  const reordered = copy();
  reordered.instructions = reordered.instructions.map((ix: object) => Object.fromEntries(Object.entries(ix).reverse()));
  assert.ok(matchesPublished(stored, KLEND, reordered), 'an uploaded copy can order its keys differently');

  const otherData = copy();
  otherData.instructions.find((ix: { name: string }) => ix.name === REPAY).discriminator[0] ^= 1;
  assert.ok(!matchesPublished(stored, KLEND, otherData));

  const otherAccount = copy();
  otherAccount.instructions.find((ix: { name: string }) => ix.name === REPAY).accounts[1].address = ATTACKER;
  assert.ok(!matchesPublished(stored, KLEND, otherAccount));

  const unknown = copy();
  unknown.instructions = unknown.instructions.filter((ix: { name: string }) => ix.name !== REPAY);
  assert.ok(!matchesPublished(stored, KLEND, unknown));
});

test('the empty form of every instruction of a real IDL has the shape the coder expects', () => {
  for (const { name } of KLEND_IDL.instructions) {
    for (const field of argFields(KLEND_IDL, name)) {
      assert.notEqual(defaultValue(field), undefined, `${name}.${field.name}`);
    }
  }
  const { accounts } = resolveStep(KLEND_IDL, recipe().steps[0], { intermediary: VISITOR, mint: USDC, amount: '1' });
  assert.equal(accounts.length, Object.keys(inputs()).length);
});

test('an enum, an option and a list start empty, and a huge array is refused, not expanded', () => {
  const u8 = { kind: 'int', type: 'u8', big: false, min: '0', max: '255' } as const;
  const u64 = { kind: 'int', type: 'u64', big: true, min: '0', max: '18446744073709551615' } as const;
  assert.equal(defaultValue({ kind: 'option', of: u64 }), null);
  assert.deepEqual(defaultValue({ kind: 'vec', of: u64 }), []);
  assert.equal(defaultValue({ kind: 'vec', of: u8 }), '');
  assert.equal(defaultValue({ kind: 'array', of: u8, len: 32 }), '');
  assert.deepEqual(defaultValue({ kind: 'array', of: u64, len: 2 }), ['', '']);
  assert.equal(defaultValue({ kind: 'bool' }), false);
  assert.equal(variantValue({ name: 'Plain', fields: [] }), 'Plain');
  assert.deepEqual(variantValue({ name: 'Rich', fields: [{ ...u64, name: 'x' }] }), { Rich: { x: '' } });
  assert.throws(() => defaultValue({ kind: 'array', of: u64, len: 1_000_000_000 }), /too large/);
});
