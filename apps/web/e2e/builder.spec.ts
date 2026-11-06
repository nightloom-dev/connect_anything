import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { KLEND, WRONG_MARKET_RECIPE } from './mocks/fixtures.ts';
import { SOL_USDT } from './mocks/tokens.ts';
import { BUILDER } from './paths.ts';
import { alertOf, expect, statusOf, test } from './support.ts';

const KLEND_FILE = fileURLToPath(new URL('../../../recipes/kamino-rescue/klend.idl.json', import.meta.url));
const REPAY = 'repay_obligation_liquidity_v2';
const STAND_IN = '3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7';
const WHIRLPOOLS = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
/** Where another page, as /kamino, leaves a recipe for the builder. */
const IMPORT = 'connect-anything:builder-import';

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

/** Picks an instruction by searching for its name. */
async function pick(page: Page, name: string) {
  const search = page.getByRole('combobox', { name: 'Instruction' });
  await search.click();
  await search.fill(name);
  await settled(page);
  await page.getByRole('option', { name: new RegExp(`^${name}\\b`) }).click();
  await expect(search).toHaveValue(name);
}

/** Lists and menus slide in: a click while one moves can miss its option and close it. */
const settled = (page: Page) => expect(page.getByRole('listbox')).not.toHaveAttribute('data-transition');

/** Picks the token the recipe receives. */
async function chooseToken(page: Page, symbol: string) {
  await page.getByLabel('Token the recipe receives').click();
  await settled(page);
  await page.getByRole('option', { name: new RegExp(`^${symbol}\\b`) }).click();
}

const address = (page: Page, name: string) => page.getByLabel(`Address of ${name}`, { exact: true });
/** The steps themselves, not the account rows a step shows when opened. */
const recipeSteps = (page: Page) => page.getByRole('list', { name: 'Steps of the recipe' }).locator(':scope > li');
const stepper = (page: Page) => page.getByRole('navigation', { name: 'Steps' });

/** Fills the repay with the accounts of the fixture, takes the amount delivered and adds it. */
async function addRepay(page: Page) {
  await pick(page, REPAY);
  for (const [name, value] of Object.entries(REPAY_ACCOUNTS)) await address(page, name).fill(value);
  await page.getByLabel('Uses the amount delivered').check();
  await page.getByRole('button', { name: 'Add to recipe' }).click();
}

/** Leaves a recipe for the builder in this tab, as another page does before it opens /build. */
async function handOver(page: Page, value: unknown) {
  await page.evaluate(([key, json]) => sessionStorage.setItem(key, json), [IMPORT, typeof value === 'string' ? value : JSON.stringify(value)]);
}

const handedOver = (page: Page) => page.evaluate(key => sessionStorage.getItem(key), IMPORT);

