import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { utils } from '@coral-xyz/anchor';
import type { TransactionInstruction } from '@solana/web3.js';

// The instructions of a recorded getTransaction answer, with lookup tables resolved and tx-level flags.
export function recordedInstructions(name: string) {
  const tx = JSON.parse(readFileSync(new URL(`fixtures/${name}.tx.json`, import.meta.url), 'utf8'));
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

// Compiled flags belong to the whole transaction, where another instruction can raise them. `raised` names the accounts
// where that happened in the recording, so that every other flag has to match both ways.
export function assertSameInstruction(built: TransactionInstruction, real: ReturnType<typeof recordedInstructions>[number], raised: number[] = []) {
  assert.equal(built.programId.toBase58(), real.programId);
  assert.equal(built.data.toString('hex'), real.data.toString('hex'));
  assert.deepEqual(built.keys.map(k => k.pubkey.toBase58()), real.accounts.map(a => a.pubkey));
  built.keys.forEach((key, i) => {
    assert.equal(key.isSigner, real.accounts[i].isSigner, `account ${i} signer flag`);
    if (raised.includes(i)) assert.deepEqual([key.isWritable, real.accounts[i].isWritable], [false, true], `account ${i} should be raised`);
    else assert.equal(key.isWritable, real.accounts[i].isWritable, `account ${i} writable flag`);
  });
}
