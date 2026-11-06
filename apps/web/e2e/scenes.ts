import { expect, type Page } from '@playwright/test';
import type { ApiMocks } from './mocks/api.ts';
import { RECIPES } from './mocks/api.ts';
import type { FakeConnect } from './mocks/connect.ts';
import { INTERMEDIARY } from './mocks/connect.ts';
import { WRONG_MARKET_RECIPE } from './mocks/fixtures.ts';
import { HEALTHY, NEAR_LIQUIDATION, RECORDED_WALLET } from './mocks/kamino.ts';
import { BUILDER, KAMINO, LANDING, NOT_FOUND, shared } from './paths.ts';
import type { MockWallet } from './wallet.ts';

// Every page, and the states of it that a person reaches and a judge sees, each reached through the mocks as a person
// would. The screenshots, the 360 px check and axe all walk this one list, so a state added here is checked by all three.
// Each scene ends on the words that prove it got there.

export type Fixtures = { page: Page; api: ApiMocks; connect: FakeConnect; wallet: MockWallet };

export type Scene = {
  /** File-safe, for the screenshot. */
  name: string;
  /** What a person sees, for the test title. */
  title: string;
  /** The page as a link opens it, with no click: what its first load shifts is its own (layout.spec.ts). */
  link?: true;
  /** One of the few the tablet width checks too. */
  tablet?: true;
  open: (fixtures: Fixtures) => Promise<void>;
};

const QUOTE = 'Get exact amount and fee';
const SIGN = 'Sign and run';
const DONE = 'Done: the instructions ran on Solana.';
const REPAY = 'repay_obligation_liquidity_v2';
const RESCUE = `${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${HEALTHY.address}`;
/** Where another page, as /kamino, leaves a recipe for the builder. */
const IMPORT = 'connect-anything:builder-import';

const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const alert = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** /kamino on the healthy position, a wallet connected and a quote on the card. */
async function quoted({ page, wallet }: Fixtures) {
  await page.goto(RESCUE);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await wallet.connect();
  await expect(page.getByText(`Your intermediary on Solana: ${INTERMEDIARY}`)).toBeVisible();
  await page.getByRole('button', { name: QUOTE }).click();
  await expect(page.getByRole('button', { name: SIGN })).toBeEnabled();
}

/** /build at step 2 with the demo recipe, handed over as /kamino hands its own: four steps in the tray. */
async function handedOver(page: Page) {
  await page.goto(BUILDER);
  await page.evaluate(([key, json]) => sessionStorage.setItem(key, json), [IMPORT, JSON.stringify(WRONG_MARKET_RECIPE)]);
  await page.goto(BUILDER);
  await expect(page.getByRole('list', { name: 'Steps of the recipe' }).locator(':scope > li')).toHaveCount(4);
}

