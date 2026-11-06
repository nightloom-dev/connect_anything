import type { Page } from '@playwright/test';
import { KeyboardWalk } from './focus.ts';
import { RECORDED_WALLET } from './mocks/kamino.ts';
import { BUILDER, KAMINO } from './paths.ts';
import { expect, statusOf, test } from './support.ts';
import { WALLET, WALLET_NAME } from './wallet.ts';

// The two flows of the app from the keyboard alone: Tab and Shift+Tab, Enter, Space and the arrows, no click. Every
// stop of the focus on the way is checked (focus.ts): a person must see where it is, and nothing may cover it. The
// walk's whole path is attached to each test.

// the app turns its transitions off, so that a stop is judged on how it looks once it has the focus
test.use({ reducedMotion: 'reduce' });

const REPAY = 'repay_obligation_liquidity_v2';
// The repay of fixtures/klend-repay.sim.json, as builder.spec.ts fills it.
const REPAY_ACCOUNTS = {
  'repay_accounts.obligation': '2WAWpMP739iZuLPAwGqx9mwPCAbDurYMPHuaDj28qnMt',
  'repay_accounts.lending_market': '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF',
  'repay_accounts.repay_reserve': 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
  'repay_accounts.reserve_liquidity_mint': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'repay_accounts.reserve_destination_liquidity': 'Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6',
  'repay_accounts.token_program': 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'repay_accounts.instruction_sysvar_account': 'Sysvar1nstructions1111111111111111111111111',
  lending_market_authority: '9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo',
  farms_program: 'FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr',
};

const QUOTE = 'Get exact amount and fee';
const SIGN = 'Sign and run';
const position = (page: Page) => expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();

async function expectSeen(walk: KeyboardWalk, { covered = true } = {}) {
  await test.info().attach('focus path', { body: walk.path(), contentType: 'text/plain' });
  expect.soft(walk.unseen(), 'stops where the focus could not be seen').toEqual([]);
  if (covered) expect.soft(walk.covered(), 'stops where what has the focus could not be seen at all').toEqual([]);
}

