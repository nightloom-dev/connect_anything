import type { Page } from '@playwright/test';
import { STAND_IN } from './mocks/fixtures.ts';
import { HEALTHY, NEAR_LIQUIDATION, RECORDED_CASH, RECORDED_USDT, RECORDED_WALLET } from './mocks/kamino.ts';
import { BASE_USDC, SOL_USDC } from './mocks/tokens.ts';
import { KAMINO } from './paths.ts';
import { expect, statusOf, test } from './support.ts';

// /kamino reads the positions of any Solana wallet and works out what to repay for a target LTV. Every variant of
// GET /api/kamino is in mocks/kamino.ts; most take the recorded main-market position and change what it owes.

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

async function read(page: Page, wallet = RECORDED_WALLET) {
  await page.getByLabel('Wallet address').fill(wallet);
  await page.getByRole('button', { name: 'Read positions' }).click();
}

/** A figure of the position, by its whole text: the redesign can lay the figures out as it likes. */
const figure = (page: Page, text: string) => expect(page.getByText(text, { exact: true }).first()).toBeVisible();

/** The position open on the page: its address, short on the screen and whole in its link to Solscan, and how far it is from liquidation. */
async function opened(page: Page, address: string, health: string) {
  const card = page.getByRole('region', { name: 'Position', exact: true });
  await expect(card.getByText(short(address), { exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open in Solscan (new tab)' })).toHaveAttribute('href', `https://solscan.io/account/${address}`);
  await expect(card.getByText(health, { exact: true })).toBeVisible();
}

/** The LTV bar of the position, by what it reads out: the LTV now, where liquidation starts, the target, where a quote lands it. */
const ltv = (page: Page, text: string) => expect(page.getByRole('meter', { name: 'LTV', exact: true })).toHaveAttribute('aria-valuetext', text);

/** One side of the position, Collateral or Debt: its total, then a row per token with the texts given for it. */
async function side(page: Page, name: 'Collateral' | 'Debt', total: string, rows: string[][] = []) {
  const group = page.getByRole('group', { name, exact: true });
  await expect(group.getByText(total, { exact: true }).first()).toBeVisible();
  const items = group.getByRole('listitem');
  await expect(items).toHaveCount(rows.length);
  for (const [index, row] of rows.entries()) for (const text of row) await expect(items.nth(index).getByText(text, { exact: true })).toBeVisible();
}

/** A button of the list of positions, by its whole name. */
const choice = (page: Page, name: string) => page.getByRole('region', { name: 'Positions' }).getByRole('button', { name, exact: true });

/** Keeps what Open in builder puts in session storage for the builder, which takes it out as it opens. */
const keepHanded = (page: Page) =>
  page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'connect-anything:builder-import') (window as unknown as { handed?: string }).handed = value;
      return setItem.call(this, key, value);
    };
  });

/** The recipe Open in builder handed over, if it handed one. */
const handed = async (page: Page) => JSON.parse((await page.evaluate(() => (window as unknown as { handed?: string }).handed)) ?? 'null');

/** A recipe of the builder's own in this tab, of two steps, as the builder keeps it across a reload. */
const builderHolds = (page: Page) =>
  page.evaluate(() => {
    const program = 'Demo111111111111111111111111111111111111111';
    const idl = { address: program, metadata: { name: 'demo', version: '0.1.0', spec: '0.1.0' }, instructions: [{ name: 'ping', discriminator: [1], accounts: [], args: [] }] };
    const step = { program, ixName: 'ping', args: {}, inputs: {} };
    sessionStorage.setItem('connect-anything:builder', JSON.stringify({ version: 1, idl: program, idls: { [program]: idl }, steps: [step, step], target: '' }));
  });

