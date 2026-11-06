import { useEffect, useSyncExternalStore } from 'react';

// Whether a run is in flight on this page, for what lives outside the run card, such as the header's wallet menu: a
// disconnect then leaves the run without the wallet it is followed with. Display only, and kept apart from the run card's
// code, since the wallet menu loads on every page.

/** One token for each run card that has a run in flight. */
const running = new Set<object>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Why the wallet menu does not disconnect meanwhile. */
export const RUN_BUSY_NOTE = 'A run is in progress. Disconnect once it ends.';

/** Says that a run is in flight for as long as `busy` holds and the caller is mounted. */
export function usePublishRunBusy(busy: boolean) {
  useEffect(() => {
    if (!busy) return;
    const token = {};
    running.add(token);
    notify();
    return () => {
      running.delete(token);
      notify();
    };
  }, [busy]);
}

/** Whether a run is in flight anywhere on the page. */
export const useRunBusy = () => useSyncExternalStore(subscribe, () => running.size > 0, () => false);
