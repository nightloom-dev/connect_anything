import { useEffect, useState } from 'react';
import type { SimResult } from '@connect-anything/core';
import { simulationRequest, type StoredRecipe } from '../../recipe.ts';
import { FetchError, fetchJson } from '../../ui.tsx';
import { lastOf, shownCheck, unanswered, type ForkCheck } from './fork.ts';

export type { ForkCheck } from './fork.ts';

/** A value once it has held still for `ms`: the slider moves the amount at every step, and each step would be a simulation. */
export function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

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
        (error: Error) => live && setCheck(unanswered(error.message, error instanceof FetchError ? error.status : undefined)),
      );
    return () => {
      live = false;
    };
  }, [stored, settled, tick]);

  return { check: shownCheck({ check, atomic, settled, recipe: !!stored }), amount: settled, retry: () => setTick(value => value + 1) };
}
