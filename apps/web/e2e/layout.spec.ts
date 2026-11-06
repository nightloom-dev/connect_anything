import { devices, type Page } from '@playwright/test';
import { overflow, settle, shifts, tooWide, watchShifts } from './look.ts';
import { SCENES } from './scenes.ts';
import { expect, test } from './support.ts';

// The layout of every scene of scenes.ts: nothing scrolls sideways on a 360 px phone, the narrowest the spec names, and
// a page opened by a link does not move under the reader while it loads (CLS, at 1440 and 390 px).

const phone = (width: number, height: number) => ({
  viewport: { width, height },
  screen: { width, height },
  userAgent: devices['Pixel 7'].userAgent,
  deviceScaleFactor: devices['Pixel 7'].deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
});

test.describe('at 360 px', () => {
  test.use(phone(360, 780));
  for (const scene of SCENES) {
    test(`${scene.title}: nothing scrolls sideways`, async ({ page, api, connect, wallet }) => {
      await scene.open({ page, api, connect, wallet });
      await settle(page);
      const wide = await tooWide(page);
      expect(await overflow(page), `the page is wider than the screen; past its right edge: ${wide.join('; ')}`).toBe(0);
    });
  }
});

/** The sum of the shifts no input caused, from the first paint until the page settles: CLS is never more. */
const LIMIT = 0.01;

/**
 * 150 ms more for every request of the page's own code, as a phone on a good network has it. Without it, whether the
 * browser draws a frame between two steps of the load (the shell, the page's code, its data) is luck, and so is the
 * shift between them; with it, every step gets its frame, every run.
 */
async function slowNetwork(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: -1, uploadThroughput: -1 });
}

/** Where the footer still jumps as the page loads, measured 2026-11-06. */
const FOOTER_JUMPS: Record<number, string[]> = {
  1440: ['kamino-position', 'kamino-watcher', 'shared'],
  390: ['build-program', 'kamino-empty', 'kamino-position', 'kamino-watcher', 'shared', 'shared-dead'],
};

for (const [width, use] of [
  [1440, { viewport: { width: 1440, height: 900 } }],
  [390, phone(390, 844)],
] as const) {
  test.describe(`at ${width} px`, () => {
    test.use(use);
    for (const scene of SCENES.filter(scene => scene.link)) {
      test(`${scene.title}: nothing moves as it loads`, async ({ page, api, connect, wallet }) => {
        test.fixme(FOOTER_JUMPS[width].includes(scene.name), 'QA-03: the footer is on the first screen while the page loads, and jumps down when the content comes in');
        await slowNetwork(page);
        await watchShifts(page);
        await scene.open({ page, api, connect, wallet });
        await settle(page);
        const seen = await shifts(page);
        const total = seen.reduce((sum, { value }) => sum + value, 0);
        await test.info().attach('layout shifts', { body: JSON.stringify(seen, null, 2), contentType: 'application/json' });
        const moved = seen.map(({ value, sources }) => `${value.toFixed(4)}: ${sources.join(', ')}`);
        expect(total, `layout shifts as the page loads:\n${moved.join('\n')}`).toBeLessThanOrEqual(LIMIT);
      });
    }
  });
}
