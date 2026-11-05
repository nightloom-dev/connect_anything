import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { KLEND } from './mocks/fixtures.ts';
import { BUILDER } from './paths.ts';
import { expect, test } from './support.ts';

const KLEND_FILE = fileURLToPath(new URL('../../../recipes/kamino-rescue/klend.idl.json', import.meta.url));
const REPAY = 'repay_obligation_liquidity_v2';
const STAND_IN = '3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7';

// The repay of fixtures/klend-repay.sim.json, the one the simulation fixtures were recorded with.
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

async function uploadKlend(page: Page) {
  await page.goto(BUILDER);
  await page.getByLabel('IDL file').setInputFiles(KLEND_FILE);
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
}

/** Fills the repay with the accounts of the fixture, takes the amount delivered and adds it. */
async function addRepay(page: Page) {
  await page.getByRole('button', { name: new RegExp(`^${REPAY}\\b`) }).click();
  for (const [name, address] of Object.entries(REPAY_ACCOUNTS)) await page.getByLabel(`Address of ${name}`, { exact: true }).fill(address);
  await page.getByLabel('Takes the amount delivered, known when the recipe runs').check();
  await page.getByRole('button', { name: 'Add to recipe' }).click();
}

test('an uploaded IDL lists its instructions, and a repay is added once its accounts are filled', { tag: '@mobile' }, async ({ page, api }) => {
  await uploadKlend(page);
  expect(api.requests.find(({ path }) => path === '/api/idl/parse')?.body).toMatchObject({ address: KLEND, metadata: { name: 'kamino_lending' } });
  await expect(page.getByText(KLEND, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load another program' })).toBeVisible();
  await expect(page.getByLabel('Token the recipe receives')).toHaveValue(/sol-5ce3bf3a/);
  await expect(page.getByRole('heading', { name: 'Instructions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { pressed: false }).filter({ hasText: 'arguments,' })).toHaveCount(66);
  await expect(page.getByRole('heading', { name: 'Recipe', exact: true })).toBeVisible();
  await expect(page.getByText('Nothing yet. Instructions run in the order added')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next: simulate' })).toBeDisabled();

  const repay = page.getByRole('button', { name: new RegExp(`^${REPAY}\\b`) });
  await expect(repay).toHaveAccessibleName(`${REPAY} 1 arguments, 13 accounts`);
  await repay.click();
  await expect(repay).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: REPAY, level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arguments' })).toBeVisible();
  await expect(page.getByLabel('liquidity_amount')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
  await expect(page.getByText('the intermediary of whoever runs this', { exact: true })).toBeVisible();
  await expect(page.getByText('Not checked yet. This page only checks that the recipe touches the token it receives')).toBeVisible();

  const add = page.getByRole('button', { name: 'Add to recipe' });
  await expect(add).toBeDisabled();
  await expect(page.getByText(`Not ready: ${REPAY}: no address for repay_accounts.obligation, `)).toBeVisible();
  const entries = Object.entries(REPAY_ACCOUNTS);
  for (const [index, [name, address]] of entries.entries()) {
    await page.getByLabel(`Address of ${name}`, { exact: true }).fill(address);
    // still one account short until the last
    if (index < entries.length - 1) await expect(add).toBeDisabled();
  }
  // and the argument is empty: either a figure or the amount delivered
  await expect(page.getByText(/^Not ready: .*liquidity_amount/)).toBeVisible();
  await expect(add).toBeDisabled();
  await page.getByLabel('Takes the amount delivered, known when the recipe runs').check();
  await expect(page.getByLabel('liquidity_amount')).toBeDisabled();
  await expect(add).toBeEnabled();
  await expect(page.getByText(/^Not ready:/)).toHaveCount(0);
  await add.click();

  await expect(page.getByRole('listitem').filter({ hasText: `${REPAY} KLen…gmjD` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
  await page.getByRole('button', { name: 'Next: simulate' }).click();
  await expect(page.getByRole('heading', { name: '3. Simulation and export' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: '3. Simulation' })).toHaveAttribute('aria-current', 'step');
});

test('a simulation shows its verdict, compute units, bytes and logs: ok, warn, fail and offline', async ({ page, api }) => {
  await uploadKlend(page);
  await addRepay(page);
  await page.getByRole('button', { name: 'Next: simulate' }).click();

  // it runs on its own with 1 USDC, as the stand-in intermediary
  await expect(page.getByRole('status').filter({ hasText: 'The recipe passed simulation.' })).toBeVisible();
  const request = api.requests.find(({ path }) => path === '/api/simulate')?.body as Record<string, any>;
  expect(request).toMatchObject({ intermediary: STAND_IN, fund: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: '1000000' } });
  expect(request.instructions).toHaveLength(1);
  await expect(page.getByLabel('Test amount')).toHaveValue('1');
  await expect(page.getByText('115,948 / 200k')).toBeVisible();
  await expect(page.getByText('934 / 1232')).toBeVisible();
  await expect(page.getByText('Logs (34)')).toBeVisible();
  await expect(page.getByText('Tested with 1 USDC delivered, as an intermediary that holds just that.')).toBeVisible();

  api.simulate = 'warn';
  await page.getByLabel('Test amount').fill('2.5');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The recipe passed simulation with warnings.' })).toBeVisible();
  await expect(page.getByText('250,028 / 200k')).toBeVisible();
  await expect(page.getByText('1134 / 1232')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'CU 250.0k > 200k' })).toBeVisible();
  await expect(page.getByText('Tested with 2.5 USDC delivered')).toBeVisible();
  expect((api.requests.findLast(({ path }) => path === '/api/simulate')?.body as Record<string, any>).fund.amount).toBe('2500000');

  api.simulate = 'fail';
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The recipe failed in simulation, and would most likely fail for real.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'ConstraintHasOne: Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation) (instruction index 3) in KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD' })).toBeVisible();
  await expect(page.getByText('70,330 / 200k')).toBeVisible();
  await expect(page.getByText('Logs (31)')).toBeVisible();

  api.simulate = 'offline';
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The simulator is offline, so this recipe has not been checked. You can still export and run it. (The simulator is offline: SIM_URL is not set)' })).toBeVisible();
  // export does not wait for a verdict
  await expect(page.getByRole('button', { name: 'Create a link' })).toBeEnabled();

  await page.getByLabel('Test amount').fill('0.0000001');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '"0.0000001" is not an amount of USDC, which has 6 decimals.' })).toBeVisible();
});

test('export makes a link that opens the recipe, and TypeScript for the SDK', async ({ page, api }) => {
  api.simulate = 'offline';
  await uploadKlend(page);
  await addRepay(page);
  await page.getByRole('button', { name: 'Next: simulate' }).click();

  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
  await expect(page.getByText('A module exporting a SolanaRecipe for the Aurora SDK.')).toBeVisible();
  // the module names the type, and the program it calls
  await expect(page.getByText(new RegExp(`SolanaRecipe[\\s\\S]*${KLEND}`))).toBeVisible();

  const held = api.hold('recipes');
  await page.getByRole('button', { name: 'Create a link' }).click();
  await held.reached();
  await expect(page.getByRole('button', { name: 'Creating the link…' })).toBeDisabled();
  held.release();
  const link = page.getByRole('link', { name: /\/r\/e2e0+1$/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^http:\/\/localhost:\d+\/r\/e2e0{28}1$/);
  await expect(page.getByRole('button', { name: 'Copy' }).first()).toBeVisible();
  const posted = api.requests.find(({ method, path }) => method === 'POST' && path === '/api/recipes')?.body as Record<string, any>;
  expect(posted).toMatchObject({ version: 1, destination: { chain: 'sol', tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }, steps: [{ program: KLEND, ixName: REPAY, amountArg: 'liquidity_amount' }] });
  expect(Object.keys(posted.idls)).toEqual([KLEND]);

  const href = (await link.getAttribute('href'))!;

  await page.getByRole('button', { name: 'Next: run it' }).click();
  await expect(page.getByRole('heading', { name: '4. Run' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: '4. Run' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toBeVisible();

  // the link opens what was posted, on a page of its own
  await page.goto(href);
  await expect(page.getByRole('heading', { name: 'A recipe someone shared with you' })).toBeVisible();
  await expect(page.getByText('What will run: 1 instruction on 1 program')).toBeVisible();
});

test('a program ID loads its published IDL, and a failure says what to do', async ({ page, api }) => {
  await page.goto(BUILDER);
  const programId = page.getByLabel('Program ID');
  const load = page.getByRole('button', { name: 'Load', exact: true });
  await expect(load).toBeDisabled();

  await programId.fill('not-a-key');
  await load.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Not a public key' })).toBeVisible();

  await programId.fill('11111111111111111111111111111111');
  await load.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Program 11111111111111111111111111111111 has no Anchor IDL account. Upload its IDL file instead.' })).toBeVisible();

  api.idl = 'legacy';
  await programId.fill(KLEND);
  await load.click();
  await expect(page.getByRole('alert').filter({ hasText: 'This IDL is in the legacy pre-0.30 format, and only the simulator service converts it. It is not connected here (SIM_URL), so upload a 0.30+ IDL file instead.' })).toBeVisible();

  api.idl = 'converted';
  const held = api.hold('idl');
  await load.click();
  await held.reached();
  await expect(page.getByRole('status').filter({ hasText: 'Reading the IDL…' })).toBeVisible();
  await expect(load).toBeDisabled();
  held.release();
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await expect(page.getByText(KLEND, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Load another program' }).click();
  await expect(page.getByRole('heading', { name: '1. Program' })).toBeVisible();
});

test('an IDL file with a program ID is read as that program, and a legacy file is refused', async ({ page, api }) => {
  await page.goto(BUILDER);
  await page.getByLabel('Program ID').fill(KLEND);
  await page.getByLabel('IDL file').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: '0.1.0', name: 'kamino_lending', instructions: [] })) });
  await expect(page.getByRole('alert').filter({ hasText: 'This IDL is in the legacy pre-0.30 format' })).toBeVisible();
  expect(api.requests.findLast(({ path }) => path === '/api/idl/parse')).toBeTruthy();

  await page.getByLabel('IDL file').setInputFiles(KLEND_FILE);
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
});

test('with no Solana token to deliver, no recipe can be built', async ({ page, api }) => {
  api.tokens = 'empty';
  await page.goto(BUILDER);
  await page.getByLabel('IDL file').setInputFiles(KLEND_FILE);
  await expect(page.getByRole('alert').filter({ hasText: 'Intents Connect lists no Solana token to deliver right now, so no recipe can be built.' })).toBeVisible();
});
