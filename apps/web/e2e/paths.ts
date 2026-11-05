// One constant per page, so that a page that moves (the builder to /build, say) is a one-line change here.

/** The builder: program, instruction, simulation and run. */
export const BUILDER = '/';

/** Repay a Kamino debt. Takes ?wallet= and ?obligation=, the deep link of the Telegram watcher. */
export const KAMINO = '/kamino';

/** A recipe someone shared, by its id. */
export const shared = (id: string) => `/r/${id}`;

/** A path that is no page. */
export const NOT_FOUND = '/no-such-page';
