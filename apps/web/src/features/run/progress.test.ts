import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionStatus, Phase } from '@aurora-is-near/intents-connect';
import { STAGE_OF } from '../../connect.ts';
import { BASE_USDC, SOLANA_USDC } from '../../kamino.ts';
import type { StageState } from '../../ui/Timeline.tsx';
import { flowOf, progressStages, type Flow } from './progress.ts';

const drawn = (status: ExecutionStatus | undefined, now: StageState, phase: Phase, flow?: Flow, at = status ? STAGE_OF[status] : -1) =>
  progressStages({ at, now, status, phase, flow, note: 'the note' });
/** Each stage as "name state", in the order drawn. */
const states = (...args: Parameters<typeof drawn>) => drawn(...args).map(({ id, state }) => `${id} ${state}`);
const noted = (...args: Parameters<typeof drawn>) => drawn(...args).find(({ description }) => description === 'the note')?.id;

test('a failed deposit fails at the deposit, and the stages after it are not reached, not done', () => {
  assert.deepEqual(states('DEPOSIT_FAILED', 'failed', 'failed'), ['Signature done', 'Deposit failed', 'Bridge unreached', 'Execution unreached', 'Result unreached']);
  assert.equal(noted('DEPOSIT_FAILED', 'failed', 'failed'), 'Deposit');
  assert.equal(drawn('DEPOSIT_FAILED', 'failed', 'failed').at(-1)!.title, 'Result');
});

test('instructions that failed on Solana fail at the execution, and the Result says the money waits with the intermediary', () => {
  const stages = drawn('OPERATION_FAILED', 'failed', 'failed');
  assert.deepEqual(stages.map(({ id, state }) => `${id} ${state}`), ['Signature done', 'Deposit done', 'Bridge done', 'Execution failed', 'Result paused']);
  assert.equal(noted('OPERATION_FAILED', 'failed', 'failed'), 'Execution');
  assert.equal(stages.at(-1)!.description, 'Money is with your intermediary');
});

test('a success is done all the way down, and its last stage says so', () => {
  const stages = drawn('SUCCESS', 'success', 'success');
  assert.deepEqual(stages.map(({ state }) => state), ['done', 'done', 'done', 'done', 'success']);
  assert.equal(stages.at(-1)!.title, 'Success');
});

test('a run in progress waits on the stages it has not reached', () => {
  assert.deepEqual(states('DEPOSIT_PROCESSING', 'active', 'settling'), ['Signature done', 'Deposit done', 'Bridge active', 'Execution pending', 'Result pending']);
  assert.equal(noted('DEPOSIT_PROCESSING', 'active', 'settling'), 'Bridge');
  // paused or declined is not over: the stages after it can still come
  assert.deepEqual(states('EXPIRED', 'paused', 'expired'), ['Signature done', 'Deposit paused', 'Bridge pending', 'Execution pending', 'Result pending']);
  assert.deepEqual(states('CREATED', 'failed', 'failed'), ['Signature failed', 'Deposit pending', 'Bridge pending', 'Execution pending', 'Result pending']);
  // before the execution exists
  assert.deepEqual(drawn(undefined, 'active', 'creating').map(({ state }) => state), ['pending', 'pending', 'pending', 'pending', 'pending']);
});

test('a cancel stops the stages where it was, and the rest are not reached', () => {
  assert.deepEqual(states(undefined, 'cancelled', 'cancelled', 'bridge-in', 1), ['Signature done', 'Deposit cancelled', 'Bridge unreached', 'Execution unreached', 'Result unreached']);
});

test('a run of steps needs no deposit and no bridge', () => {
  assert.deepEqual(states('OPERATION_PROCESSING', 'active', 'settling', 'steps-only'), ['Signature done', 'Deposit skipped', 'Bridge skipped', 'Execution active', 'Result pending']);
  assert.deepEqual(states('OPERATION_FAILED', 'failed', 'failed', 'steps-only'), ['Signature done', 'Deposit skipped', 'Bridge skipped', 'Execution failed', 'Result paused']);
  assert.deepEqual(states('SUCCESS', 'success', 'success', 'steps-only'), ['Signature done', 'Deposit skipped', 'Bridge skipped', 'Execution done', 'Result success']);
});

test('a Refund needs no deposit, runs its transfer on Solana, and crosses the bridge after it', () => {
  assert.deepEqual(states('OPERATION_PENDING', 'active', 'settling', 'refund'), ['Signature done', 'Deposit skipped', 'Execution active', 'Bridge pending', 'Result pending']);
  assert.deepEqual(states('SUCCESS', 'success', 'success', 'refund'), ['Signature done', 'Deposit skipped', 'Execution done', 'Bridge done', 'Result success']);
  const failed = drawn('OPERATION_FAILED', 'failed', 'failed', 'refund');
  assert.deepEqual(failed.map(({ id, state }) => `${id} ${state}`), ['Signature done', 'Deposit skipped', 'Execution failed', 'Bridge unreached', 'Result paused']);
  assert.equal(failed.at(-1)!.description, 'Money is still with your intermediary');
  // its transaction on the EVM chain is the bridge's, and a stage it never went through shows none
  const links = progressStages({ at: 4, now: 'success', status: 'SUCCESS', phase: 'success', flow: 'refund', links: [undefined, 'evm', undefined, 'solana'] });
  assert.deepEqual(
    links.map(({ id, link }) => `${id} ${link ?? '-'}`),
    ['Signature -', 'Deposit -', 'Execution solana', 'Bridge evm', 'Result -'],
  );
});

test('the flow comes from what the execution records', () => {
  assert.equal(flowOf(undefined), 'bridge-in');
  assert.equal(flowOf({ executionMode: 'steps_only' }), 'steps-only');
  assert.equal(flowOf({ metadata: { intentsConnectFlow: 'steps-only' }, quote: {} }), 'steps-only');
  assert.equal(flowOf({ executionMode: 'quote_with_steps', quote: { originAsset: BASE_USDC.assetId, destinationAsset: SOLANA_USDC } }), 'bridge-in');
  assert.equal(flowOf({ executionMode: 'quote_with_steps', quote: { originAsset: SOLANA_USDC, destinationAsset: BASE_USDC.assetId } }), 'refund');
});
