import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertText, decide, parseCommand, type Position, type Watch } from './rules.ts';

const position = (ltv: number): Position => ({ address: 'Obl1gat1onAddressXXXXXXXXXXXXXXXXXXXXXXXX', ltv, liquidationLtv: 0.8, debtUsd: 4, collateralUsd: 7.47 });
const watch = (line: number | null, alerted: string[] = []): Watch => ({ chat: 1, wallet: 'W', line, alerted });

test('a position rings once at its line, 10 points under liquidation unless a line is named', () => {
  assert.equal(decide(watch(null), position(0.69)), null);
  assert.equal(decide(watch(null), position(0.71)), 'alert');
  assert.equal(decide(watch(0.5), position(0.54)), 'alert');
  assert.equal(decide(watch(null, [position(0).address]), position(0.75)), null);
});

test('a position that rang rings again only after it falls 3 points under its line', () => {
  const rang = watch(null, [position(0).address]);
  assert.equal(decide(rang, position(0.68)), null);
  assert.equal(decide(rang, position(0.66)), 'rearm');
});

test('commands take a Solana wallet and a line in percent', () => {
  const wallet = 'Htz3x4Uhsfa31JZszXhhdUNvKAdMuP4KruRyZdMYjiwc';
  assert.deepEqual(parseCommand(`/watch ${wallet}`), { kind: 'watch', wallet, line: null });
  assert.deepEqual(parseCommand(`/watch@SomeBot ${wallet} 65%`), { kind: 'watch', wallet, line: 0.65 });
  assert.deepEqual(parseCommand(`/unwatch ${wallet}`), { kind: 'unwatch', wallet });
  assert.equal(parseCommand('/watch 0x8825b6fEd25BC0639c62ac9526ba2F9B28951dDA')?.kind, 'error');
  assert.equal(parseCommand(`/watch ${wallet} 120`)?.kind, 'error');
  assert.equal(parseCommand('hello'), null);
});

test('the alert links to the page with the wallet and the position filled in', () => {
  const text = alertText(position(0.72), 0.7, 'https://app.example', 'W');
  assert.match(text, /LTV 72\.0%, over the line of 70\.0%\. It is liquidated at 80\.0%/);
  assert.match(text, /https:\/\/app\.example\/kamino\?wallet=W&obligation=Obl1gat1onAddressXXXXXXXXXXXXXXXXXXXXXXXX$/);
});
