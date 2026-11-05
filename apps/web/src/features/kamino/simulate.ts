import { useEffect, useState } from 'react';
import type { SimResult } from '@connect-anything/core';
import { simulationRequest, type StoredRecipe } from '../../recipe.ts';
import { FetchError, fetchJson } from '../../ui.tsx';

/** What a fork of mainnet says about the repay: nothing asked yet, asking, its answer, or why there is none. */
export type ForkCheck =
  | { kind: 'idle' }
  | { kind: 'checking'; /** The answer for the amount before, shown dimmed meanwhile. */ last?: SimResult }
  | { kind: 'done'; result: SimResult }
  | { kind: 'offline'; message: string }
  | { kind: 'failed'; message: string };

/** A value once it has held still for `ms`: the slider moves the amount at every step, and each step would be a simulation. */
function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const lastOf = (check: ForkCheck) => (check.kind === 'done' ? check.result : check.kind === 'checking' ? check.last : undefined);

/**
 * POST /api/simulate of the recipe the run card is given, with `atomic` delivered to a stand-in intermediary, as the builder
 * simulates. It only shows what the simulator says: the run neither waits for it nor reads it.
 */
export function useForkCheck(stored: StoredRecipe | undefined, atomic: string | undefined) {
  const settled = useSettled(atomic, 600);
  const [tick, setTick] = useState(0);
  const [check, setCheck] = useState<ForkCheck>({ kind: 'idle' });

  useEffect(() => {
    if (!stored || !settled) {
      setCheck({ kind: 'idle' });
      return;
    }
    let live = true;
    setCheck(previous => ({ kind: 'checking', last: lastOf(previous) }));
    Promise.resolve()
      .then(() => fetchJson<SimResult>('/api/simulate', { method: 'POST', body: JSON.stringify(simulationRequest(stored, settled)) }))
      .then(
        result => live && setCheck({ kind: 'done', result }),
        (error: Error) => live && setCheck(error instanceof FetchError && error.status === 503 ? { kind: 'offline', message: error.message } : { kind: 'failed', message: error.message }),
      );
    return () => {
      live = false;
    };
  }, [stored, settled, tick]);

  // a new amount is on its way while the old answer is still up
  const shown: ForkCheck = !atomic || !stored ? { kind: 'idle' } : atomic !== settled ? { kind: 'checking', last: lastOf(check) } : check;
  return { check: shown, amount: settled, retry: () => setTick(value => value + 1) };
}