test('a healthy position: the target LTV sets the amount, which the payment form takes', { tag: '@mobile' }, async ({ page, api }) => {
  await page.goto(KAMINO);
  await expect(page.getByRole('button', { name: 'Read positions' })).toBeDisabled();
  const held = api.hold('kamino');
  await read(page);
  await held.reached();
  await expect(page.getByRole('status').filter({ hasText: 'Reading the positions of this wallet…' })).toBeVisible();
  held.release();

  await expect(page.getByRole('heading', { name: 'Position', exact: true })).toBeVisible();
  await opened(page, HEALTHY.address, '25.00 pts to liquidation');
  await ltv(page, 'LTV 55.00%, liquidation at 80.00%, target 45.00%');
  await side(page, 'Collateral', '$8,000.00', [['cbBTC', '0.0947417 cbBTC', '$8,000.00']]);
  await side(page, 'Debt', '$4,400.00', [['USDC', '4,400 USDC', '$4,400.00']]);

  const target = page.getByLabel('Target LTV, %');
  await expect(target).toHaveValue('45');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  // three things that decide whether to pay, and the whole reason behind them on demand
  const before = page.getByRole('region', { name: 'Before you pay' });
  await expect(before.getByRole('listitem')).toHaveText([
    "It repays debt only: the collateral stays with the position's owner.",
    'The amount is fixed when you sign. What is not spent can come back through Refund.',
    'If nothing is owed by the time it lands, the run fails and the money waits for Refund.',
  ]);
  // how long a run takes is said once on the screen, by the payment, and not here again
  await expect(before).not.toContainText('150');
  await expect(page.getByText(/150 s/)).toHaveCount(1);
  await expect(before.getByText('The position can move before this runs.')).toHaveCount(0);
  await before.getByRole('button', { name: 'Why?' }).click();
  await expect(before.getByText('The position can move before this runs.')).toBeVisible();
  await expect(page.getByText('This position is already at its liquidation LTV')).toHaveCount(0);
  // the payment form takes the amount while it is in the token the recipe receives
  await expect(page.getByLabel('Amount')).toHaveValue('800');
  await expect(page.getByLabel('Chain')).toHaveValue('base');
  const token = page.getByRole('combobox', { name: 'Token', exact: true });
  await expect(token).toHaveValue(BASE_USDC.assetId);
  await expect(token.locator('option:checked')).toHaveText('USDC (0x83…2913)');
  await expect(page.getByText('It arrives on Solana as USDC.')).toBeVisible();

  await target.fill('50');
  await expect(page.getByText('Repay $400.00, which is 400 USDC.')).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue('400');

  await target.fill('60');
  await expect(page.getByRole('status').filter({ hasText: 'At 55.00% this position is already at or under that target, so there is nothing to repay. You can still enter an amount of your own.' })).toBeVisible();

  await target.fill('80');
  await expect(page.getByRole('status').filter({ hasText: 'That target is at or past the liquidation LTV of 80.00%, so the position could be liquidated even after it gets there.' })).toBeVisible();

  await target.fill('abc');
  await expect(page.getByText('Enter a target from 0 to 100.')).toBeVisible();
  await expect(target).toHaveAttribute('aria-invalid', 'true');
  await target.fill('101');
  await expect(page.getByText('Enter a target from 0 to 100.')).toBeVisible();
});

test('the presets and the slider set the target as typing does, and Repay all repays the whole USDC debt', async ({ page }) => {
  await page.goto(KAMINO);
  await read(page);
  const target = page.getByLabel('Target LTV, %');
  const slider = page.getByRole('slider', { name: 'Target LTV' });
  const presets = page.getByRole('group', { name: 'Presets' });
  await expect(target).toHaveValue('45');
  await expect(slider).toHaveValue('45');
  await expect(presets.getByRole('button', { name: 'Safe 45%' })).toHaveAttribute('aria-pressed', 'true');

  await presets.getByRole('button', { name: 'Safer 35%' }).click();
  await expect(target).toHaveValue('35');
  await expect(slider).toHaveValue('35');
  await expect(page.getByText('Repay $1,600.00, which is 1600 USDC.')).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue('1600');
  await expect(presets.getByRole('button', { name: 'Safe 45%' })).toHaveAttribute('aria-pressed', 'false');

  await presets.getByRole('button', { name: 'Repay all 0%' }).click();
  await expect(target).toHaveValue('0');
  await expect(page.getByText('Repay $4,400.00, which is 4400 USDC.')).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue('4400');

  // the slider types its value into the field
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(target).toHaveValue('1');
  await slider.fill('50');
  await expect(target).toHaveValue('50');
  await expect(page.getByText('Repay $400.00, which is 400 USDC.')).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue('400');

  // and the field moves the slider, which stays where it was while the text is not a target
  await target.fill('30');
  await expect(slider).toHaveValue('30');
  await target.fill('abc');
  await expect(slider).toHaveValue('30');
});

