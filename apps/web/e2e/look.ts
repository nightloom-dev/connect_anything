import { expect, type Page } from '@playwright/test';
import type { FakeConnect } from './mocks/connect.ts';

// What the screenshot, layout and keyboard specs share: a page that holds still, and the measures of its layout.

/** The moment every screenshot is taken at, so that the time on the run card and its clock read the same every run. */
export const FROZEN = new Date('2026-11-05T12:00:00.000Z');

/**
 * Stops the page's clock and the fake Connect's at FROZEN. Before the page loads. Timers keep running, so the page
 * polls and loads as it would; only what it reads from the clock stands still.
 */
export async function freeze(page: Page, connect: FakeConnect) {
  await page.clock.setFixedTime(FROZEN);
  connect.now = () => FROZEN;
}

/** The wallet code (AppKit, the SDK) loads after the first paint: the header's button is the real one once it is in. */
export async function walletCodeIn(page: Page) {
  await expect(page.locator('[data-wallet]:not([data-wallet="loading"])')).toHaveCount(1, { timeout: 15_000 });
}

/** Waits until nothing more arrives: the wallet code, the requests after the first paint, the fonts and the images. */
export async function settle(page: Page) {
  await walletCodeIn(page);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    // an image ends with load or error: it fires no loadend
    await Promise.all(
      [...document.images]
        .filter(image => !image.complete)
        .map(image => new Promise(done => ['load', 'error'].forEach(type => image.addEventListener(type, done, { once: true })))),
    );
  });
}

/** What a screenshot shows for the page's own origin. */
export const SHOWN_ORIGIN = 'https://connect.example';

/**
 * Rewrites the page's own origin where it is text (the watcher's example on the landing page, an exported link), so
 * that a screenshot reads the same whatever ports E2E_PORT and E2E_PREVIEW_PORT gave the servers on that machine. A
 * box over it would not do: the digits of a port differ in width, and so does what follows them.
 */
export const pinOrigin = (page: Page) =>
  page.evaluate(shown => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue?.includes(location.origin)) node.nodeValue = node.nodeValue.replaceAll(location.origin, shown);
    }
  }, SHOWN_ORIGIN);

/** How far the page scrolls sideways, in CSS pixels: 0 when it fits its window. */
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The innermost elements that reach past the right edge of the window, for the message of a failure. */
export const tooWide = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const past = (element: Element) => element.getBoundingClientRect().right > width + 0.5;
    const name = (element: Element) => {
      const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const classes = typeof element.className === 'string' ? element.className.split(/\s+/).slice(0, 4).join('.') : '';
      return `<${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}> ${Math.round(element.getBoundingClientRect().right)} px "${text}"`;
    };
    return [...document.body.querySelectorAll('*')]
      .filter(element => past(element) && ![...element.children].some(past))
      .slice(0, 5)
      .map(name);
  });

type Shift = { value: number; sources: string[] };

declare global {
  interface Window {
    __shifts?: Shift[];
  }
}

/**
 * Records every layout shift of the page that no input caused, from its first paint. Before the page loads; read
 * them with `shifts`. Their sum bounds the page's CLS from above.
 */
export async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: Shift[] = (window.__shifts = []);
    const name = (node: Node | null) => {
      if (!(node instanceof Element)) return node?.nodeName ?? '?';
      const text = (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `<${node.tagName.toLowerCase()}> "${text}"`;
    };
    type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node: Node | null }[] };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as LayoutShift[]) {
        if (!entry.hadRecentInput) shifts.push({ value: entry.value, sources: (entry.sources ?? []).map(source => name(source.node)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** The layout shifts `watchShifts` saw so far. */
export const shifts = (page: Page) => page.evaluate(() => window.__shifts ?? []);
