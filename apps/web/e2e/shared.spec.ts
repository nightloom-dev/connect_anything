import { RECIPES } from './mocks/api.ts';
import { KLEND } from './mocks/fixtures.ts';
import { shared } from './paths.ts';
import { alertOf, expect, statusOf, test } from './support.ts';

// /r/:id runs a recipe someone else made, with the visitor's money. What it must always do: say so, show everything that
// will run, and ask for consent before anything can be quoted or signed.

const QUOTE = 'Get exact amount and fee';
const CONSENT = 'I have read what will run, and I accept that it was made by whoever shared this link.';

test('a shared recipe says who made it, and opens what will run', { tag: '@mobile' }, async ({ page, api }) => {
  const held = api.hold('recipes');
  await page.goto(shared(RECIPES.demo));
  await held.reached();
  await expect(statusOf(page, 'Loading the recipe…')).toBeVisible();
  held.release();

  await expect(statusOf(page, 'This recipe was made by whoever shared this link, not by Connect Anything.')).toContainText('Run it only if you trust the person who sent you the link');
  // open from the start, unlike on the builder
  await expect(page.getByText('What will run: 4 instructions on 1 program')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Instructions, in this order' })).toBeVisible();
  await expect(page.getByRole('link', { name: KLEND })).toBeVisible();
  await expect(page.getByText('calls itself kamino_lending')).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/refresh_reserve[\s\S]*refresh_reserve[\s\S]*refresh_obligation[\s\S]*repay_obligation_liquidity_v2/);
  // the amount is the quote's, and nobody knows it yet
  await expect(page.getByText('"liquidity_amount": "the amount delivered, known after the quote"')).toBeVisible();

  // consent comes before anything else is asked (run-states state 08 has the rest)
  await expect(page.getByRole('checkbox', { name: CONSENT })).not.toBeChecked();
  await expect(page.getByText('Connect an EVM wallet to continue.')).toBeVisible();
  await expect(page.getByRole('button', { name: QUOTE })).toBeDisabled();
});

test('the IDL a recipe carries is checked against the one the program publishes', async ({ page, api }) => {
  const held = api.hold('idl');
  await page.goto(shared(RECIPES.demo));
  await held.reached();
  await expect(page.getByText("checking the program's published IDL…")).toBeVisible();
  held.release();
  // klend.idl.json has no address on instruction_sysvar_account, and the demo recipe's IDL has one
  await expect(page.getByText('differs from the IDL the program publishes: do not trust the names below')).toBeVisible();

  api.idl = 'recipe';
  await page.reload();
  await expect(page.getByText('matches the IDL the program publishes')).toBeVisible();

  // any failed read says the same: a program with no Anchor IDL, a legacy one, an RPC error
  api.idl = 'missing';
  await page.reload();
  await expect(page.getByText('could not be compared with an IDL the program publishes, so the names below are only the word of whoever made the link')).toBeVisible();
});

test('a link that leads to no recipe, or to a malformed one, runs nothing', async ({ page }) => {
  for (const id of [RECIPES.missing, 'not-a-recipe-id']) {
    await page.goto(shared(id));
    await expect(alertOf(page, 'This link does not lead to a recipe. Check it with whoever sent it to you.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toHaveCount(0);
  }

  await page.goto(shared(RECIPES.corrupt));
  await expect(alertOf(page, 'This recipe is malformed: it is not a version 1 recipe. Nothing can run from this link.')).toBeVisible();
  await expect(page.getByText('What will run')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect EVM wallet' })).toHaveCount(0);
});
