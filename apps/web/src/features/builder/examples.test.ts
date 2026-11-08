import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { STAND_IN, buildRecipe, destinationIssue, parseStored, simulationRequest } from '../../recipe.ts';
import { EXAMPLES } from './examples.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../fixtures/${name}`, import.meta.url), 'utf8'));
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL = 'So11111111111111111111111111111111111111112';
const ataOf = (owner: string, mint: string) => getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true, TOKEN_PROGRAM_ID).toBase58();

for (const example of EXAMPLES) {
  const { fixture: name, steps } = example.ready;
  const recipe = parseStored(fixture(`${name}.recipe.json`));

  test(`the ready recipe of ${example.name} builds the request that ran on the fork`, () => {
    assert.equal(recipe.steps.length, steps);
    assert.ok(recipe.steps.every(step => step.program === example.program));
    // the instructions, byte for byte, and the IDLs the simulator named its errors from
    assert.deepEqual(JSON.parse(JSON.stringify(simulationRequest(recipe, '1000000'))), fixture(`${name}.sim.json`));
  });

  test(`the ready recipe of ${example.name} follows whoever runs it`, () => {
    const intermediary = Keypair.generate().publicKey.toBase58();
    const keys = buildRecipe(recipe, intermediary, '1000000').flatMap(({ instruction }) => instruction.keys.map(({ pubkey }) => pubkey.toBase58()));
    // nothing of the stand-in is left: not itself, and none of its token accounts
    for (const left of [STAND_IN, ataOf(STAND_IN, USDC), ataOf(STAND_IN, WSOL)]) assert.ok(!keys.includes(left), left);
    assert.equal(destinationIssue(recipe, intermediary), undefined);
  });
}