export const SCENES: Scene[] = [
  {
    name: 'landing',
    title: 'the landing page',
    link: true,
    tablet: true,
    open: async ({ page }) => {
      await page.goto(LANDING);
      await expect(page.getByRole('heading', { name: 'Any Solana program. One signature from any EVM chain.' })).toBeVisible();
    },
  },
  {
    name: 'not-found',
    title: 'a page that does not exist',
    link: true,
    tablet: true,
    open: async ({ page }) => {
      await page.goto(NOT_FOUND);
      await expect(alert(page, 'There is no such page.')).toBeVisible();
    },
  },
  {
    name: 'build-program',
    title: 'the builder, step 1: a program',
    link: true,
    open: async ({ page }) => {
      await page.goto(BUILDER);
      await expect(page.getByRole('heading', { name: '1. Program' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^klend\b/ })).toBeVisible();
    },
  },
  {
    name: 'build-instruction',
    title: 'the builder, step 2: the repay of klend, its accounts to fill',
    tablet: true,
    open: async ({ page }) => {
      await page.goto(BUILDER);
      await page.getByRole('button', { name: /^klend\b/ }).click();
      await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
      const search = page.getByRole('combobox', { name: 'Instruction' });
      await search.click();
      await search.fill(REPAY);
      await expect(page.getByRole('listbox')).not.toHaveAttribute('data-transition');
      await page.getByRole('option', { name: new RegExp(`^${REPAY}\\b`) }).click();
      await expect(page.getByRole('heading', { name: REPAY, level: 3 })).toBeVisible();
      await expect(page.getByRole('listbox')).toHaveCount(0);
    },
  },
  {
    name: 'build-recipe',
    title: 'the builder, step 2: a recipe of four steps handed over',
    open: async ({ page }) => handedOver(page),
  },
  {
    name: 'build-simulation',
    title: 'the builder, step 3: the recipe passed simulation',
    open: async ({ page }) => {
      await handedOver(page);
      await page.getByRole('button', { name: 'Next: simulate' }).click();
      await expect(status(page, 'The recipe passed simulation.')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Program logs' })).toBeVisible();
    },
  },
  {
    name: 'build-run',
    title: 'the builder, step 4: the run card, no wallet yet',
    open: async ({ page }) => {
      await handedOver(page);
      await page.getByRole('button', { name: 'Next: simulate' }).click();
      await expect(status(page, 'The recipe passed simulation.')).toBeVisible();
      await page.getByRole('button', { name: 'Next: run it' }).click();
      await expect(page.getByRole('heading', { name: '4. Run' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toBeVisible();
    },
  },
  {
    name: 'kamino-empty',
    title: 'the Kamino rescue, before a wallet is read',
    link: true,
    open: async ({ page }) => {
      await page.goto(KAMINO);
      await expect(page.getByRole('heading', { name: 'Repay a Kamino debt' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Read positions' })).toBeVisible();
    },
  },
  {
    name: 'kamino-position',
    title: 'the Kamino rescue, a healthy position read',
    link: true,
    open: async ({ page }) => {
      await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}`);
      await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
      await expect(page.getByRole('region', { name: /^Checked on a mainnet fork for / }).getByText('Passed', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'kamino-watcher',
    title: 'the Kamino rescue, opened from a watcher alert on a wallet of three positions',
    link: true,
    open: async ({ page, api }) => {
      api.kamino = 'three';
      await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${NEAR_LIQUIDATION.address}`);
      await expect(status(page, 'Opened from a watcher alert')).toBeVisible();
      await expect(page.getByText('Repay $1,000.00, which is 1000 USDC.')).toBeVisible();
      await expect(page.getByRole('region', { name: /^Checked on a mainnet fork for / }).getByText('Passed', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'kamino-quote',
    title: 'the Kamino rescue, quoted and ready to sign',
    tablet: true,
    open: async fixtures => {
      await quoted(fixtures);
      await expect(fixtures.page.getByRole('region', { name: /^Checked on a mainnet fork for / }).getByText('Passed', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'kamino-success',
    title: 'the Kamino rescue, after a run that went through',
    open: async fixtures => {
      await quoted(fixtures);
      fixtures.api.kamino = 'repaid';
      await fixtures.page.getByRole('button', { name: SIGN }).click();
      await expect(status(fixtures.page, DONE)).toBeVisible();
      await expect(fixtures.page.getByRole('region', { name: 'After the run' }).getByRole('status')).toHaveText(
        'After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.',
      );
    },
  },
  {
    name: 'kamino-failed',
    title: 'the Kamino rescue, after the instructions failed on Solana: Retry or Refund',
    open: async fixtures => {
      await quoted(fixtures);
      fixtures.connect.scripts.push(['OPERATION_FAILED']);
      fixtures.api.balance = '510000';
      await fixtures.page.getByRole('button', { name: SIGN }).click();
      await expect(alert(fixtures.page, 'The instructions failed on Solana, so the money stayed with your intermediary.')).toBeVisible();
      await expect(fixtures.page.getByText('Your intermediary holds 0.51 USDC.')).toBeVisible();
    },
  },
  {
    name: 'shared',
    title: 'a shared recipe, before consent',
    link: true,
    tablet: true,
    open: async ({ page }) => {
      await page.goto(shared(RECIPES.demo));
      await expect(page.getByText('What will run: 4 instructions on 1 program')).toBeVisible();
      await expect(page.getByText('differs from the IDL the program publishes: do not trust the names below')).toBeVisible();
    },
  },
  {
    name: 'shared-dead',
    title: 'a shared link that leads to no recipe',
    link: true,
    open: async ({ page }) => {
      await page.goto(shared(RECIPES.missing));
      await expect(alert(page, 'This link does not lead to a recipe.')).toBeVisible();
    },
  },
];