test('the recorded wallet: two positions, and neither owes USDC', async ({ page, api }) => {
  api.kamino = 'recorded';
  await page.goto(KAMINO);
  await read(page);
  await expect(page.getByText('This wallet has 2 positions. Choose one.')).toBeVisible();
  const usdt = choice(page, `LTV 71.33% 8.67 pts to liquidation ${short(RECORDED_USDT.address)} owes USDT $5,212.49 against $7,307.92`);
  const cash = choice(page, `LTV 80.20% 10.80 pts to liquidation ${short(RECORDED_CASH.address)} owes CASH $3.23 against $4.03`);
  await expect(usdt).toHaveAttribute('aria-pressed', 'false');
  await expect(cash).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Position', exact: true })).toHaveCount(0);
  await expect(page.getByText('Choose a position', { exact: true })).toBeVisible();

  await usdt.click();
  await expect(usdt).toHaveAttribute('aria-pressed', 'true');
  await opened(page, RECORDED_USDT.address, '8.67 pts to liquidation');
  await ltv(page, 'LTV 71.33%, liquidation at 80.00%');
  await expect(page.getByRole('status').filter({ hasText: 'This position owes USDT. Only a USDC debt can be repaid here for now, so this one is not supported yet.' })).toBeVisible();
  // nothing to pay for
  await expect(page.getByRole('heading', { name: 'Target LTV' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toHaveCount(0);
  await expect(page.getByText('No payment for this position', { exact: true })).toBeVisible();

  await cash.click();
  await ltv(page, 'LTV 80.20%, liquidation at 91.00%');
  await expect(page.getByRole('status').filter({ hasText: 'This position owes CASH. Only a USDC debt can be repaid here for now' })).toBeVisible();
});

test('three positions to choose from, and the deep link of the watcher opens the one it names', { tag: '@mobile' }, async ({ page, api }) => {
  api.kamino = 'three';
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${NEAR_LIQUIDATION.address}`);
  await expect(page.getByLabel('Wallet address')).toHaveValue(RECORDED_WALLET);
  const banner = statusOf(page, 'Opened from a watcher alert');
  await expect(banner).toContainText(`The Telegram watcher rang about position ${short(NEAR_LIQUIDATION.address)}. It is open below.`);
  await expect(page.getByText('This wallet has 3 positions. Choose one.')).toBeVisible();
  const names = [
    `LTV 78.00% 2.00 pts to liquidation ${short(NEAR_LIQUIDATION.address)} owes USDC $7,800.00 against $10,000.00`,
    `LTV 80.20% 10.80 pts to liquidation ${short(RECORDED_CASH.address)} owes CASH $3.23 against $4.03`,
    `LTV 55.00% 25.00 pts to liquidation ${short(HEALTHY.address)} owes USDC $4,400.00 against $8,000.00`,
  ];
  // closest to liquidation first, by the share of its liquidation LTV a position uses
  const buttons = page.getByRole('region', { name: 'Positions' }).getByRole('button');
  await expect(buttons).toHaveCount(3);
  for (const [index, name] of names.entries()) await expect(buttons.nth(index)).toHaveAccessibleName(name);
  const near = choice(page, names[0]);
  const healthy = choice(page, names[2]);
  await expect(near).toHaveAttribute('aria-pressed', 'true');
  await opened(page, NEAR_LIQUIDATION.address, '2.00 pts to liquidation');
  await ltv(page, 'LTV 78.00%, liquidation at 80.00%, target 68.00%');
  await side(page, 'Collateral', '$10,000.00', [['SOL', '62.5 SOL', '$10,000.00']]);
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('68');
  await expect(page.getByText('Repay $1,000.00, which is 1000 USDC.')).toBeVisible();

  await healthy.click();
  await expect(healthy).toHaveAttribute('aria-pressed', 'true');
  await expect(near).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('45');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  // the alert was about the other one
  await expect(banner).toHaveCount(0);

  // reading again starts over
  await page.getByRole('button', { name: 'Read positions' }).click();
  await expect(healthy).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Position', exact: true })).toHaveCount(0);
});

test('a watcher alert about a position the wallet no longer has says so', async ({ page }) => {
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${NEAR_LIQUIDATION.address}`);
  await expect(statusOf(page, 'Opened from a watcher alert')).toContainText(
    `The Telegram watcher rang about position ${short(NEAR_LIQUIDATION.address)}. This wallet has no such position open any more.`,
  );
  // the one position it has is open below, as for any wallet with one
  await opened(page, HEALTHY.address, '25.00 pts to liquidation');
});

test('what can stop a repay: USDC short of the target, other debts, no collateral, past liquidation, compute units', async ({ page, api }) => {
  await page.goto(KAMINO);
  const warning = (text: string) => page.getByRole('status').filter({ hasText: text });

  api.kamino = 'short';
  await read(page);
  await side(page, 'Debt', '$4,400.00', [
    ['USDC', '500 USDC', '$500.00'],
    ['USDT', '3,900 USDT', '$3,900.00'],
  ]);
  await expect(page.getByText('Repay $500.00, which is 500 USDC.')).toBeVisible();
  await expect(warning('USDC is only $500.00 of what this position owes, and this recipe repays nothing else, so the target is out of reach: repaying all of it brings the LTV to 48.75%.')).toBeVisible();
  await expect(warning('USDC alone cannot reach the target')).toBeVisible();
  await expect(page.getByText('which this recipe does not repay')).toHaveCount(0);

  api.kamino = 'also-owes';
  await read(page);
  await side(page, 'Debt', '$4,400.00', [
    ['USDC', '3,000 USDC', '$3,000.00'],
    ['USDT', '1,400 USDT', '$1,400.00'],
  ]);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await expect(warning('This position also owes USDT $1,400.00, which this recipe does not repay.')).toBeVisible();

  api.kamino = 'no-collateral';
  await read(page);
  await opened(page, HEALTHY.address, 'No collateral');
  await side(page, 'Collateral', '$0.00');
  await figure(page, 'Nothing deposited');
  // an LTV means nothing here, so there is no bar
  await expect(page.getByRole('meter', { name: 'LTV', exact: true })).toHaveCount(0);
  await expect(warning('This position has no collateral left, so an LTV means nothing here and the amount is the whole debt.')).toBeVisible();
  await expect(page.getByText('Repay $50.00, which is 50 USDC.')).toBeVisible();

  api.kamino = 'past';
  await read(page);
  await opened(page, HEALTHY.address, 'Past liquidation');
  await ltv(page, 'LTV 85.00%, liquidation at 80.00%, target 75.00%');
  await expect(warning('This position is at or past its liquidation LTV, so it can be liquidated before the repay lands.')).toBeVisible();
  // the alert says it once: Why? does not say it again
  const before = page.getByRole('region', { name: 'Before you pay' });
  await before.getByRole('button', { name: 'Why?' }).click();
  await expect(before.getByText('The position can move before this runs.')).toBeVisible();
  await expect(before).not.toContainText('at any moment');
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('75');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  // 10 points down from 85% is 75%, in the amber zone that starts 10 points under liquidation: Safe goes 15 under it
  const presets = page.getByRole('group', { name: 'Presets' });
  await expect(presets.getByRole('button')).toHaveText(['Safe 65%', 'Safer 55%', 'Repay all 0%']);
  await presets.getByRole('button', { name: 'Safe 65%' }).click();
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('65');
  await ltv(page, 'LTV 85.00%, liquidation at 80.00%, target 65.00%');
  await expect(page.getByText('Repay $1,600.00, which is 1600 USDC.')).toBeVisible();
  await presets.getByRole('button', { name: 'Safer 55%' }).click();
  await expect(page.getByText('Repay $2,400.00, which is 2400 USDC.')).toBeVisible();

  api.kamino = 'six-reserves';
  await read(page);
  await side(page, 'Collateral', '$8,000.00', [
    ['cbBTC', '$2,000.00'],
    ['JitoSOL', '$2,000.00'],
    ['SOL', '$2,000.00'],
    ['mSOL', '$1,000.00'],
    ['bSOL', '$1,000.00'],
  ]);
  await expect(warning('This repay would take about 213,000 compute units by estimate, over the roughly 200,000 Connect allows, so it is likely to fail on Solana. The money would then stay with your intermediary.')).toBeVisible();
  // a warning, not a stop
  await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toBeVisible();
});

test('positions that cannot be repaid here say why, and offer no payment', async ({ page, api }) => {
  await page.goto(KAMINO);
  for (const [variant, why] of [
    ['not-usdc', 'This position owes USDT. Only a USDC debt can be repaid here for now, so this one is not supported yet.'],
    ['unjoined-farm', 'This USDC debt has a rewards farm that the position never joined, so a repay would fail on Solana. Repaying it is not supported yet.'],
    ['no-debt', 'This position has no debt to repay.'],
  ] as const) {
    api.kamino = variant;
    await read(page);
    await expect(page.getByRole('status').filter({ hasText: why })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Target LTV' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toHaveCount(0);
  }
});

test('the repay is checked on a fork for the amount of the target, and the check holds nothing up', async ({ page, api }) => {
  await page.goto(KAMINO);
  await read(page);
  const simulations = () => api.requests.filter(({ method, path }) => method === 'POST' && path === '/api/simulate');
  // the card says plainly which amount it ran: the target's, which the quote delivers a little less of
  const checked = page.getByRole('region', { name: /^Checked on a mainnet fork for / });
  await expect(checked.getByRole('heading')).toHaveText('Checked on a mainnet fork for 800 USDC');
  await expect(checked.getByRole('status')).toHaveText("The repay ran with no errors, for the target's amount before fees.");
  await expect(checked.getByText('Passed', { exact: true })).toBeVisible();
  await expect(checked.getByRole('meter', { name: 'Compute units' })).toHaveAttribute('aria-valuetext', '115,948 of 200,000 CU');
  await expect(checked.getByRole('meter', { name: 'Transaction size' })).toHaveAttribute('aria-valuetext', '934 of 1,232 bytes');
  // what it ran: the rescue's four instructions, with 800 USDC delivered to a stand-in intermediary
  expect(simulations()).toHaveLength(1);
  const [first] = simulations();
  expect(first.body).toMatchObject({ intermediary: STAND_IN, fund: { mint: SOL_USDC.contractAddress, amount: '800000000' } });
  expect((first.body as { instructions: unknown[] }).instructions).toHaveLength(4);

  const target = page.getByLabel('Target LTV, %');
  api.simulate = 'warn';
  await target.fill('50');
  await expect(checked.getByRole('heading')).toHaveText('Checked on a mainnet fork for 400 USDC');
  await expect(checked.getByRole('status')).toHaveText("The repay ran, with warnings, for the target's amount before fees.");
  await expect(checked.getByText('Passed with warnings', { exact: true })).toBeVisible();
  await expect(checked.getByRole('meter', { name: 'Compute units' })).toHaveAttribute('aria-valuetext', '250,028 of 200,000 CU, over the limit');
  await expect(checked.getByText('CU 250.0k > 200k', { exact: true })).toBeVisible();
  expect(simulations().at(-1)!.body).toMatchObject({ fund: { amount: '400000000' } });

  api.simulate = 'fail';
  await target.fill('40');
  await expect(checked.getByRole('heading')).toHaveText('Checked on a mainnet fork for 1200 USDC');
  await expect(checked.getByRole('status')).toHaveText('The repay failed on the fork, and would most likely fail for real.');
  await expect(checked.getByText('Failed', { exact: true })).toBeVisible();
  await expect(checked.getByText('Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation)', { exact: true })).toBeVisible();

  api.simulate = 'offline';
  await target.fill('35');
  const offline = page.getByRole('region', { name: 'Not simulated: simulator offline' });
  await expect(offline.getByRole('status')).toHaveText('This repay has not been checked. Paying does not depend on it.');

  // none of it reaches the payment
  await expect(page.getByLabel('Amount')).toHaveValue('1600');
  await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toBeEnabled();
  // and a target with nothing to repay asks for no simulation
  const asked = simulations().length;
  await target.fill('60');
  await expect(page.getByRole('region', { name: 'Not simulated', exact: true }).getByRole('status')).toHaveText('Nothing to simulate: the target asks for no repay.');
  expect(simulations()).toHaveLength(asked);
});

test('Open in builder hands the rescue recipe to the builder, at its instructions', async ({ page }) => {
  // the builder takes the recipe out of session storage as it opens, so the test keeps what was put there
  await keepHanded(page);
  await page.goto(KAMINO);
  await read(page);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await page.getByRole('button', { name: 'Open in builder' }).click();
  await expect(page).toHaveURL(/\/build\?step=2$/);
  const recipe = await handed(page);
  expect(recipe.steps.map((step: { ixName: string }) => step.ixName)).toEqual(['refresh_reserve', 'refresh_reserve', 'refresh_obligation', 'repay_obligation_liquidity_v2']);
  expect(recipe.destination).toMatchObject({ tokenAddress: SOL_USDC.contractAddress });
  expect(JSON.stringify(recipe.steps)).toContain(HEALTHY.address);
});

test('Open in builder asks before it replaces a recipe the builder holds', async ({ page }) => {
  await keepHanded(page);
  await page.goto(KAMINO);
  await read(page);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await builderHolds(page);
  const open = page.getByRole('button', { name: 'Open in builder' });
  await open.click();
  const ask = page.getByRole('dialog', { name: 'Replace the recipe in the builder?' });
  await expect(ask).toContainText('The builder holds a recipe of 2 steps. Opening this one there replaces it.');

  // Cancel leaves both where they are
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`${KAMINO}$`));
  expect(await handed(page)).toBeNull();

  await open.click();
  await ask.getByRole('button', { name: 'Replace it' }).click();
  await expect(page).toHaveURL(/\/build\?step=2$/);
  expect((await handed(page)).steps.map((step: { ixName: string }) => step.ixName)).toEqual(['refresh_reserve', 'refresh_reserve', 'refresh_obligation', 'repay_obligation_liquidity_v2']);
});

test('a quote moves the LTV bar to where it lands, and after the run the position is read again', async ({ page, api, wallet }) => {
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${HEALTHY.address}`);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await wallet.connect();
  await page.getByRole('button', { name: 'Get exact amount and fee' }).click();
  await expect(page.getByRole('button', { name: 'Sign and run' })).toBeEnabled();
  // what the quote can spend repays a little less than 800 USDC: the fee comes out of it
  await ltv(page, 'LTV 55.00%, liquidation at 80.00%, target 45.00%, 45.32% after the repayment');

  api.kamino = 'repaid';
  await page.getByRole('button', { name: 'Sign and run' }).click();
  const after = page.getByRole('region', { name: 'After the run' });
  await expect(after.getByRole('status')).toHaveText('After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.');
  await expect(after.getByText('$800.00 repaid', { exact: true })).toBeVisible();
  await expect(after.getByText('10.00 pts lower', { exact: true })).toBeVisible();
  // the position below is the one read after the run, and the target it reached has folded away with its field
  await ltv(page, 'LTV 45.00%, liquidation at 80.00%');
  await side(page, 'Debt', '$3,600.00', [['USDC', '3,600 USDC', '$3,600.00']]);

  const reads = () => api.requests.filter(({ path }) => path.startsWith('/api/kamino/')).length;
  const count = reads();
  await after.getByRole('button', { name: 'Read again', exact: true }).click();
  await expect.poll(reads).toBe(count + 1);
  await expect(after.getByRole('status')).toHaveText('After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.');
});

test('the builder waits while a run is in flight, and after the repay the target folds away behind Repay more', async ({ page, api, connect, wallet }) => {
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${HEALTHY.address}`);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await wallet.connect();
  await page.getByRole('button', { name: 'Get exact amount and fee' }).click();
  await expect(page.getByRole('button', { name: 'Sign and run' })).toBeEnabled();
  const builder = page.getByRole('button', { name: 'Open in builder' });
  await expect(builder).toBeEnabled();

  // the builder would take the page, and the run with it
  api.kamino = 'repaid';
  const create = connect.hold('create');
  await page.getByRole('button', { name: 'Sign and run' }).click();
  await create.reached();
  await expect(builder).toBeDisabled();
  create.release();

  // the page shows what the run did, and nothing on it reads as a second payment to make
  const after = page.getByRole('region', { name: 'After the run' });
  await expect(after.getByRole('status')).toHaveText('After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.');
  await ltv(page, 'LTV 45.00%, liquidation at 80.00%');
  await expect(page.getByLabel('Target LTV, %')).toHaveCount(0);
  await expect(page.getByText(/^Repay \$/)).toHaveCount(0);
  await expect(page.getByText('already at or under that target', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Before you pay' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /mainnet fork/ })).toHaveCount(0);

  // Repay more opens the target again, at Safe for the position as it is now: 45% less 10 points
  await page.getByRole('button', { name: 'Repay more' }).click();
  const target = page.getByLabel('Target LTV, %');
  await expect(target).toBeFocused();
  await expect(target).toHaveValue('35');
  await expect(page.getByRole('group', { name: 'Presets' }).getByRole('button', { name: 'Safe 35%' })).toHaveAttribute('aria-pressed', 'true');
  await ltv(page, 'LTV 45.00%, liquidation at 80.00%, target 35.00%');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Repay more' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Checked on a mainnet fork for 800 USDC' })).toBeVisible();
  // what the run did stays on the screen
  await expect(after.getByRole('status')).toHaveText('After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.');
});

