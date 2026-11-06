import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { BUILDER, KAMINO, LANDING, NOT_FOUND, shared } from './paths.ts';
import { RECIPES } from './mocks/api.ts';
import { DEV_URL } from './servers.ts';
import { expect, test } from './support.ts';

// Every page renders, and says nothing in the console while it does. A message the old UI is known to log goes in
// ALLOWED with the reason; anything else fails here.

const ALLOWED: RegExp[] = [];

const headline = (page: Page) => page.getByRole('heading', { name: 'Any Solana program. One signature from any EVM chain.' });

const pages = [
  { name: 'the landing page', path: LANDING, ready: headline },
  { name: 'the builder', path: BUILDER, ready: (page: Page) => page.getByRole('heading', { name: '1. Program' }) },
  { name: 'the Kamino rescue', path: KAMINO, ready: (page: Page) => page.getByRole('heading', { name: 'Repay a Kamino debt' }) },
  { name: 'a shared recipe', path: shared(RECIPES.demo), ready: (page: Page) => page.getByRole('heading', { name: 'A recipe someone shared with you' }) },
  { name: 'a page that does not exist', path: NOT_FOUND, ready: (page: Page) => page.getByRole('alert').filter({ hasText: 'There is no such page.' }) },
];

for (const { name, path, ready } of pages) {
  test(`${name} renders without errors`, { tag: '@mobile' }, async ({ page, problems }) => {
    await page.goto(path);
    // the logo leads home, and is not a heading: the page's own title is its h1 (a11y-states.spec.ts checks the outline)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Connect Anything', exact: true })).toBeVisible();
    await expect(ready(page)).toBeVisible();
    // what loads after the first paint: the token list, the recipe, AppKit
    await page.waitForLoadState('networkidle');
    expect(problems.filter(problem => !ALLOWED.some(allowed => allowed.test(problem)))).toEqual([]);
  });
}

// The wallet code (app/wallet.tsx: AppKit, the SDK) loads after the first paint, so the landing page draws without it.
// Its module on the dev server, its chunk in the build (not wallet-standard-…).
const WALLET_CODE = /\/src\/app\/wallet\.tsx|\/assets\/wallet-[\w-]{8}\.js$/;
// what only the wallet code and the pages that pay may bring
const HEAVY = /intents-connect|reown|walletconnect|@coral-xyz|\/packages\/core\/|kamino-rescue|\/src\/connect\.ts|\/src\/recipe\.ts/;

test('the landing page draws without the wallet code', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', request => asked.push(new URL(request.url()).pathname));
  await page.route(WALLET_CODE, route => route.abort());
  await page.goto(LANDING);
  await expect(headline(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(asked.filter(path => HEAVY.test(path))).toEqual([]);
});

test('the landing page shows both ways in on the first screen of a phone, and each leads to its page', { tag: '@mobile' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LANDING);
  const rescue = page.getByRole('link', { name: 'Rescue a Kamino position' });
  const build = page.getByRole('link', { name: 'Build a recipe' });
  for (const element of [headline(page), rescue, build]) await expect(element).toBeInViewport({ ratio: 1 });

  await rescue.click();
  await expect(page).toHaveURL(new RegExp(`${KAMINO}$`));
  await page.goBack();
  await build.click();
  await expect(page).toHaveURL(new RegExp(`${BUILDER}$`));
});

test('the landing page fits a 360 px screen without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(LANDING);
  await expect(headline(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

// The example alert links to the site that runs the watcher: the one VITE_PUBLIC_URL names, so that a recording made on
// localhost shows the public address, else the one the page is opened at. src/pages/landing/site.test.ts has the cases
test('the example watcher alert links to the Kamino page of this site, or of the one VITE_PUBLIC_URL names', async ({ page, baseURL }) => {
  // what Vite hands the page, from apps/web/.env or the environment, in the mode of the server: the dev server, or the
  // build that vite preview serves; loaded here, for this test alone
  const { loadEnv } = await import('vite');
  const mode = baseURL === DEV_URL ? 'development' : 'production';
  const configured = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'VITE_').VITE_PUBLIC_URL;
  const site = (configured || new URL(baseURL!).origin).replace(/\/+$/, '');
  await page.goto(LANDING);
  await expect(page.getByText(/\/kamino\?wallet=/)).toHaveText(`${site}/kamino?wallet=7xKX…gAsU&obligation=Hx3m…9cQe`);
});

// a crawler that asks for /robots.txt gets the file, not the app's index.html with a 200
test('robots.txt is a text file that lets every page be crawled', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^text\/plain\b/);
  const text = await response.text();
  expect(text).toMatch(/^User-agent: \*$/m);
  expect(text).toMatch(/^Allow: \/$/m);
  expect(text).not.toMatch(/^Disallow: \/$/m);
});

