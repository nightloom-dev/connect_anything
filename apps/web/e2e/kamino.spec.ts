import type { Page } from '@playwright/test';
import { HEALTHY, NEAR_LIQUIDATION, RECORDED_CASH, RECORDED_USDT, RECORDED_WALLET } from './mocks/kamino.ts';
import { BASE_USDC } from './mocks/tokens.ts';
import { KAMINO } from './paths.ts';
import { expect, test } from './support.ts';

// /kamino reads the positions of any Solana wallet and works out what to repay for a target LTV. Every variant of
// GET /api/kamino is in mocks/kamino.ts; most take the recorded main-market position and change what it owes.

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

async function read(page: Page, wallet = RECORDED_WALLET) {
  await page.getByLabel('Wallet address').fill(wallet);
  await page.getByRole('button', { name: 'Read positions' }).click();
}

/** A figure of the position, by its whole text: the redesign can lay the figures out as it likes. */
const figure = (page: Page, text: string) => expect(page.getByText(text, { exact: true }).first()).toBeVisible();

test('a healthy position: the target LTV sets the amount, which the payment form takes', { tag: '@mobile' }, async ({ page, api }) => {
  await page.goto(KAMINO);
  await expect(page.getByRole('button', { name: 'Read positions' })).toBeDisabled();
  const held = api.hold('kamino');
  await read(page);
  await held.reached();
  await expect(page.getByRole('status').filter({ hasText: 'Reading the positions of this wallet…' })).toBeVisible();
  held.release();

  await expect(page.getByRole('heading', { name: 'The position' })).toBeVisible();
  await figure(page, HEALTHY.address);
  await figure(page, '55.00%, liquidated at 80.00%');
  await figure(page, '$8,000.00: cbBTC $8,000.00');
  await figure(page, '$4,400.00: USDC $4,400.00');

  const target = page.getByLabel('Target LTV, %');
  await expect(target).toHaveValue('45');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'The position can move before this runs.' })).toBeVisible();
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
  await expect(page.getByRole('status').filter({ hasText: 'At 55.00% this position is already at or under that target, so there is nothing to repay. You can still enter an amount below.' })).toBeVisible();

  await target.fill('80');
  await expect(page.getByRole('status').filter({ hasText: 'That target is at or past the liquidation LTV of 80.00%, so the position could be liquidated even after it gets there.' })).toBeVisible();

  await target.fill('abc');
  await expect(page.getByText('Enter a target from 0 to 100.')).toBeVisible();
  await target.fill('101');
  await expect(page.getByText('Enter a target from 0 to 100.')).toBeVisible();
});

