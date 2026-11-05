/** A request held open: `reached` resolves when the page sends it, `release` lets the answer go. */
export type Held = { reached: () => Promise<void>; release: () => void };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => (resolve = done));
  return { promise, resolve };
}

/**
 * Holds the next request of a kind until the test releases it, to see what the page shows while it waits. Each hold is
 * for one request, so polling and retries go on normally afterwards.
 */
export class Gates<Kind extends string> {
  private readonly held = new Map<Kind, { reached: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> }>();

  hold(kind: Kind): Held {
    const gate = { reached: deferred(), released: deferred() };
    this.held.set(kind, gate);
    return { reached: () => gate.reached.promise, release: () => gate.released.resolve() };
  }

  /** Called by the handler before it answers. */
  async pass(kind: Kind) {
    const gate = this.held.get(kind);
    if (!gate) return;
    this.held.delete(kind);
    gate.reached.resolve();
    await gate.released.promise;
  }
}