// "Connecting…" is wider than "Connect", so on a narrow phone the button keeps its idle width and the header still fits
test('the header fits a 360 px screen while a wallet connects', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(KAMINO);
  // the page draws once the wallet code is up, and with it the header's own button
  await expect(page.getByRole('button', { name: 'Read positions' })).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Connecting…' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

// the wallet fixture puts "E2E Wallet" in the page, for AppKit's modal to list
test('the header connects a wallet in one click, even before the wallet code is there', { tag: '@mobile' }, async ({ page, wallet: _ }) => {
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(WALLET_CODE, async route => {
    await held;
    await route.continue();
  });
  await page.goto(LANDING);
  await page.getByRole('banner').getByRole('button', { name: 'Connect wallet' }).click();
  release();
  // AppKit's modal opens by itself once the wallet code is up: no second click on the header. The modal is still growing
  // then, and a click can land on the row that has just moved under it, so the wallet is picked from the keyboard
  await page.getByRole('button', { name: /E2E Wallet/ }).press('Enter');
  await expect(page.getByRole('button', { name: /^Wallet 0x/ })).toBeVisible();
});

// While a page that pays loads its code, it shows its own shapes, about as tall as itself: on a phone the footer stays
// below the first screen until the page comes, and then too, so that nothing on the screen jumps
const LOADING = [
  { path: BUILDER, module: /\/src\/features\/builder\/page\.tsx/, ready: (page: Page) => page.getByRole('heading', { name: '1. Program' }) },
  { path: KAMINO, module: /\/src\/features\/kamino\/page\.tsx/, ready: (page: Page) => page.getByRole('heading', { name: 'Repay a Kamino debt' }) },
  { path: shared(RECIPES.demo), module: /\/src\/features\/run\/shared-page\.tsx/, ready: (page: Page) => page.getByRole('heading', { name: 'A recipe someone shared with you' }) },
];

test('while a page that pays loads, its shapes keep the footer below the first screen of a phone, as the page does', async ({ page }) => {
  // three loads of the dev page, seconds of CPU each
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const { path, module, ready } of LOADING) {
    let release = () => {};
    const held = new Promise<void>(resolve => (release = resolve));
    await page.route(module, async route => {
      await held;
      await route.continue();
    });
    await page.goto(path);
    await expect(page.getByRole('status').filter({ hasText: 'Loading the page…' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).not.toBeInViewport();
    release();
    await expect(ready(page)).toBeVisible();
    await expect(page.getByRole('contentinfo')).not.toBeInViewport();
  }
});

/** When the hero scheme's last animation ends, in seconds, and the words any animation hides at first. */
const schemeTiming = (page: Page) =>
  page.evaluate(() => {
    const seconds = (value: string) => parseFloat(value) * (value.trim().endsWith('ms') ? 0.001 : 1);
    let end = 0;
    const hidden: string[] = [];
    for (const element of document.querySelectorAll('svg.flow, svg.flow *')) {
      const style = getComputedStyle(element);
      if (style.animationName === 'none') continue;
      end = Math.max(end, seconds(style.animationDelay) + seconds(style.animationDuration));
      const texts = element.tagName === 'text' ? [element] : [...element.querySelectorAll('text')];
      hidden.push(...texts.map(text => text.textContent ?? ''));
    }
    return { end, hidden };
  });

test('the hero scheme is whole at its first paint, its run is over in 1.2 s, and it holds still for reduced motion', async ({ page }) => {
  await page.goto(LANDING);
  await expect(page.getByRole('img', { name: /^One payment from Base, Arbitrum or Ethereum/ })).toBeVisible();
  const { end, hidden } = await schemeTiming(page);
  // the chains, Intents Connect, the program and its instructions draw at once: only the run itself plays
  expect(hidden).toEqual([]);
  expect(end).toBeGreaterThan(0);
  expect(end).toBeLessThanOrEqual(1.2);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await schemeTiming(page)).end).toBe(0);
});
