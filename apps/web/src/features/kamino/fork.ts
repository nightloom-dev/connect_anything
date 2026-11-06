import type { SimResult } from '@connect-anything/core';

// What the check on a fork shows, worked out from what it knows. No React and no fetch here, so that the tests run it
// in node; simulate.ts asks the simulator and keeps the state.

/** What a fork of mainnet says about the repay: nothing asked yet, asking, its answer, or why there is none. */
export type ForkCheck =
  | { kind: 'idle' }
  | { kind: 'checking'; /** The answer for the amount before, shown greyed meanwhile. */ last?: SimResult }
  | { kind: 'done'; result: SimResult }
  | { kind: 'offline'; message: string }
  | { kind: 'failed'; message: string };

/** The last answer the check has, to show greyed while it asks again. */
export const lastOf = (check: ForkCheck) => (check.kind === 'done' ? check.result : check.kind === 'checking' ? check.last : undefined);

/** Why POST /api/simulate gave no answer, from the server's status if it answered: 503 is the simulator switched off. */
export const unanswered = (message: string, status?: number): ForkCheck => (status === 503 ? { kind: 'offline', message } : { kind: 'failed', message });

type Shown = {
  /** The check as it stands, for the last amount that held still. */
  check: ForkCheck;
  /** The amount on the screen now, in atomic units, if the target asks for one. */
  atomic: string | undefined;
  /** That amount once it has held still. */
  settled: string | undefined;
  /** Whether there is a recipe to simulate. */
  recipe: boolean;
};

/** What the card shows: nothing to check, or checking while a new amount is on its way and the old answer is still up. */
export function shownCheck({ check, atomic, settled, recipe }: Shown): ForkCheck {
  if (!atomic || !recipe) return { kind: 'idle' };
  return atomic !== settled ? { kind: 'checking', last: lastOf(check) } : check;
}
