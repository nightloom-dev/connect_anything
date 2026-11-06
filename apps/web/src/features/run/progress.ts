import type { ReactNode } from 'react';
import type { ExecutionStatus, Phase } from '@aurora-is-near/intents-connect';
import { STAGES, legs } from '../../connect.ts';
import type { StageState, TimelineStage } from '../../ui/Timeline.tsx';
import { HELD_NOTE } from './words.ts';

// What the stages of the run card show for a given execution. Display only: STAGE_OF says where an execution is, and this
// says how each stage looks from there, so that a stage the run never reached is never drawn as done.

/**
 * How a run reaches Solana, which decides the stages it goes through. A bridge-in deposits on the EVM chain and the bridge
 * delivers to Solana, where the instructions run. A run of steps (Retry) spends what the intermediary already holds, so it
 * deposits and bridges nothing. A Refund deposits nothing either: it runs its transfer on Solana, then crosses the bridge.
 */
export type Flow = 'bridge-in' | 'steps-only' | 'refund';

const DEPOSIT = STAGES.indexOf('Deposit');
const BRIDGE = STAGES.indexOf('Bridge');
const EXECUTION = STAGES.indexOf('Execution');
const RESULT = STAGES.length - 1;

/** The stages in the order a flow goes through them, by their place in STAGES. */
const ORDER: Record<Flow, number[]> = {
  'bridge-in': STAGES.map((_, index) => index),
  'steps-only': STAGES.map((_, index) => index),
  refund: [0, DEPOSIT, EXECUTION, BRIDGE, RESULT],
};

/** The stages a flow has no use for. */
const UNUSED: Record<Flow, number[]> = { 'bridge-in': [], 'steps-only': [DEPOSIT, BRIDGE], refund: [DEPOSIT] };

/** Where a failure broke the run. STAGE_OF puts both on the Result, where the run ended, which is not where it went wrong. */
const BROKE: Partial<Record<ExecutionStatus, number>> = { DEPOSIT_FAILED: DEPOSIT, OPERATION_FAILED: EXECUTION };

type Recorded = { executionMode?: string; metadata?: Record<string, unknown>; quote?: { originAsset?: string; destinationAsset?: string } };

/** The flow of an execution, from what it records. The SDK's own test for steps-only is not exported, so it is repeated here. */
export function flowOf(execution?: Recorded): Flow {
  if (execution?.executionMode === 'steps_only' || execution?.metadata?.intentsConnectFlow === 'steps-only') return 'steps-only';
  return legs(execution?.quote).isRefund ? 'refund' : 'bridge-in';
}

type Where = {
  /** The stage the page puts the execution at, by its place in STAGES, -1 before there is one. */
  at: number;
  /** How that stage looks. */
  now: StageState;
  status?: ExecutionStatus;
  phase: Phase;
  flow?: Flow;
  /** One line under the stage the run is at, or under the one where it broke. */
  note?: ReactNode;
  /** When it started, by the first stage. */
  time?: ReactNode;
  /** What each stage produced, by its place in STAGES. A Refund's transaction on the EVM chain is the bridge's. */
  links?: ReactNode[];
};

/**
 * The stages as the timeline draws them, in the order the flow goes through them. Before the stage the run is at: done.
 * After it: waiting while the run goes on, and not reached once it is over. A failure is drawn where it broke, and after
 * instructions that failed the Result says where the money is, waiting on the person. A stage the flow has no use for is
 * not needed from the start.
 */
export function progressStages({ at, now, status, phase, flow = 'bridge-in', note, time, links = [] }: Where): TimelineStage[] {
  const order = ORDER[flow];
  const unused = UNUSED[flow];
  const over = phase === 'cancelled' || status === 'SUCCESS' || (!!status && status in BROKE);
  const held = status === 'OPERATION_FAILED';
  // the place of the stage the run is at, or broke at, in this flow: one it has no use for passes to the next
  let current = order.indexOf((status && BROKE[status]) ?? at);
  while (current >= 0 && unused.includes(order[current])) current++;

  return order.map((index, place): TimelineStage => {
    const result = index === RESULT;
    const state: StageState = unused.includes(index)
      ? 'skipped'
      : place < current
        ? 'done'
        : place === current
          ? now
          : result && held
            ? 'paused'
            : over
              ? 'unreached'
              : 'pending';
    const link = flow === 'refund' ? (index === BRIDGE ? links[DEPOSIT] : index === DEPOSIT ? undefined : links[index]) : links[index];
    return {
      id: STAGES[index],
      title: result && status === 'SUCCESS' ? 'Success' : STAGES[index],
      state,
      description: place === current ? note : result && held ? HELD_NOTE[flow === 'refund' ? 'refund' : 'run'] : undefined,
      time: index === 0 ? time : undefined,
      link: state === 'skipped' || state === 'unreached' ? undefined : link || undefined,
    };
  });
}