/** /kamino with a position, Tab down to the last link of the footer, then Shift+Tab back up to the address. */
async function backUp(page: Page) {
  const walk = await KeyboardWalk.on(page);
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}`);
  await position(page);
  await walk.tabTo(page.getByRole('contentinfo').getByRole('link').last());
  await walk.tabTo(page.getByLabel('Wallet address'), { back: true });
  return walk;
}

/** The run card's Connect EVM wallet, then the mock wallet in AppKit's modal: Enter on each, Tab between. */
async function connectByKeyboard(page: Page, walk: KeyboardWalk) {
  await walk.tabTo(page.getByRole('button', { name: 'Connect EVM wallet' }));
  await walk.press('Enter');
  await walk.tabTo(page.getByRole('button', { name: new RegExp(WALLET_NAME) }));
  await walk.press('Enter');
  await expect(page.getByText(WALLET, { exact: true })).toBeVisible();
}

test('/kamino from the keyboard: an address, its positions, a target, a quote and the signature', async ({ page, wallet: _ }) => {
  // the whole rescue, with the page walked three times over
  test.slow();
  const walk = await KeyboardWalk.on(page);
  await page.goto(KAMINO);

  await walk.tabTo(page.getByLabel('Wallet address'));
  await walk.type(RECORDED_WALLET);
  await walk.tabTo(page.getByRole('button', { name: 'Read positions' }));
  await walk.press('Enter');
  await position(page);

  // the target: the slider moves by the arrows, and the field follows
  const target = page.getByLabel('Target LTV, %');
  await walk.tabTo(page.getByRole('slider', { name: 'Target LTV' }));
  await walk.press('ArrowLeft');
  await expect(target).toHaveValue('44');
  await walk.press('ArrowRight');
  await expect(target).toHaveValue('45');
  await position(page);

  await connectByKeyboard(page, walk);
  await walk.tabTo(page.getByRole('button', { name: QUOTE }));
  await walk.press('Enter');
  const sign = page.getByRole('button', { name: SIGN });
  await expect(sign).toBeEnabled();
  await walk.tabTo(sign);
  await walk.press('Enter');
  await expect(statusOf(page, 'Done: the instructions ran on Solana.')).toBeVisible();

  await expectSeen(walk);
});

test('/kamino from the keyboard, down the page and back up: every stop shows the focus, both ways', async ({ page }) => {
  // whether the sticky header covers a stop on the way up is the test after the next
  await expectSeen(await backUp(page), { covered: false });
});

test('/build from the keyboard: an example, the instruction search, its accounts, the recipe, a simulation and the export', async ({ page }) => {
  // nine addresses to type, then three steps of the builder
  test.slow();
  const walk = await KeyboardWalk.on(page);
  await page.goto(BUILDER);

  await walk.tabTo(page.getByRole('button', { name: /^Kamino Lend\b/ }));
  await walk.press('Enter');
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();

  const search = page.getByRole('combobox', { name: 'Instruction' });
  await walk.tabTo(search);
  await walk.type(REPAY);
  await expect(page.getByRole('option', { name: new RegExp(`^${REPAY}\\b`) })).toBeVisible();
  await walk.press('ArrowDown');
  await walk.press('Enter');
  await expect(page.getByRole('heading', { name: REPAY, level: 3 })).toBeVisible();

  // the argument first, as the form has it, then the accounts
  const delivered = page.getByLabel('Uses the amount delivered');
  await walk.tabTo(delivered);
  await walk.press('Space');
  await expect(delivered).toBeChecked();
  for (const [name, value] of Object.entries(REPAY_ACCOUNTS)) {
    await walk.tabTo(page.getByLabel(`Address of ${name}`, { exact: true }));
    await walk.type(value);
  }
  await walk.tabTo(page.getByRole('button', { name: 'Add to recipe' }));
  await walk.press('Enter');
  await expect(page.getByRole('button', { name: `Remove ${REPAY}` })).toBeVisible();

  await walk.tabTo(page.getByRole('button', { name: 'Next: simulate' }));
  await walk.press('Enter');
  await expect(statusOf(page, 'The recipe passed simulation.')).toBeVisible();

  // the export: its tabs move by the arrows
  const typescript = page.getByRole('tab', { name: 'TypeScript' });
  const link = page.getByRole('tab', { name: 'Link' });
  await walk.tabTo(link);
  await walk.press('ArrowRight');
  await expect(typescript).toHaveAttribute('aria-selected', 'true');
  await walk.press('ArrowLeft');
  await expect(link).toHaveAttribute('aria-selected', 'true');
  await walk.tabTo(page.getByRole('button', { name: 'Create a link' }));
  await walk.press('Enter');
  await expect(page.getByRole('link', { name: /\/r\/e2e0+1$/ })).toBeVisible();

  await expectSeen(walk);
});

test("AppKit's modal takes the focus when the run card opens it, and the page behind it is out of reach", async ({ page, wallet: _ }) => {
  test.fixme(true, "QA-01: the focus stays on the page behind AppKit's modal, and Tab walks six links and buttons under it before it reaches the modal");
  const walk = await KeyboardWalk.on(page);
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}`);
  await position(page);
  await walk.tabTo(page.getByRole('button', { name: 'Connect EVM wallet' }));
  await walk.press('Enter');
  const first = await walk.press('Tab');
  expect(first.thirdParty, `the first Tab after the modal opened went to ${first.name}`).toBe(true);
  await walk.tabTo(page.getByRole('button', { name: new RegExp(WALLET_NAME) }));
  expect(walk.underModal()).toEqual([]);
});

test('the sticky header never covers the focus as Shift+Tab goes back up the page', async ({ page }) => {
  const walk = await backUp(page);
  expect(walk.covered()).toEqual([]);
});

test('the run card keeps the focus on its buttons while they work: after the quote, the next Tab reaches Sign and run', async ({ page, wallet }) => {
  const walk = await KeyboardWalk.on(page);
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}`);
  await position(page);
  await wallet.connect();
  await walk.tabTo(page.getByRole('button', { name: QUOTE }));
  await walk.press('Enter');
  await expect(page.getByRole('button', { name: SIGN })).toBeEnabled();
  expect(walk.dropped(), 'keys after which nothing had the focus').toEqual([]);
  await walk.press('Tab');
  await expect(page.getByRole('button', { name: SIGN })).toBeFocused();
});