test('an uploaded IDL lists its instructions, and a repay is added once its accounts are filled', { tag: '@mobile' }, async ({ page, api }) => {
  await uploadKlend(page);
  expect(api.requests.find(({ path }) => path === '/api/idl/parse')?.body).toMatchObject({ address: KLEND, metadata: { name: 'kamino_lending' } });
  await expect(page.getByText(KLEND, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load another program' })).toBeVisible();
  await expect(page.getByLabel('Token the recipe receives')).toContainText('USDC');
  await expect(page.getByRole('heading', { name: 'Recipe', exact: true })).toBeVisible();
  await expect(page.getByText('Nothing yet. Instructions run in the order added')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next: simulate' })).toBeDisabled();
  const search = page.getByRole('combobox', { name: 'Instruction' });
  await expect(search).toBeVisible();
  await expect(page.getByText('66 instructions', { exact: true })).toBeVisible();
  // the list, while open, is all a screen reader has
  await search.click();
  await expect(page.getByRole('option')).toHaveCount(66);

  const repay = page.getByRole('option', { name: new RegExp(`^${REPAY}\\b`) });
  await expect(repay).toHaveAccessibleName(`${REPAY} 1 argument, 13 accounts`);
  await repay.click();
  await expect(search).toHaveValue(REPAY);
  await expect(page.getByRole('heading', { name: REPAY, level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arguments' })).toBeVisible();
  await expect(page.getByLabel('liquidity_amount')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
  await expect(page.getByText('the intermediary of whoever runs this', { exact: true })).toBeVisible();
  await expect(page.getByText('Signers checked: Connect signs only as the intermediary, and this instruction needs no other signer.')).toBeVisible();

  const add = page.getByRole('button', { name: 'Add to recipe' });
  await expect(add).toBeDisabled();
  await expect(page.getByRole('link', { name: 'repay_accounts.obligation needs an address' })).toBeVisible();
  const entries = Object.entries(REPAY_ACCOUNTS);
  for (const [index, [name, value]] of entries.entries()) {
    await address(page, name).fill(value);
    // still one account short until the last
    if (index < entries.length - 1) await expect(add).toBeDisabled();
  }
  // and the argument is empty: either a figure or the amount delivered
  await expect(page.getByRole('link', { name: 'liquidity_amount needs a value' })).toBeVisible();
  await expect(add).toBeDisabled();
  await page.getByLabel('Uses the amount delivered').check();
  await expect(page.getByLabel('liquidity_amount')).toBeDisabled();
  await expect(add).toBeEnabled();
  await expect(page.getByText('Ready to add: every argument and account is filled in.')).toBeVisible();
  await expect(page.getByText('Still to fill in')).toHaveCount(0);
  await add.click();

  await expect(recipeSteps(page).filter({ hasText: REPAY }).filter({ hasText: 'kamino_lending' }).filter({ hasText: 'KLen…gmjD' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Remove ${REPAY}` })).toBeVisible();
  await page.getByRole('button', { name: 'Next: simulate' }).click();
  await expect(page.getByRole('heading', { name: '3. Simulation and export' })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Simulate' })).toHaveAttribute('aria-current', 'step');
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
  const units = page.getByRole('meter', { name: 'Compute units' });
  const size = page.getByRole('meter', { name: 'Transaction size' });
  await expect(units).toHaveAttribute('aria-valuetext', '115,948 of 200,000 CU');
  await expect(page.getByText('115,948 / 200,000 CU')).toBeVisible();
  await expect(size).toHaveAttribute('aria-valuetext', '934 of 1,232 bytes');
  await expect(page.getByRole('region', { name: 'Program logs' })).toBeVisible();
  await expect(page.getByText('34 lines')).toBeVisible();
  await expect(page.getByText('Tested with 1 USDC delivered, as an intermediary that holds just that.')).toBeVisible();

  const simulate = page.getByRole('button', { name: 'Simulate', exact: true });
  api.simulate = 'warn';
  await page.getByLabel('Test amount').fill('2.5');
  await simulate.click();
  await expect(page.getByRole('status').filter({ hasText: 'The recipe passed simulation with warnings.' })).toBeVisible();
  await expect(units).toHaveAttribute('aria-valuetext', '250,028 of 200,000 CU, over the limit');
  await expect(page.getByText('50,028 CU over the limit')).toBeVisible();
  await expect(size).toHaveAttribute('aria-valuetext', '1,134 of 1,232 bytes');
  await expect(page.getByRole('listitem').filter({ hasText: 'CU 250.0k > 200k' })).toBeVisible();
  await expect(page.getByText('Tested with 2.5 USDC delivered')).toBeVisible();
  expect((api.requests.findLast(({ path }) => path === '/api/simulate')?.body as Record<string, any>).fund.amount).toBe('2500000');

  api.simulate = 'fail';
  await simulate.click();
  await expect(page.getByRole('alert').filter({ hasText: 'The recipe failed in simulation, and would most likely fail for real.' })).toBeVisible();
  // the error by name, then where: its code, the instruction and the program
  const error = page.getByRole('alert').filter({ hasText: 'Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation)' });
  await expect(error.getByText('ConstraintHasOne', { exact: true })).toBeVisible();
  await expect(error.getByText('2001', { exact: true })).toBeVisible();
  await expect(error.getByText('index 3', { exact: true })).toBeVisible();
  await expect(error.getByText(KLEND, { exact: true })).toBeVisible();
  await expect(units).toHaveAttribute('aria-valuetext', '70,330 of 200,000 CU');
  await expect(page.getByText('31 lines')).toBeVisible();

  api.simulate = 'offline';
  await simulate.click();
  await expect(statusOf(page, 'Not checked — simulator offline. You can still export and run.')).toBeVisible();
  await expect(statusOf(page, 'Not checked — simulator offline.')).toContainText('The simulator is offline: SIM_URL is not set');
  // export does not wait for a verdict
  await expect(page.getByRole('button', { name: 'Create a link' })).toBeEnabled();

  await page.getByLabel('Test amount').fill('0.0000001');
  await simulate.click();
  await expect(page.getByRole('alert').filter({ hasText: '"0.0000001" is not an amount of USDC, which has 6 decimals.' })).toBeVisible();
});

test('export makes a link that opens the recipe, and TypeScript for the SDK', async ({ page, api }) => {
  api.simulate = 'offline';
  await uploadKlend(page);
  await addRepay(page);
  await page.getByRole('button', { name: 'Next: simulate' }).click();

  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'TypeScript' }).click();
  await expect(page.getByText('A module exporting a SolanaRecipe for the Aurora SDK.')).toBeVisible();
  // the module names the type, and the program it calls
  await expect(page.getByText(new RegExp(`SolanaRecipe[\\s\\S]*${KLEND}`))).toBeVisible();
  await page.getByRole('tab', { name: 'Link' }).click();

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
  await expect(stepper(page).getByRole('button', { name: 'Run' })).toHaveAttribute('aria-current', 'step');
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

  // what is not an address never reaches the server
  await programId.fill('not-a-key');
  await load.click();
  await expect(programId).toHaveAccessibleDescription('A Solana address is base58: letters and digits, without 0, O, I or l.');
  await expect(programId).toBeFocused();
  await programId.fill('KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmj');
  await load.click();
  await expect(programId).toHaveAccessibleDescription('A Solana address is 32 bytes, 32 to 44 characters of base58, and this is not.');
  expect(api.requests.filter(({ path }) => path.startsWith('/api/idl'))).toEqual([]);

  await programId.fill('11111111111111111111111111111111');
  await load.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Program 11111111111111111111111111111111 has no Anchor IDL account. Upload its IDL file instead.' })).toBeVisible();
  // the way out is one click: the file picker
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload the IDL file instead' }).click();
  expect((await chooser).isMultiple()).toBe(false);

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

  // a program read from chain is one click away the next time, and is read again
  await expect(page.getByRole('heading', { name: 'Recent programs' })).toBeVisible();
  const reads = api.requests.filter(({ path }) => path === `/api/idl/${KLEND}`).length;
  await page.getByRole('button', { name: /^kamino_lending KLen…gmjD/ }).click();
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  expect(api.requests.filter(({ path }) => path === `/api/idl/${KLEND}`)).toHaveLength(reads + 1);
  await page.getByRole('button', { name: 'Load another program' }).click();
  await page.getByRole('button', { name: 'Forget recent programs' }).click();
  await expect(page.getByRole('heading', { name: 'Recent programs' })).toHaveCount(0);
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

test('an example loads the IDL that ships with the page, with no request', async ({ page, api }) => {
  await page.goto(BUILDER);
  const examples: [string, string, string][] = [
    ['klend', 'kamino_lending', KLEND],
    ['Orca Whirlpools', 'whirlpool', WHIRLPOOLS],
    ['Meteora DLMM', 'lb_clmm', 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'],
    ['Meteora DAMM v2', 'cp_amm', 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'],
  ];
  for (const [example, name, program] of examples) {
    await page.getByRole('button', { name: new RegExp(`^${example}\\b`) }).click();
    await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(program, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Load another program' }).click();
  }
  expect(api.requests.filter(({ path }) => path.startsWith('/api/idl'))).toEqual([]);
  // nothing was read from chain, so there is nothing recent
  await expect(page.getByRole('heading', { name: 'Recent programs' })).toHaveCount(0);
});

test('a dropped IDL file is read like a picked one', async ({ page, api }) => {
  await page.goto(BUILDER);
  const dataTransfer = await page.evaluateHandle(text => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'klend.idl.json', { type: 'application/json' }));
    return transfer;
  }, readFileSync(KLEND_FILE, 'utf8'));
  await page.getByText('or drop it here').dispatchEvent('dragenter', { dataTransfer });
  await expect(page.getByText('Drop it to read the IDL')).toBeVisible();
  await page.getByText('Drop it to read the IDL').dispatchEvent('drop', { dataTransfer });
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  expect(api.requests.find(({ path }) => path === '/api/idl/parse')?.body).toMatchObject({ address: KLEND, metadata: { name: 'kamino_lending' } });
});

test('the instruction search finds by name or docs, and marks what Connect cannot run', async ({ page }) => {
  await uploadKlend(page);
  const search = page.getByRole('combobox', { name: 'Instruction' });
  await search.click();
  await search.fill('repay');
  // in the order of the IDL, each with its size
  const found = ['repay_obligation_liquidity 1 argument, 9 accounts', `${REPAY} 1 argument, 13 accounts`, 'repay_and_withdraw_and_redeem 2 arguments, 28 accounts', 'flash_repay_reserve_liquidity 2 arguments, 12 accounts'];
  await expect(page.getByRole('option')).toHaveCount(found.length);
  for (const [index, name] of found.entries()) await expect(page.getByRole('option').nth(index)).toHaveAccessibleName(name);
  await search.fill('nothing like it');
  await expect(page.getByText('No instruction has that in its name or docs.')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
  await search.press('Escape');

  // Orca Whirlpools has instructions where a new account signs, which Connect cannot do
  await page.getByRole('button', { name: 'Load another program' }).click();
  await page.getByRole('button', { name: /^Orca Whirlpools\b/ }).click();
  await expect(page.getByText('66 instructions, 11 not supported by Connect')).toBeVisible();
  await search.click();
  await search.fill('open_position');
  await expect(page.getByRole('option')).toHaveCount(3);
  for (const option of await page.getByRole('option').all()) await expect(option).toContainText('Not supported');
  await page.getByRole('option', { name: /^open_position\b/ }).first().click();
  await expect(alertOf(page, 'Connect cannot run this instruction')).toContainText('position_mint: creating a keypair account is not supported');
  await expect(page.getByRole('button', { name: 'Add to recipe' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Connect cannot run this instruction, as said above/ })).toBeVisible();

  await search.click();
  await search.fill('swap');
  await expect(page.getByRole('option', { name: /^swap\b/ })).not.toContainText('Not supported');
});

test('suggested and known addresses fill an account in one click, and the checklist leads to each field', async ({ page }) => {
  await uploadKlend(page);
  await pick(page, REPAY);
  await expect(page.getByText(/found automatically/)).toBeVisible();
  await expect(page.getByText(/need your input/)).toBeVisible();

  // what is missing links to its field
  await page.getByRole('link', { name: 'repay_accounts.obligation needs an address' }).click();
  await expect(address(page, 'repay_accounts.obligation')).toBeFocused();

  // a name that points at a known address offers it
  await page.getByRole('button', { name: 'Token', exact: true }).click();
  await expect(address(page, 'repay_accounts.token_program')).toHaveValue('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  await page.getByRole('button', { name: 'Sysvar Instructions', exact: true }).click();
  await expect(address(page, 'repay_accounts.instruction_sysvar_account')).toHaveValue('Sysvar1nstructions1111111111111111111111111');
  // a mint is offered as the token the recipe receives
  await page.getByRole('button', { name: 'USDC mint', exact: true }).click();
  await expect(address(page, 'repay_accounts.reserve_liquidity_mint')).toHaveValue('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  await expect(page.getByRole('link', { name: 'repay_accounts.token_program needs an address' })).toHaveCount(0);

  // the accounts that need input come first, so the first menu is the obligation's
  await page.getByRole('button', { name: 'Known addresses' }).first().click();
  // a non-modal dialog, named for its field
  const menu = page.getByRole('dialog', { name: 'Known addresses for Address of repay_accounts.obligation' });
  await expect(menu).not.toHaveAttribute('data-transition');
  await menu.getByRole('button', { name: /^System\b/ }).click();
  await expect(address(page, 'repay_accounts.obligation')).toHaveValue('11111111111111111111111111111111');
  await page.getByRole('button', { name: 'Use the intermediary of whoever runs this' }).first().click();
  await expect(address(page, 'repay_accounts.obligation')).toHaveValue(STAND_IN);
});

test('a reload keeps the recipe, its token and the step, which is in the address', async ({ page }) => {
  // three loads of the dev page, seconds of CPU each
  test.slow();
  await uploadKlend(page);
  await expect(page).toHaveURL(/\?step=2$/);
  await addRepay(page);
  await expect(recipeSteps(page)).toHaveCount(1);
  await chooseToken(page, 'USDT');
  await expect(page.getByLabel('Token the recipe receives')).toContainText('USDT');

  await page.reload();
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await expect(page.getByText(KLEND, { exact: true })).toBeVisible();
  await expect(recipeSteps(page)).toHaveCount(1);
  await expect(recipeSteps(page)).toContainText(REPAY);
  await expect(page.getByLabel('Token the recipe receives')).toContainText('USDT');

  await chooseToken(page, 'USDC');
  await page.getByRole('button', { name: 'Next: simulate' }).click();
  await expect(page).toHaveURL(/\?step=3$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: '3. Simulation and export' })).toBeVisible();
  await expect(statusOf(page, 'The recipe passed simulation.')).toBeVisible();
  await expect(page.getByText('Tested with 1 USDC delivered, as an intermediary that holds just that.')).toBeVisible();
});

test('a recipe another page hands over opens at step 2 in place of what the tab had, once', async ({ page }) => {
  await page.goto(BUILDER);
  await page.getByRole('button', { name: /^Orca Whirlpools\b/ }).click();
  await expect(page.getByText(WHIRLPOOLS, { exact: true })).toBeVisible();

  await handOver(page, WRONG_MARKET_RECIPE);
  await page.goto(BUILDER);
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await expect(page.getByText('Recipe opened in the builder')).toBeVisible();
  await expect(page).toHaveURL(/\?step=2$/);
  await expect(page.getByText(KLEND, { exact: true })).toBeVisible();
  await expect(recipeSteps(page)).toHaveCount(4);
  await expect(recipeSteps(page).first()).toContainText('refresh_reserve');
  await expect(recipeSteps(page).last()).toContainText(REPAY);
  await expect(page.getByLabel('Token the recipe receives')).toContainText('USDC');
  // what the Kamino page found shows as such, step by step, remaining accounts too
  const repay = recipeSteps(page).last();
  await repay.getByRole('button', { name: '13 accounts, 8 from the recipe' }).click();
  await expect(repay.getByText('From the recipe 8')).toBeVisible();
  await expect(repay.getByRole('listitem').filter({ hasText: 'repay_accounts.obligation' })).toBeVisible();
  await expect(repay.getByText('Found automatically 5')).toBeVisible();
  const refresh = recipeSteps(page).nth(2);
  await refresh.getByRole('button', { name: '4 accounts, 4 from the recipe' }).click();
  await expect(refresh.getByRole('listitem').filter({ hasText: 'remaining 2' })).toContainText('D6q6…gJ59');
  // read once: the key is gone, and a reload brings back the tab's session, which is now this recipe
  expect(await handedOver(page)).toBeNull();
  await page.reload();
  await expect(recipeSteps(page)).toHaveCount(4);

  await page.getByRole('button', { name: 'Next: simulate' }).click();
  await expect(statusOf(page, 'The recipe passed simulation.')).toBeVisible();
});

test('a handed-over recipe for a token none of its steps touches stays at step 2, with the run locked', async ({ page }) => {
  await page.goto(BUILDER);
  await handOver(page, { ...WRONG_MARKET_RECIPE, destination: { chain: 'sol', assetId: SOL_USDT.assetId, tokenAddress: SOL_USDT.contractAddress } });
  // even when the address asks for the simulation
  await page.goto(`${BUILDER}?step=3`);
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await expect(page.getByLabel('Token the recipe receives')).toContainText('USDT');
  await expect(alertOf(page, 'Connect would refuse this recipe')).toContainText(`No step references the token this recipe receives, ${SOL_USDT.contractAddress}`);
  await expect(page.getByRole('button', { name: 'Next: simulate' })).toBeDisabled();
  for (const name of ['Simulate', 'Run']) await expect(stepper(page).getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
  await stepper(page).getByRole('button', { name: 'Simulate' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Connect would refuse the recipe as it is: see the recipe in step 2.');

  // the token its steps do touch unlocks it
  await chooseToken(page, 'USDC');
  await expect(alertOf(page, 'Connect would refuse this recipe')).toHaveCount(0);
  await stepper(page).getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('heading', { name: '3. Simulation and export' })).toBeVisible();
});

test('a handed-over recipe that cannot be read says why, and is dropped', async ({ page }) => {
  await page.goto(BUILDER);
  await handOver(page, { version: 2, steps: 'all of them' });
  await page.reload();
  await expect(alertOf(page, 'The recipe handed to the builder could not be opened')).toContainText('This recipe is malformed: it is not a version 1 recipe.');
  await expect(page.getByRole('heading', { name: '1. Program' })).toBeVisible();
  expect(await handedOver(page)).toBeNull();

  await handOver(page, 'not JSON');
  await page.reload();
  await expect(alertOf(page, 'The recipe handed to the builder could not be opened')).toContainText('It is not JSON.');
  expect(await handedOver(page)).toBeNull();
  // and the builder works as ever
  await page.getByRole('button', { name: /^klend\b/ }).click();
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await expect(alertOf(page, 'The recipe handed to the builder could not be opened')).toHaveCount(0);
});

test('a link to a later step with nothing loaded opens the program, and says why', async ({ page }) => {
  // three loads of the dev page, seconds of CPU each
  test.slow();
  for (const [step, why] of [
    [2, 'Instructions come from a program: load one first.'],
    [4, 'Nothing to run yet: load a program, then add an instruction.'],
    [3, 'Nothing to simulate yet: load a program, then add an instruction.'],
  ] as const) {
    await page.goto(`${BUILDER}?step=${step}`);
    await expect(page.getByRole('heading', { name: '1. Program' })).toBeVisible();
    await expect(statusOf(page, why)).toBeVisible();
    await expect(page).toHaveURL(/\?step=1$/);
  }
  // nothing is marked done that was not
  await expect(stepper(page).getByRole('button', { name: /, done$/ })).toHaveCount(0);

  // a program loaded, the builder goes on, and the reason is gone
  await page.getByLabel('IDL file').setInputFiles(KLEND_FILE);
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
  await stepper(page).getByRole('button', { name: 'Program' }).click();
  await expect(page.getByRole('heading', { name: '1. Program' })).toBeVisible();
  await expect(statusOf(page, 'Nothing to simulate yet')).toHaveCount(0);

  // with the program and still no recipe, a later step is where the address says, and offers the way back
  await page.goto(`${BUILDER}?step=4`);
  await expect(page.getByRole('heading', { name: '4. Run' })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Simulate' })).not.toHaveAccessibleName(/done/);
  await page.getByRole('button', { name: 'Add an instruction' }).click();
  await expect(page.getByRole('heading', { name: '2. Instruction' })).toBeVisible();
});

test('a step moved in the recipe keeps its accounts open, and the step it passed keeps them closed', async ({ page }) => {
  await page.goto(BUILDER);
  await handOver(page, WRONG_MARKET_RECIPE);
  await page.goto(BUILDER);
  await expect(recipeSteps(page)).toHaveCount(4);
  const repay = () => recipeSteps(page).filter({ hasText: REPAY });
  const obligation = () => recipeSteps(page).filter({ hasText: 'refresh_obligation' });
  await repay().getByRole('button', { name: '13 accounts, 8 from the recipe' }).click();
  await expect(repay().getByText('From the recipe 8')).toBeVisible();

  await page.getByRole('button', { name: `Move ${REPAY} up` }).click();
  await expect(recipeSteps(page).nth(2)).toContainText(REPAY);
  await expect(repay().getByText('From the recipe 8')).toBeVisible();
  await expect(repay().getByRole('button', { name: /accounts/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(obligation().getByRole('button', { name: /accounts/ })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: `Move ${REPAY} down` }).click();
  await expect(recipeSteps(page).last()).toContainText(REPAY);
  await expect(repay().getByText('From the recipe 8')).toBeVisible();
  await expect(obligation().getByRole('button', { name: /accounts/ })).toHaveAttribute('aria-expanded', 'false');

  // a removal does not hand them to the next step either
  await page.getByRole('button', { name: 'Remove refresh_obligation' }).click();
  await expect(recipeSteps(page)).toHaveCount(3);
  await expect(repay().getByText('From the recipe 8')).toBeVisible();
  await expect(recipeSteps(page).nth(1).getByRole('button', { name: /accounts/ })).toHaveAttribute('aria-expanded', 'false');
});