test('on a phone a bar at the foot of the screen leads to the payment, and keeps out of its way', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(KAMINO);
  await read(page);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  const pay = page.getByRole('button', { name: 'Pay, in the payment card below' });
  await expect(pay).toBeInViewport();
  await expect(page.getByText('Repay 800 USDC', { exact: true })).toBeVisible();

  // it takes the person to the payment, and the focus with them, and is out of the way while the payment is in view
  const payment = page.getByRole('region', { name: 'Payment' });
  await expect(payment).not.toBeInViewport();
  await pay.click();
  await expect(payment).toBeFocused();
  await expect(payment).toBeInViewport();
  await expect(pay).toBeHidden();
  await expect(payment.getByLabel('Amount')).toHaveValue('800');
  // past the payment, at the check on a fork that follows it on a phone, it does not lead back up (on a short screen,
  // where there is page enough under the payment to scroll it out of view)
  await page.setViewportSize({ width: 390, height: 560 });
  await page.getByRole('region', { name: /^Checked on a mainnet fork for / }).evaluate(card => card.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(payment).not.toBeInViewport();
  await expect(pay).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });

  // back at the top it leads there again, with the amount of the target
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(pay).toBeInViewport();
  await page.getByLabel('Target LTV, %').fill('50');
  await expect(page.getByText('Repay 400 USDC', { exact: true })).toBeVisible();
  // nothing to repay, nothing to lead to
  await page.getByLabel('Target LTV, %').fill('60');
  await expect(pay).toHaveCount(0);
  await page.getByLabel('Target LTV, %').fill('45');
  await expect(pay).toBeInViewport();

  // two columns from 960px put the payment beside the position, and the bar goes
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(pay).toBeHidden();
});

test('no positions, an address that is not one, and a read that failed', async ({ page, api }) => {
  await page.goto(KAMINO);
  api.kamino = 'none';
  await read(page);
  await expect(page.getByRole('status').filter({ hasText: 'This wallet has no open positions on Kamino.' })).toBeVisible();
  // the way on is the field above
  await page.getByRole('button', { name: 'Check another wallet' }).click();
  await expect(page.getByLabel('Wallet address')).toBeFocused();

  await read(page, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  await expect(page.getByRole('alert').filter({ hasText: 'That is not a Solana address.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

  api.kamino = 'error';
  await read(page);
  // the button says Try again, so the words do not
  const failure = page.getByRole('alert').filter({ hasText: 'Could not read the position from Solana.' });
  await expect(failure.getByText('Could not read the position from Solana.', { exact: true })).toBeVisible();
  await expect(failure).not.toContainText('try again');
  api.kamino = 'healthy';
  await failure.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Position', exact: true })).toBeVisible();
});
