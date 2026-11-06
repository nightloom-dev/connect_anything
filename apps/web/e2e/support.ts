import { test as base, expect, type Page, type Route } from '@playwright/test';
import { counts, isKnownNoise } from './console.ts';
import { ApiMocks } from './mocks/api.ts';
import { FakeConnect } from './mocks/connect.ts';
import { stubExternal } from './mocks/external.ts';
import { MockWallet } from './wallet.ts';

export { expect };

// Every request of a test's browser context is answered here, so a test never reaches the network or the dev server's
// own /api (which would call Solana and Connect with a fake key):
//   /api/intents-connect/* (the create proxy) and Connect's /api/v1/* on any host → the fake Connect
//   any other /api/*                                                          → the /api mocks
//   the page and its modules                                                  → the dev server
//   third parties                                                             → stubs, and anything else is aborted and fails the test

const CONNECT_PROXY = '/api/intents-connect';

type Network = {
  /** External requests nothing answered. The test fails if there is any. */
  unexpected: string[];
};

type Fixtures = {
  /** The app's own /api. Set a variant before the page asks. */
  api: ApiMocks;
  /** The fake Intents Connect. */
  connect: FakeConnect;
  /** The mock EVM wallet, installed in the page before it loads. */
  wallet: MockWallet;
  /** Console errors, warnings and failed asserts of the page, and its uncaught exceptions, in order: all but the known
   * noise of console.ts. The test fails if there is any. */
  problems: string[];
  network: Network;
};

const isLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';
// Patterns rather than a predicate, so that Playwright lets the page's ~100 modules through without asking this process.
const LOCAL = String.raw`https?://(localhost|127\.0\.0\.1)(:\d+)?/`;
const LOCAL_API = new RegExp(`^${LOCAL}api/`);
const ELSEWHERE = new RegExp(`^(?!${LOCAL})`);

async function dispatch(route: Route, { api, connect, network }: { api: ApiMocks; connect: FakeConnect; network: Network }) {
  const url = new URL(route.request().url());
  if (isLocal(url)) {
    if (url.pathname.startsWith(`${CONNECT_PROXY}/`)) return connect.handle(route, url.pathname.slice(CONNECT_PROXY.length), url);
    if (url.pathname.startsWith('/api/')) return api.handle(route, url);
    return route.continue();
  }
  // wherever CONNECT_API_URL points
  if (url.pathname.startsWith('/api/v1/executions') || url.pathname === '/api/v1/supported_tokens') return connect.handle(route, url.pathname, url);
  if (await stubExternal(route, url)) return;
  network.unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
  return route.abort('blockedbyclient');
}

export const test = base.extend<Fixtures>({
  api: async ({}, use) => use(new ApiMocks()),
  connect: async ({}, use) => use(new FakeConnect()),
  problems: async ({}, use) => use([]),
  network: async ({}, use) => use({ unexpected: [] }),

  context: async ({ context, api, connect, network }, use) => {
    for (const pattern of [LOCAL_API, ELSEWHERE]) await context.route(pattern, route => dispatch(route, { api, connect, network }));
    // nothing the page opens to a third party gets through, and Vite's own socket is local
    await context.routeWebSocket(url => !isLocal(url), () => {});
    await use(context);
  },

  page: async ({ page, problems, api, connect, network }, use, testInfo) => {
    page.on('console', message => {
      const type = message.type();
      if (!counts(type)) return;
      const text = message.text();
      if (!isKnownNoise({ type, text, url: message.location().url })) problems.push(`console ${type}: ${text}`);
    });
    page.on('pageerror', error => problems.push(`uncaught: ${error.message}`));
    await use(page);
    if (problems.length) await testInfo.attach('console problems', { body: problems.join('\n'), contentType: 'text/plain' });
    const unmocked = [...network.unexpected, ...api.unexpected.map(call => `app ${call}`), ...connect.unexpected.map(call => `Connect ${call}`)];
    // React's warnings are console errors of its development build; third-party noise is listed in console.ts
    expect.soft(problems, 'console errors, warnings and uncaught exceptions').toEqual([]);
    expect(unmocked, 'requests no mock answered').toEqual([]);
  },

  wallet: async ({ page }, use) => {
    const wallet = new MockWallet(page);
    await wallet.install();
    await use(wallet);
  },
});

/** A notice of the page (info, warn, ok) by a phrase of it. Errors are alerts, see `alertOf`. */
export const statusOf = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });

/** An error notice of the page by a phrase of it. */
export const alertOf = (page: Page, text: string | RegExp) => page.getByRole('alert').filter({ hasText: text });

/**
 * Skips the runner's 3 s sleeps between polls until `done` holds. Needs `page.clock.install()` before the page loads;
 * the clock otherwise runs as usual, so everything else on the page keeps its own pace.
 */
export async function pollUntil(page: Page, done: () => Promise<boolean>, { step = 3_000, tries = 20 } = {}) {
  for (let left = tries; left > 0; left--) {
    if (await done()) return;
    await page.clock.fastForward(step);
    // the poll goes over the (mocked) network, which takes real time
    await page.waitForTimeout(50);
  }
  if (!(await done())) throw new Error(`Still waiting after ${tries} skipped polls`);
}
