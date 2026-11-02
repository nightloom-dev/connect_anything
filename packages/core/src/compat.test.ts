import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Connection } from '@solana/web3.js';
import { checkCompat } from './compat.ts';
import { loadIdl, type Idl } from './index.ts';

// The IDL accounts in test/fixtures as mainnet gave them, read through loadIdl.
async function onChainIdl(name: string): Promise<Idl> {
  const { programId, address, data } = JSON.parse(readFileSync(new URL(`../test/fixtures/${name}.idl-account.json`, import.meta.url), 'utf8'));
  const connection = { getAccountInfo: async (key: { toBase58(): string }) => (key.toBase58() === address ? { data: Buffer.from(data, 'base64') } : null) };
  return loadIdl(programId, connection as unknown as Connection);
}
// klend has only a legacy IDL on chain, and this is its converted copy
const KLEND: Idl = JSON.parse(readFileSync(new URL('../../../recipes/kamino-rescue/klend.idl.json', import.meta.url), 'utf8'));

const SECOND_SIGNER = 'a second signer, and Connect signs only as the intermediary';
const KEYPAIR =
  'creating a keypair account is not supported: the new account would have to sign, and Connect signs only as the intermediary (inferred from the IDL: a writable signer that is not a PDA)';

test('klend repay_obligation_liquidity_v2 passes: its one signer is the intermediary', () => {
  assert.deepEqual(checkCompat(KLEND, 'repay_obligation_liquidity_v2'), []);
  assert.deepEqual(checkCompat(KLEND, 'refresh_reserve'), []);
});

test('a payer and an owner that both sign are both the intermediary', async () => {
  assert.deepEqual(checkCompat(KLEND, 'init_obligation'), []);
  assert.deepEqual(checkCompat(KLEND, 'repay_and_withdraw_and_redeem'), []);
  assert.deepEqual(checkCompat(await onChainIdl('jupiter_v6'), 'create_idempotent_associated_token_account'), []);
});

test('a second signer is refused', async () => {
  // the position of Meteora DLMM derived from a base key that has to sign next to the payer and the owner
  assert.deepEqual(checkCompat(await onChainIdl('meteora_dlmm'), 'initialize_position_pda'), [{ account: 'base', reason: SECOND_SIGNER }]);
});

test('init on a keypair account is refused', async () => {
  assert.deepEqual(checkCompat(await onChainIdl('meteora_dlmm'), 'initialize_position'), [{ account: 'position', reason: KEYPAIR }]);
  assert.deepEqual(checkCompat(await onChainIdl('jupiter_v6'), 'create_token_ledger'), [{ account: 'token_ledger', reason: KEYPAIR }]);
});

test('a signer that is a PDA or has a fixed address is refused, an optional one is left out', () => {
  const idl = {
    address: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
    metadata: { name: 'synthetic', version: '0.1.0', spec: '0.1.0' },
    instructions: [
      {
        name: 'act',
        discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
        accounts: [
          { name: 'user', writable: true, signer: true },
          { name: 'admin', signer: true, address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' },
          { name: 'vault', signer: true, pda: { seeds: [{ kind: 'const', value: [118, 97, 117, 108, 116] }] } },
          { name: 'co_signer', signer: true, optional: true },
        ],
        args: [],
      },
    ],
  } as unknown as Idl;
  assert.deepEqual(checkCompat(idl, 'act'), [
    { account: 'admin', reason: 'only 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM can sign, and Connect signs only as the intermediary' },
    { account: 'vault', reason: 'a PDA has to sign, which only a program that calls this one can do, and Connect signs only as the intermediary' },
  ]);
  assert.deepEqual(checkCompat(idl, 'nope'), [{ reason: 'nope is not an instruction of program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD' }]);
});