test('the recorded wallet: two positions, and neither owes USDC', async ({ page, api }) => {
  api.kamino = 'recorded';
  await page.goto(KAMINO);
  await read(page);
  await expect(page.getByText('This wallet has 2 positions. Choose one.')).toBeVisible();
  const usdt = page.getByRole('button', { name: `LTV 71.33% owes USDT $5,212.49 against $7,307.92 ${short(RECORDED_USDT.address)}` });
  const cash = page.getByRole('button', { name: `LTV 80.20% owes CASH $3.23 against $4.03 ${short(RECORDED_CASH.address)}` });
  await expect(usdt).toHaveAttribute('aria-pressed', 'false');
  await expect(cash).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'The position' })).toHaveCount(0);

  await usdt.click();
  await expect(usdt).toHaveAttribute('aria-pressed', 'true');
  await figure(page, '71.33%, liquidated at 80.00%');
  await expect(page.getByRole('status').filter({ hasText: 'This position owes USDT. Only a USDC debt can be repaid here for now, so this one is not supported yet.' })).toBeVisible();
  // nothing to pay for
  await expect(page.getByRole('heading', { name: 'Target LTV' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toHaveCount(0);

  await cash.click();
  await figure(page, '80.20%, liquidated at 91.00%');
  await expect(page.getByRole('status').filter({ hasText: 'This position owes CASH. Only a USDC debt can be repaid here for now' })).toBeVisible();
});

test('three positions to choose from, and the deep link of the watcher opens the one it names', { tag: '@mobile' }, async ({ page, api }) => {
  api.kamino = 'three';
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${NEAR_LIQUIDATION.address}`);
  await expect(page.getByLabel('Wallet address')).toHaveValue(RECORDED_WALLET);
  await expect(page.getByText('This wallet has 3 positions. Choose one.')).toBeVisible();
  const near = page.getByRole('button', { name: `LTV 78.00% owes USDC $7,800.00 against $10,000.00 ${short(NEAR_LIQUIDATION.address)}` });
  await expect(near).toHaveAttribute('aria-pressed', 'true');
  await figure(page, NEAR_LIQUIDATION.address);
  await figure(page, '78.00%, liquidated at 80.00%');
  await figure(page, '$10,000.00: SOL $10,000.00');
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('68');
  await expect(page.getByText('Repay $1,000.00, which is 1000 USDC.')).toBeVisible();

  const healthy = page.getByRole('button', { name: `LTV 55.00% owes USDC $4,400.00 against $8,000.00 ${short(HEALTHY.address)}` });
  await healthy.click();
  await expect(healthy).toHaveAttribute('aria-pressed', 'true');
  await expect(near).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('45');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();

  // reading again starts over
  await page.getByRole('button', { name: 'Read positions' }).click();
  await expect(healthy).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'The position' })).toHaveCount(0);
});

test('what can stop a repay: USDC short of the target, other debts, no collateral, past liquidation, compute units', async ({ page, api }) => {
  await page.goto(KAMINO);
  const warning = (text: string) => page.getByRole('status').filter({ hasText: text });

  api.kamino = 'short';
  await read(page);
  await figure(page, '$4,400.00: USDC $500.00, USDT $3,900.00');
  await expect(page.getByText('Repay $500.00, which is 500 USDC.')).toBeVisible();
  await expect(warning('USDC is only $500.00 of what this position owes, and this recipe repays nothing else, so the target is out of reach: repaying all of it brings the LTV to 48.75%.')).toBeVisible();
  await expect(page.getByText('which this recipe does not repay')).toHaveCount(0);

  api.kamino = 'also-owes';
  await read(page);
  await figure(page, '$4,400.00: USDC $3,000.00, USDT $1,400.00');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await expect(warning('This position also owes USDT $1,400.00, which this recipe does not repay.')).toBeVisible();

  api.kamino = 'no-collateral';
  await read(page);
  await figure(page, 'no collateral');
  await figure(page, '$0.00: nothing');
  await expect(warning('This position has no collateral left, so an LTV means nothing here and the amount is the whole debt.')).toBeVisible();
  await expect(page.getByText('Repay $50.00, which is 50 USDC.')).toBeVisible();

  api.kamino = 'past';
  await read(page);
  await figure(page, '85.00%, liquidated at 80.00%');
  await expect(warning('This position is already at its liquidation LTV, so that can happen at any moment.')).toBeVisible();
  await expect(page.getByLabel('Target LTV, %')).toHaveValue('75');
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();

  api.kamino = 'six-reserves';
  await read(page);
  await figure(page, '$8,000.00: cbBTC $2,000.00, JitoSOL $2,000.00, SOL $2,000.00, mSOL $1,000.00, bSOL $1,000.00');
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

test('no positions, an address that is not one, and a read that failed', async ({ page, api }) => {
  await page.goto(KAMINO);
  api.kamino = 'none';
  await read(page);
  await expect(page.getByRole('status').filter({ hasText: 'This wallet has no open positions on Kamino.' })).toBeVisible();

  await read(page, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  await expect(page.getByRole('alert').filter({ hasText: 'That is not a Solana address.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

  api.kamino = 'error';
  await read(page);
  const failure = page.getByRole('alert').filter({ hasText: 'Could not read the position from Solana, try again' });
  await expect(failure).toBeVisible();
  api.kamino = 'healthy';
  await failure.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'The position' })).toBeVisible();
});
