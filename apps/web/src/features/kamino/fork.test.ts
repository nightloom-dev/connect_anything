import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SimResult } from '@connect-anything/core';
import { lastOf, shownCheck, unanswered, type ForkCheck } from './fork.ts';

// The pure part of the check on a fork (simulate.ts asks the simulator and keeps the state with these).

const OK: SimResult = { verdict: 'ok', computeUnits: 115_948, txBytes: 934, logs: [], warnings: [] };
const WARN: SimResult = { verdict: 'warn', computeUnits: 250_028, txBytes: 1134, logs: [], warnings: ['CU 250.0k > 200k'] };

test('the last answer is kept to show dimmed while the check asks again', () => {
  assert.equal(lastOf({ kind: 'done', result: OK }), OK);
  assert.equal(lastOf({ kind: 'checking', last: WARN }), WARN);
  assert.equal(lastOf({ kind: 'checking' }), undefined);
  // an offline or failed check has no answer to keep
  assert.equal(lastOf({ kind: 'offline', message: 'off' }), undefined);
  assert.equal(lastOf({ kind: 'failed', message: 'no answer' }), undefined);
  assert.equal(lastOf({ kind: 'idle' }), undefined);
});

test('a 503 is the simulator switched off, which holds nothing up; anything else is a failure to say', () => {
  assert.deepEqual(unanswered('The simulator is offline: SIM_URL is not set', 503), { kind: 'offline', message: 'The simulator is offline: SIM_URL is not set' });
  assert.deepEqual(unanswered('The server answered 500.', 500), { kind: 'failed', message: 'The server answered 500.' });
  // no answer at all: the network failed before any status
  assert.deepEqual(unanswered('The server could not be reached. Check your connection and try again.'), {
    kind: 'failed',
    message: 'The server could not be reached. Check your connection and try again.',
  });
});

test('nothing is checked without an amount or a recipe', () => {
  const done: ForkCheck = { kind: 'done', result: OK };
  assert.deepEqual(shownCheck({ check: done, atomic: undefined, settled: undefined, recipe: true }), { kind: 'idle' });
  assert.deepEqual(shownCheck({ check: done, atomic: '', settled: '', recipe: true }), { kind: 'idle' });
  assert.deepEqual(shownCheck({ check: done, atomic: '800000000', settled: '800000000', recipe: false }), { kind: 'idle' });
});

test('while a new amount waits to hold still, the check shows as asking, over the answer for the old one', () => {
  const done: ForkCheck = { kind: 'done', result: OK };
  assert.deepEqual(shownCheck({ check: done, atomic: '400000000', settled: '800000000', recipe: true }), { kind: 'checking', last: OK });
  // and once it held still, the check is the one for it
  assert.equal(shownCheck({ check: done, atomic: '800000000', settled: '800000000', recipe: true }), done);
  const failed: ForkCheck = { kind: 'failed', message: 'no answer' };
  assert.equal(shownCheck({ check: failed, atomic: '800000000', settled: '800000000', recipe: true }), failed);
  // a first amount has nothing to show dimmed
  assert.deepEqual(shownCheck({ check: { kind: 'idle' }, atomic: '800000000', settled: undefined, recipe: true }), { kind: 'checking', last: undefined });
});
