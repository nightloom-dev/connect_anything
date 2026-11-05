import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { RECIPES } from './mocks/api.ts';
import { BUILDER, KAMINO, LANDING, NOT_FOUND, shared } from './paths.ts';
import { RECORDED_WALLET } from './mocks/kamino.ts';
import { alertOf, expect, test } from './support.ts';

// axe on every page, in a state with its forms on the screen. The whole report is attached to the test. Serious and
// critical violations fail the test only with A11Y_STRICT=1, until the redesign has fixed what the old UI has; without
// it they are listed as an annotation.

const KLEND_FILE = fileURLToPath(new URL('../../../recipes/kamino-rescue/klend.idl.json', import.meta.url));
const STRICT = process.env.A11Y_STRICT === '1';

async function audit(page: Page, testInfo: TestInfo, { idle = true } = {}) {
  if (idle) await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).analyze();
  await testInfo.attach('axe results', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  const grave = results.violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, impact, help, nodes }) => `${impact} ${id}: ${help} (${nodes.length}× e.g. ${nodes[0]?.target.join(' ')})`);
  if (STRICT) expect(grave, 'serious and critical axe violations').toEqual([]);
  else if (grave.length) testInfo.annotations.push({ type: 'a11y', description: grave.join('\n') });
}

test('the landing page', { tag: '@mobile' }, async ({ page }, testInfo) => {
  await page.goto(LANDING);
  await expect(page.getByRole('heading', { name: 'Any Solana program. One signature from any EVM chain.' })).toBeVisible();
  await audit(page, testInfo);
});

test('the builder, with an IDL loaded', { tag: '@mobile' }, async ({ page }, testInfo) => {
  await page.goto(BUILDER);
  await page.getByLabel('IDL file').setInputFiles(KLEND_FILE);
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await audit(page, testInfo);
});

test('the Kamino rescue, with a position read', { tag: '@mobile' }, async ({ page }, testInfo) => {
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}`);
  await expect(page.getByRole('heading', { name: 'Target LTV' })).toBeVisible();
  await audit(page, testInfo);
});

test('a shared recipe', { tag: '@mobile' }, async ({ page }, testInfo) => {
  await page.goto(shared(RECIPES.demo));
  await expect(page.getByText('What will run: 4 instructions on 1 program')).toBeVisible();
  await audit(page, testInfo);
});

test('a page that does not exist', { tag: '@mobile' }, async ({ page }, testInfo) => {
  await page.goto(NOT_FOUND);
  await expect(alertOf(page, 'There is no such page.')).toBeVisible();
  await audit(page, testInfo);
});

// what every lazy page shows while its code loads
test('a page while its code loads', async ({ page }, testInfo) => {
  let release = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(/\/src\/features\/kamino\/page\.tsx/, async route => {
    await held;
    await route.continue();
  });
  await page.goto(KAMINO);
  await expect(page.getByRole('status').filter({ hasText: 'Loading the page…' })).toBeVisible();
  // the network is not idle while the page's code is held
  await audit(page, testInfo, { idle: false });
  release();
  await expect(page.getByRole('heading', { name: 'Repay a Kamino debt' })).toBeVisible();
});
