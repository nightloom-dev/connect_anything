import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionStatus, Phase } from '@aurora-is-near/intents-connect';
import { STAGE_OF } from '../../connect.ts';
import { BASE_USDC, SOLANA_USDC } from '../../kamino.ts';
import type { StageState } from '../../ui/Timeline.tsx';
import { enter, flowOf, progressStages, type Entered, type Flow } from './progress.ts';

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

/** What the page has seen after reading the execution at each of these statuses, one read a second from 4:54:00. */
const follow = (statuses: ExecutionStatus[], flow: Flow = 'bridge-in', id = 'exec-1', from: Entered = { last: -1, times: [] }) =>
  statuses.reduce((seen, status, read) => enter(seen, id, STAGE_OF[status], flow, () => `4:54:0${read}`), from);

test('each stage has the time the page saw the run move into it, and a stage passed between two reads the time it saw it past', () => {
  const seen = follow(['CREATED', 'DEPOSIT_PENDING', 'DEPOSIT_PROCESSING', 'OPERATION_PROCESSING', 'SUCCESS']);
  assert.deepEqual(seen.times, [undefined, '4:54:01', '4:54:02', '4:54:03', '4:54:04']);
  // the Bridge went by between two reads
  assert.deepEqual(follow(['CREATED', 'DEPOSIT_PENDING', 'OPERATION_PENDING']).times, [undefined, '4:54:01', '4:54:02', '4:54:02']);
  // a read at the same stage, or behind it, changes nothing
  const twice = follow(['CREATED', 'DEPOSIT_PENDING']);
  assert.equal(enter(twice, 'exec-1', STAGE_OF.EXPIRED, 'bridge-in', () => 'later'), twice);
  assert.equal(enter(twice, 'exec-1', STAGE_OF.CREATED, 'bridge-in', () => 'later'), twice);
});

test('a run the page found under way, as after a resume, has no time on the stages it found done, only on those it saw', () => {
  assert.deepEqual(follow(['DEPOSIT_PROCESSING']).times, []);
  assert.deepEqual(follow(['DEPOSIT_PROCESSING', 'OPERATION_PENDING', 'SUCCESS']).times, [undefined, undefined, undefined, '4:54:01', '4:54:02']);
  // another execution starts over
  const other = follow(['CREATED'], 'bridge-in', 'exec-2', follow(['CREATED', 'DEPOSIT_PENDING']));
  assert.deepEqual(other, { id: 'exec-2', last: 0, times: [] });
});

test('the times follow the order of the flow, and a stage the flow has no use for gets none it shows', () => {
  // a Refund runs its transfer before it crosses the bridge
  const refund = follow(['CREATED', 'OPERATION_PENDING', 'SUCCESS'], 'refund');
  assert.equal(refund.times[STAGE_OF.OPERATION_PENDING], '4:54:01');
  assert.equal(refund.times[STAGE_OF.DEPOSIT_PROCESSING], '4:54:02');
  // the stage a run of steps is shown at after its signature is the execution, so that is when it entered it
  const steps = follow(['CREATED', 'DEPOSIT_PENDING', 'OPERATION_PROCESSING'], 'steps-only');
  assert.equal(steps.times[STAGE_OF.OPERATION_PROCESSING], '4:54:01');
  const shown = progressStages({ at: 3, now: 'active', status: 'OPERATION_PROCESSING', phase: 'settling', flow: 'steps-only', times: steps.times });
  assert.deepEqual(shown.map(({ time }) => time), [undefined, undefined, undefined, '4:54:01', undefined]);
});

test('a time shows on a stage the run reached, never on one it did not, and the Signature has the time it started', () => {
  const times = [undefined, '4:54:31', '4:55:02', '4:55:20', '4:56:05'];
  const timed = (status: ExecutionStatus, now: StageState, phase: Phase) => progressStages({ at: STAGE_OF[status], now, status, phase, time: '4:54:12', times }).map(({ time }) => time);
  assert.deepEqual(timed('DEPOSIT_PROCESSING', 'active', 'settling'), ['4:54:12', '4:54:31', '4:55:02', undefined, undefined]);
  assert.deepEqual(timed('SUCCESS', 'success', 'success'), ['4:54:12', '4:54:31', '4:55:02', '4:55:20', '4:56:05']);
  // after a failed deposit the stages after it are not reached, though the page saw the run end there
  assert.deepEqual(timed('DEPOSIT_FAILED', 'failed', 'failed'), ['4:54:12', '4:54:31', undefined, undefined, undefined]);
  // after failed instructions the Result waits on the person, from when the page saw them fail
  assert.deepEqual(timed('OPERATION_FAILED', 'failed', 'failed'), ['4:54:12', '4:54:31', '4:55:02', '4:55:20', '4:56:05']);
  assert.deepEqual(
    progressStages({ at: 1, now: 'cancelled', phase: 'cancelled', time: '4:54:12', times }).map(({ time }) => time),
    ['4:54:12', '4:54:31', undefined, undefined, undefined],
  );
});
