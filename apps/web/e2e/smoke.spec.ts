import type { Page } from '@playwright/test';
import { BUILDER, KAMINO, LANDING, NOT_FOUND, shared } from './paths.ts';
import { RECIPES } from './mocks/api.ts';
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
    await expect(page.getByRole('heading', { name: 'Connect Anything', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  release();
  // AppKit's modal opens by itself once the wallet code is up: no second click on the header. The modal is still growing
  // then, and a click can land on the row that has just moved under it, so the wallet is picked from the keyboard
  await page.getByRole('button', { name: /E2E Wallet/ }).press('Enter');
  await expect(page.getByRole('button', { name: /^Wallet 0x/ })).toBeVisible();
});
