import { readFileSync } from 'node:fs';

// The repository's own fixtures, read once per worker. Nothing here is copied: a fixture that changes changes the mocks.
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

export const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';

/** klend 0.30+, as the simulator service converts the legacy IDL on chain. */
export const KLEND_IDL = read('../../../../recipes/kamino-rescue/klend.idl.json');

export const SIMULATION = {
  ok: read('../../../../fixtures/klend-repay.result.json'),
  warn: read('../../../../fixtures/klend-repay-six-reserves.result.json'),
  fail: read('../../../../fixtures/klend-repay-wrong-market.result.json'),
};

/** The demo recipe that fails on purpose: it repays against the JLP market. Its IDL is the annotated one of recipes/kamino-rescue. */
export const WRONG_MARKET_RECIPE = read('../../../../fixtures/klend-repay-wrong-market.recipe.json');

/** Its intermediary when it was built, which the simulation fixtures also use. */
export const STAND_IN = '3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7';

/** What GET /api/kamino answers for the wallet of server/fixtures/kamino-8FKDyH8g.rpc.json, written by record-kamino.ts. */
export const KAMINO_RECORDED = read('./data/kamino.json');
