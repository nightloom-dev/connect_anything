import type { Page } from '@playwright/test';
import { RECIPES } from './mocks/api.ts';
import { INTERMEDIARY, SOLANA_TX } from './mocks/connect.ts';
import { HEALTHY, RECORDED_WALLET } from './mocks/kamino.ts';
import { BASE_ETH, BASE_USDC, SOL_USDC } from './mocks/tokens.ts';
import { KAMINO, shared } from './paths.ts';
import { alertOf, expect, pollUntil, statusOf, test } from './support.ts';
import { MockSolanaWallet, SOLANA_WALLET, TX_HASH, WALLET, WALLET_NAME, type MockWallet } from './wallet.ts';

// Every state of the payment panel (Execute in src/features/run/execute.tsx), one test each, numbered as in the redesign brief. Most
// run on /kamino, where the target LTV fills in 800 USDC; the fake Connect quotes it at 776.16 USDC delivered, at least.
// What a state shows is pinned by its words, and what it does by the requests and wallet prompts behind it.

const RESCUE = `${KAMINO}?wallet=${RECORDED_WALLET}&obligation=${HEALTHY.address}`;
const QUOTE = 'Get exact amount and fee';
const SIGN = 'Sign and run';
const DONE = 'Done: the instructions ran on Solana.';
const SETTLING = 'Waiting for the bridge and the execution. After the deposit, execution takes about 150 seconds plus the MPC signature.';
const CONSENT = 'I have read what will run, and I accept that it was made by whoever shared this link.';
const IN_FLIGHT = 'This wallet already has an execution in flight, and Connect runs one at a time per wallet and chain:';
const FROM_THIS_BROWSER = 'You started an execution from this browser:';
const DELETE = 'Delete it (a signature that moves no money)';
const NEW_PAYMENT = 'Start a new payment';
/** ERC-20 transfer(address,uint256). */
const TRANSFER = '0xa9059cbb';

/** /kamino on the healthy position, with the wallet connected and its intermediary known. */
async function rescue(page: Page, wallet: MockWallet) {
  await page.goto(RESCUE);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await wallet.connect();
  await expect(page.getByText(`Your intermediary on Solana: ${INTERMEDIARY}`)).toBeVisible();
}

async function quote(page: Page) {
  await page.getByRole('button', { name: QUOTE }).click();
  await expect(page.getByRole('button', { name: SIGN })).toBeEnabled();
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** The stage of the run the card marks as the current one. */
const stage = (page: Page) => page.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]');
/** Every stage of the run, each with how it ended, as a screen reader hears it. */
const stages = (page: Page) => page.getByRole('list', { name: 'Progress' }).getByRole('listitem');
const shows = (page: Page, text: string | RegExp) => expect(page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).first()).toBeVisible();

test('state 01 no wallet: nothing is quoted until an EVM wallet connects', async ({ page, connect }) => {
  await page.goto(RESCUE);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await shows(page, 'Connect an EVM wallet to continue.');
  // the card's one button connects a wallet, and nothing that quotes is on the screen yet
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', { name: 'Connect wallet', exact: true })).toBeEnabled();
  expect(connect.requests).toEqual([]);
});

test('state 02 a wallet that is not EVM is refused, and Switch wallet trades it for an EVM one', async ({ page, connect, wallet }) => {
  const solana = new MockSolanaWallet(page);
  await solana.install();
  await page.goto(RESCUE);
  await solana.connect();
  await shows(page, 'This is not an EVM wallet. Recipes are paid from Base, Arbitrum or Ethereum, so connect an EVM wallet.');
  await expect(button(page, QUOTE)).toHaveCount(0);
  // nothing is looked up for it
  expect(connect.requests).toEqual([]);

  // it disconnects the Solana wallet and opens the list of wallets again
  await button(page, 'Switch wallet').click();
  await page.getByRole('button', { name: new RegExp(WALLET_NAME) }).click();
  await expect(page.getByText(WALLET, { exact: true })).toBeVisible();
  await expect(page.getByText(SOLANA_WALLET, { exact: true })).toHaveCount(0);
  await expect(page.getByText(`Your intermediary on Solana: ${INTERMEDIARY}`)).toBeVisible();
  await expect(button(page, QUOTE)).toBeEnabled();
  expect(await wallet.calls('personal_sign')).toEqual([]);
});

test('state 03 the intermediary is being looked up', async ({ page, connect, wallet }) => {
  const lookup = connect.hold('intermediary');
  await page.goto(RESCUE);
  await wallet.connect();
  await lookup.reached();
  await shows(page, 'Looking up your intermediary…');
  await expect(button(page, QUOTE)).toBeDisabled();
  lookup.release();
  await expect(page.getByText(`Your intermediary on Solana: ${INTERMEDIARY}`)).toBeVisible();
  await expect(page.getByText('Looking up your intermediary…')).toHaveCount(0);
  await expect(button(page, QUOTE)).toBeEnabled();
});

test('state 03 once looked up, the intermediary says what it is on a click, in place', async ({ page, wallet }) => {
  await rescue(page, wallet);
  const word = button(page, 'intermediary');
  const note = page.getByText('A Solana account that Intents Connect controls for your EVM wallet. It runs the instructions, and what they do not spend stays there.', { exact: true });
  await expect(word).toHaveAttribute('aria-expanded', 'false');
  await expect(note).toBeHidden();
  await word.click();
  await expect(word).toHaveAttribute('aria-expanded', 'true');
  await expect(note).toBeVisible();
  // the line still reads as one sentence, and the keyboard folds the note again
  await expect(page.getByText(`Your intermediary on Solana: ${INTERMEDIARY}`)).toBeVisible();
  await word.press('Enter');
  await expect(word).toHaveAttribute('aria-expanded', 'false');
  await expect(note).toBeHidden();
});

test('state 04 the lookup of the intermediary failed, and Try again asks again', async ({ page, connect, wallet }) => {
  connect.lookupFailures = 1;
  connect.lookupStatus = 503;
  await page.goto(RESCUE);
  await wallet.connect();
  const failure = alertOf(page, 'Could not look up your intermediary: Intents Connect is not answering right now (503). An execution already started may still be running, so check it before paying again.');
  await expect(failure).toBeVisible();
  await expect(button(page, QUOTE)).toBeDisabled();
  await failure.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(`Your intermediary on Solana: ${INTERMEDIARY}`)).toBeVisible();
  await expect(failure).toHaveCount(0);
  await expect(button(page, QUOTE)).toBeEnabled();
});

test('state 05 Solana is not enabled for the Connect key', async ({ page, connect, wallet }) => {
  connect.intermediary = null;
  await page.goto(RESCUE);
  await wallet.connect();
  await shows(page, 'Payments to Solana are not switched on for this site yet.');
  await expect(page.getByText('Your intermediary on Solana')).toHaveCount(0);
  await expect(button(page, QUOTE)).toBeDisabled();
});

test("state 06 Connect does not deliver the recipe's token", async ({ page, api, wallet }) => {
  api.tokens = 'no-usdc';
  await page.goto(RESCUE);
  await wallet.connect();
  await shows(page, "Intents Connect does not deliver this recipe's token right now, so it cannot run.");
  await expect(button(page, QUOTE)).toBeDisabled();
});

test('state 07 a recipe that cannot be built, or that Connect would refuse, cannot run', async ({ page, wallet }) => {
  await page.goto(shared(RECIPES.unbuildable));
  await expect(alertOf(page, 'This recipe cannot be built:')).toBeVisible();
  await wallet.connect();
  await shows(page, 'This recipe cannot run, see above.');
  await expect(button(page, QUOTE)).toBeDisabled();

  // AppKit reconnects the wallet on the next page by itself
  await page.goto(shared(RECIPES.foreignToken));
  await expect(alertOf(page, 'Connect cannot run this recipe:')).toContainText('No step references the token this recipe receives');
  await shows(page, 'This recipe cannot run, see above.');
  await expect(button(page, QUOTE)).toBeDisabled();
});

test('state 08 a shared recipe waits for consent', async ({ page, wallet }) => {
  await page.goto(shared(RECIPES.demo));
  await wallet.connect();
  const consent = page.getByRole('checkbox', { name: CONSENT });
  await shows(page, 'Tick the box above first.');
  await expect(button(page, QUOTE)).toBeDisabled();

  await consent.check();
  await expect(page.getByText('Tick the box above first.')).toHaveCount(0);
  // a shared recipe suggests no amount
  await expect(page.getByLabel('Amount')).toHaveValue('');
  await page.getByLabel('Amount').fill('5');
  await expect(button(page, QUOTE)).toBeEnabled();

  // taking it back stops the quote again
  await consent.uncheck();
  await shows(page, 'Tick the box above first.');
  await expect(button(page, QUOTE)).toBeDisabled();
});

test('state 09 no amount, or no token from the chain chosen', async ({ page, api, wallet }) => {
  api.tokens = 'no-arbitrum';
  await rescue(page, wallet);
  const amount = page.getByLabel('Amount');
  await expect(amount).toHaveValue('800');
  await amount.fill('');
  await shows(page, 'Enter an amount of USDC.');
  await expect(button(page, QUOTE)).toBeDisabled();
  // more decimals than USDC has
  await amount.fill('1.0000001');
  await shows(page, 'Enter an amount of USDC.');
  await amount.fill('800');
  await expect(button(page, QUOTE)).toBeEnabled();

  const chain = page.getByRole('combobox', { name: 'Chain', exact: true });
  await chain.selectOption('arb');
  await shows(page, 'Intents Connect takes no token from this chain right now.');
  await expect(page.getByRole('combobox', { name: 'Token', exact: true })).toBeDisabled();
  await expect(button(page, QUOTE)).toBeDisabled();

  // less than the fee: what arrives would not even pay for it
  await chain.selectOption('base');
  await amount.fill('0.01');
  await button(page, QUOTE).click();
  await expect(alertOf(page, 'The amount does not cover the network fee.')).toBeVisible();
  await expect(button(page, SIGN)).toHaveCount(0);
});

test('state 09 another token than the page worked its figure out in: the figure stays behind, and an alert says what it was', async ({ page, wallet }) => {
  await rescue(page, wallet);
  const amount = page.getByLabel('Amount');
  const token = page.getByRole('combobox', { name: 'Token', exact: true });
  const other = statusOf(page, 'This page worked out 800 USDC. To pay with ETH, enter what that is worth.');
  await expect(amount).toHaveValue('800');
  await expect(other).toHaveCount(0);

  await token.selectOption(BASE_ETH.assetId);
  await expect(other).toBeVisible();
  await expect(amount).toHaveValue('');
  await shows(page, 'Enter an amount of ETH.');
  await expect(button(page, QUOTE)).toBeDisabled();

  // back on the token the figure is in, the figure is back and the alert gone
  await token.selectOption(BASE_USDC.assetId);
  await expect(amount).toHaveValue('800');
  await expect(other).toHaveCount(0);
  await expect(button(page, QUOTE)).toBeEnabled();
});

test('state 10 the quote is being worked out, through the 503s of a busy Connect', async ({ page, connect, wallet }) => {
  await page.clock.install();
  await rescue(page, wallet);
  const dry = connect.hold('dry-create');
  await button(page, QUOTE).click();
  await dry.reached();
  await expect(statusOf(page, 'Getting the exact amount and fee…')).toBeVisible();
  await expect(button(page, QUOTE)).toBeDisabled();
  await expect(page.getByLabel('Amount')).toBeDisabled();
  dry.release();
  await expect(button(page, SIGN)).toBeEnabled();
  await expect(statusOf(page, 'Getting the exact amount and fee…')).toHaveCount(0);

  // no durable nonce free: the app asks three more times, 2.5 s apart, and then says so
  connect.failCreates = 4;
  await button(page, QUOTE).click();
  const busy = alertOf(page, 'Connect has no durable nonce free right now, even after a few tries. Nothing was created, so try again in a minute.');
  await pollUntil(page, () => busy.isVisible(), { step: 2_500 });
  expect(connect.failCreates).toBe(0);
  await expect(button(page, SIGN)).toHaveCount(0);

  // and one 503 goes unnoticed
  connect.failCreates = 1;
  await button(page, QUOTE).click();
  await pollUntil(page, () => button(page, SIGN).isVisible(), { step: 2_500 });
  await expect(busy).toHaveCount(0);
  expect(connect.list()).toEqual([]);
});

test('state 11 the quote: what is paid, what arrives, the fee, and what the repay does', { tag: '@mobile' }, async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  await expect(button(page, 'Copy the address you pay from')).toBeVisible();
  // every figure of the quote at the precision the most exact one needs
  await shows(page, '800.00000 USDC on Base, plus the gas of the deposit');
  await shows(page, "at least 776.16000 USDC, after the bridge's fee and slippage: the bridge keeps 3% of what you pay");
  await shows(page, '0.02000 USDC, taken out of what is delivered');
  // (776.16 - 0.02) × 99.75%: the SDK keeps a quarter percent back for the quote to move
  await expect(page.getByText('774.19965 USDC', { exact: true })).toHaveCount(2);
  // and says so, so that the rows add up: 776.16000 - 0.02000 - 1.94035 = 774.19965
  await shows(page, 'Held back for price moves');
  await shows(page, '1.94035 USDC');
  await shows(page, 'It stays with your intermediary, and Refund takes it back.');
  await shows(page, 'It repays');
  // a little over the target, said short, with why on its own line
  await shows(page, '45.32% (target 45%)');
  await shows(page, 'The fee comes out of what is delivered.');
  await shows(page, 'Your wallet asks for one signature, then for the deposit, switching to Base if it is on another network.');

  // three dry creates, and nothing real or signed yet
  const creates = connect.requests.filter(({ method, path }) => method === 'POST' && /^\/api\/v1\/executions\/[^/]+$/.test(path));
  expect(creates.map(({ body }) => body.dry)).toEqual([true, true, true]);
  expect(creates[2].body.quote).toMatchObject({ originAsset: BASE_USDC.assetId, destinationAsset: SOL_USDC.assetId, amount: '800000000' });
  expect(connect.list()).toEqual([]);
  expect(await wallet.calls('personal_sign')).toEqual([]);

  // a new amount drops the quote
  await page.getByLabel('Amount').fill('700');
  await expect(button(page, SIGN)).toHaveCount(0);
});

test('state 12 the quote moved before the signature: new figures, and the old attempt is deleted first', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.moveOnCreate = 100;
  await button(page, SIGN).click();
  await shows(page, 'The quote moved before you signed. These are the new numbers, and nothing was charged.');
  await shows(page, 'Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.');
  await shows(page, "at least 768.24000 USDC, after the bridge's fee and slippage: the bridge keeps 4% of what you pay");
  // 768.24000 - 0.02000 - 1.92055
  await expect(page.getByText('766.29945 USDC', { exact: true })).toHaveCount(2);
  const [first] = connect.list();
  expect(first).toMatchObject({ status: 'CREATED', details: { messageSigned: false } });
  expect(await wallet.calls('personal_sign')).toEqual([]);

  await button(page, SIGN).click();
  await expect(statusOf(page, DONE)).toBeVisible();
  // one signature deleted the first attempt, the other ran the second
  expect(await wallet.calls('personal_sign')).toHaveLength(2);
  expect(connect.list().map(({ id, status }) => [id, status])).toEqual([[expect.not.stringMatching(first.id), 'SUCCESS']]);
});

test('state 13 a declined signature: the attempt is deleted, or held unsigned until deleted', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);

  // declined, and the deletion the SDK asks for next is signed
  await wallet.rejectSignatures(1);
  await button(page, SIGN).click();
  await expect(alertOf(page, 'The request was rejected in the wallet.')).toBeVisible();
  await expect(button(page, SIGN)).toBeEnabled();
  expect(connect.list()).toEqual([]);

  // both declined: the attempt keeps the wallet's one slot
  await wallet.rejectSignatures(2);
  await button(page, SIGN).click();
  await expect(alertOf(page, 'The request was rejected in the wallet.')).toBeVisible();
  const [unsigned] = connect.list();
  expect(unsigned).toMatchObject({ status: 'CREATED', details: { messageSigned: false } });
  await shows(page, 'Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.');

  // without a quote on the screen, the page offers the deletion itself
  await page.getByLabel('Amount').fill('700');
  const held = statusOf(page, 'An attempt was created and never signed. It blocks new payments from this wallet until you delete it.');
  await expect(held).toBeVisible();
  await held.getByRole('button', { name: DELETE }).click();
  await shows(page, `Execution ${unsigned.id} was deleted, so a new run can start.`);
  expect(connect.list()).toEqual([]);
});

test('state 14 the run goes through its phases, and the form stays locked meanwhile', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.script = ['DEPOSIT_PROCESSING', 'SUCCESS'];
  const lookup = connect.hold('intermediary');
  const create = connect.hold('create');
  const submit = connect.hold('submit');
  const signature = await wallet.hold('personal_sign');
  const transfer = await wallet.hold('eth_sendTransaction');
  await button(page, SIGN).click();

  // the run looks the intermediary up again while it plans
  await lookup.reached();
  await expect(statusOf(page, 'Working out the exact amounts…')).toBeVisible();
  await expect(button(page, SIGN)).toBeDisabled();
  await expect(page.getByLabel('Amount')).toBeDisabled();
  await expect(page.getByLabel('Target LTV, %')).toBeDisabled();
  lookup.release();

  await create.reached();
  await expect(statusOf(page, 'Creating the execution…')).toBeVisible();
  create.release();

  await signature.reached();
  // the wallet asks, and the card says where to look
  await expect(statusOf(page, 'Sign the message in your wallet.')).toContainText('Check your wallet');
  await shows(page, /^Created, not signed yet\. Execution \S+ · CREATED$/);
  await expect(stage(page)).toContainText('Signature');
  await signature.release();

  await submit.reached();
  await expect(statusOf(page, 'Submitting your signature…')).toBeVisible();
  submit.release();

  await transfer.reached();
  await expect(statusOf(page, 'Confirm the deposit in your wallet.')).toContainText('Check your wallet');
  // The page has not read the execution since the signature, and its CREATED is stale: the stages are at the deposit,
  // and the line under them leaves that status out.
  await expect(stage(page)).toContainText('Deposit');
  await expect(page.getByText(/· CREATED$/)).toHaveCount(0);
  await shows(page, /^Signed, waiting for the deposit\. Execution \S+$/);
  await transfer.release();

  await expect(statusOf(page, SETTLING)).toBeVisible();
  await shows(page, /^Crossing the bridge\. Execution \S+ · DEPOSIT_PROCESSING$/);
  await expect(stage(page)).toContainText('Bridge');
  // the wait is timed, and the person can leave
  await expect(page.getByText(/^Running for \d+:\d\d\. You can close this page: come back and press Resume\.$/)).toBeVisible();
  // one quote is good for one signature, and once it is signed the run leads the card: nothing starts another meanwhile
  await expect(button(page, SIGN)).toHaveCount(0);
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(button(page, NEW_PAYMENT)).toHaveCount(0);
  await expect(statusOf(page, DONE)).toBeVisible();
  await shows(page, /^Done\. Execution \S+ · SUCCESS$/);

  // the run that ended still leads, and a new payment waits behind a quiet button
  await expect(page.getByLabel('Amount you pay')).toHaveCount(0);
  await button(page, NEW_PAYMENT).click();
  await expect(page.getByLabel('Amount you pay')).toBeFocused();
  // after a repay the page folds its target away and gives no amount, so the new payment waits for one
  await shows(page, 'Enter an amount of USDC.');
  await expect(button(page, QUOTE)).toBeDisabled();
  await page.getByLabel('Amount you pay').fill('100');
  await expect(button(page, QUOTE)).toBeEnabled();
  await expect(statusOf(page, DONE)).toBeVisible();
});

test('state 14 when the wallet asks for the signature, what to do and the stages come into view', async ({ page, wallet }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rescue(page, wallet);
  await quote(page);
  // Sign and run at the foot of the screen, where what it starts would be out of view
  await button(page, SIGN).evaluate(node => window.scrollBy({ top: node.getBoundingClientRect().bottom - window.innerHeight + 8, behavior: 'instant' }));
  const signature = await wallet.hold('personal_sign');
  await button(page, SIGN).click();
  await signature.reached();
  await expect(statusOf(page, 'Sign the message in your wallet.')).toBeInViewport();
  await expect(page.getByRole('list', { name: 'Progress' })).toBeInViewport({ ratio: 1 });
  await signature.release();
  await expect(statusOf(page, DONE)).toBeVisible();
});

test('state 14 from the keyboard, the focus stays with the run: on Sign and run while the wallet signs, then on what the wallet asks next', async ({ page, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  const signature = await wallet.hold('personal_sign');
  const deposit = await wallet.hold('eth_sendTransaction');
  const sign = button(page, SIGN);
  await sign.focus();
  await page.keyboard.press('Enter');
  await signature.reached();
  // busy, it keeps the focus, and a second press does nothing
  await expect(sign).toBeFocused();
  await expect(sign).toHaveAttribute('aria-busy', 'true');
  await expect(sign).toBeDisabled();
  await signature.release();
  await deposit.reached();
  // signed, the form folds away: the focus waits on what the wallet asks now and on the stages, not on the page
  await expect(page.locator(':focus')).toContainText('Confirm the deposit in your wallet.');
  await deposit.release();
  await expect(statusOf(page, DONE)).toBeVisible();
  expect(await wallet.calls('personal_sign')).toHaveLength(1);
});

test('state 14 while a run is in flight, the wallet it is followed with cannot be disconnected from the header', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.script = ['DEPOSIT_PROCESSING'];
  await button(page, SIGN).click();
  await expect(statusOf(page, SETTLING)).toBeVisible();

  await page.getByRole('button', { name: /^Wallet 0x/ }).click();
  const menu = page.getByRole('dialog', { name: 'Wallet' });
  const disconnect = menu.getByRole('button', { name: 'Disconnect' });
  await expect(disconnect).toBeDisabled();
  await expect(disconnect).toHaveAccessibleDescription('A run is in progress. Disconnect once it ends.');

  // and once it ends, it can
  const [execution] = connect.list();
  connect.then(execution.id, 'SUCCESS');
  await expect(statusOf(page, DONE)).toBeVisible();
  await expect(disconnect).toBeEnabled();
  await expect(menu.getByText('A run is in progress.')).toHaveCount(0);
  await disconnect.click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Connect wallet' })).toBeVisible();
});

test('state 15 another execution of this recipe is in flight: the page offers to resume it', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  const other = connect.seed({ wallet: WALLET, status: 'CREATED', signed: false, script: ['SUCCESS'] });
  await button(page, SIGN).click();

  await shows(page, `${IN_FLIGHT} ${other.id}`);
  await shows(page, 'Created, and it still needs your signature');
  await shows(page, new RegExp(`^800 USDC on Base to ${other.quote.depositAddress}$`));
  // it leads the card, and nothing else can start until it is resolved
  await expect(button(page, SIGN)).toHaveCount(0);
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(button(page, NEW_PAYMENT)).toHaveCount(0);
  await expect(button(page, DELETE)).toBeEnabled();

  await button(page, 'Resume it').click();
  await expect(statusOf(page, DONE)).toBeVisible();
  expect(connect.list().map(({ id, status }) => [id, status])).toEqual([[other.id, 'SUCCESS']]);
});

test('state 15 an execution of this recipe made outside this app cannot be resumed here, and deleting it is the way on', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  // without the record of what its instructions spend that a create through the SDK writes, so the SDK will not sign it
  const other = connect.seed({ wallet: WALLET, status: 'CREATED', signed: false });
  delete other.metadata!.intentsConnectSpendable;
  await button(page, SIGN).click();
  await shows(page, `${IN_FLIGHT} ${other.id}`);
  // offered as any other execution of this recipe: the SDK refuses it only once asked to sign it
  await button(page, 'Resume it').click();

  const refused = statusOf(page, 'This execution cannot be resumed here.');
  await expect(refused).toContainText('It was made outside this app, without a record of what its instructions spend, so this page cannot check it before your wallet signs.');
  // in plain words, not the SDK's
  await expect(page.getByText('Missing prepared Solana spendable amount')).toHaveCount(0);
  expect(await wallet.calls('personal_sign')).toEqual([]);

  await refused.getByRole('button', { name: DELETE }).click();
  await shows(page, `Execution ${other.id} was deleted, so a new run can start.`);
  expect(connect.list()).toEqual([]);
  const [deletion] = await wallet.calls('personal_sign');
  expect(JSON.stringify(deletion.params)).toContain('delete_execution');

  // and the payment on the page goes through
  await button(page, SIGN).click();
  await expect(statusOf(page, DONE)).toBeVisible();
});

test('state 16 the deposit transfer was declined: send it again, or cancel', async ({ page, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  await wallet.rejectTransactions(1);
  await button(page, SIGN).click();

  const retry = statusOf(page, 'The deposit transfer did not go through.');
  await expect(retry).toContainText('Cancelling only deletes the execution. It does not call back a deposit already sent');
  await expect(retry.getByRole('button', { name: 'Cancel the execution', exact: true })).toBeEnabled();
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(button(page, NEW_PAYMENT)).toHaveCount(0);
  await retry.getByRole('button', { name: 'Send the deposit again' }).click();
  await expect(statusOf(page, DONE)).toBeVisible();
  expect(await wallet.calls('eth_sendTransaction')).toHaveLength(2);
  expect(await wallet.calls('personal_sign')).toHaveLength(1);
});

test('state 17 the page stopped following an execution that has not finished', async ({ page, connect, wallet }) => {
  await page.clock.install();
  await rescue(page, wallet);
  await quote(page);
  connect.failReads = 5;
  await button(page, SIGN).click();

  const stopped = statusOf(page, 'This execution has not finished, and this page stopped following it. Do not pay again before you know how it ended.');
  await pollUntil(page, () => stopped.isVisible());
  await expect(alertOf(page, 'Intents Connect is not answering right now (503).')).toBeVisible();
  // not failed, not running here: paused where it was
  await expect(stage(page)).toContainText('paused');
  await expect(stage(page)).toContainText('This page stopped following it');
  // paying again could pay twice, so nothing offers it
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(button(page, NEW_PAYMENT)).toHaveCount(0);
  await expect(button(page, SIGN)).toHaveCount(0);

  await stopped.getByRole('button', { name: 'Resume' }).click();
  await expect(statusOf(page, DONE)).toBeVisible();
  expect(await wallet.calls('personal_sign')).toHaveLength(1);
});

test('state 18 after a reload, an execution started here is offered again, and resuming asks the wallet nothing', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.script = ['DEPOSIT_PROCESSING'];
  await button(page, SIGN).click();
  await expect(statusOf(page, SETTLING)).toBeVisible();
  const [execution] = connect.list();

  await page.reload();
  await shows(page, `${FROM_THIS_BROWSER} ${execution.id}`);
  await shows(page, 'Crossing the bridge, signed');
  // the deposit it has, in the explorer of the chain it was paid on
  await expect(page.getByRole('link', { name: `${TX_HASH.slice(0, 6)}…${TX_HASH.slice(-4)}` })).toHaveAttribute('href', `https://basescan.org/tx/${TX_HASH}`);
  await shows(page, 'It is already signed, so resuming only follows it here and asks your wallet for nothing.');
  await expect(button(page, 'Hide')).toBeVisible();
  connect.then(execution.id, 'SUCCESS');
  await button(page, 'Resume it').click();
  await expect(statusOf(page, DONE)).toBeVisible();
  // the wallet of the reloaded page was asked nothing
  expect(await wallet.calls('personal_sign')).toEqual([]);
  expect(await wallet.calls('eth_sendTransaction')).toEqual([]);
});

test('state 19 a resumed execution waits for its deposit, which can come from anywhere', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  await wallet.rejectTransactions(1);
  await button(page, SIGN).click();
  await expect(statusOf(page, 'The deposit transfer did not go through.')).toBeVisible();
  const [execution] = connect.list();

  await page.reload();
  await shows(page, `${FROM_THIS_BROWSER} ${execution.id}`);
  await button(page, 'Resume it').click();
  // the network and the token's contract are named: the same address on another one never reaches Connect
  const contract = BASE_USDC.contractAddress!;
  const waiting = statusOf(page, `Send exactly 800 USDC on Base (contract ${contract.slice(0, 6)}…${contract.slice(-4)}) to ${execution.quote.depositAddress}`);
  await expect(waiting).toBeVisible();
  await expect(waiting).toContainText('If you already sent it, wait: sending it again would pay twice.');
  // each in the explorer of that network
  const explorer = waiting.getByRole('link', { name: 'Open in Basescan (new tab)' });
  await expect(explorer).toHaveCount(2);
  await expect(explorer.nth(0)).toHaveAttribute('href', `https://basescan.org/token/${contract}`);
  await expect(explorer.nth(1)).toHaveAttribute('href', `https://basescan.org/address/${execution.quote.depositAddress}`);
  await expect(waiting.getByRole('button', { name: 'Cancel, I will not send it' })).toBeEnabled();
  expect(await wallet.calls('eth_sendTransaction')).toEqual([]);

  // sent from another wallet
  connect.get(execution.id).funded = true;
  await expect(statusOf(page, DONE)).toBeVisible();
});

test('state 20 the deposit window passed', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.script = ['EXPIRED'];
  await button(page, SIGN).click();
  await expect(statusOf(page, 'The deposit window has passed. A late deposit can still revive this execution, or you can cancel it.')).toBeVisible();
  await shows(page, /^Deposit window passed\. Execution \S+ · EXPIRED$/);
  // the page still polls for a late deposit, which waits on the person: paused, not in progress
  await expect(stage(page)).toContainText('Deposit, paused');
  await expect(stage(page)).toContainText('Waiting for a late deposit');
  await expect(button(page, 'Cancel the execution')).toBeEnabled();
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(button(page, NEW_PAYMENT)).toHaveCount(0);
});

test('state 21 the deposit failed', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.script = ['DEPOSIT_FAILED'];
  await button(page, SIGN).click();
  await expect(alertOf(page, 'The deposit failed, for example on an invalid amount, so nothing ran on Solana. What was transferred is refunded.')).toBeVisible();
  await shows(page, /^Deposit failed\. Execution \S+ · DEPOSIT_FAILED$/);
  // it broke at the deposit, so nothing after it is drawn as done
  await expect(stages(page)).toContainText(['Signature, done', 'Deposit, failed', 'Bridge, not reached', 'Execution, not reached', 'Result, not reached']);
  await expect(stages(page).nth(1)).toContainText('The deposit failed, so nothing ran');
  await expect(button(page, 'Refund')).toHaveCount(0);
  // nothing is left to resolve: a new payment waits behind a quiet button
  await expect(button(page, QUOTE)).toHaveCount(0);
  await button(page, NEW_PAYMENT).click();
  await expect(button(page, QUOTE)).toBeEnabled();
});

test('state 22 success: the deposit, the Solana transaction, and the position read again', { tag: '@mobile' }, async ({ page, api, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  api.kamino = 'repaid';
  await button(page, SIGN).click();
  await expect(statusOf(page, DONE)).toBeVisible();
  await expect(page.getByRole('link', { name: `${TX_HASH.slice(0, 4)}…${TX_HASH.slice(-4)}` })).toHaveAttribute('href', `https://basescan.org/tx/${TX_HASH}`);
  await expect(page.getByRole('link', { name: `${SOLANA_TX.slice(0, 4)}…${SOLANA_TX.slice(-4)}` })).toHaveAttribute('href', `https://solscan.io/tx/${SOLANA_TX}`);
  await expect(statusOf(page, 'After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.')).toBeVisible();
  await expect(button(page, 'Read again')).toBeVisible();

  // one signature, then 800 USDC on Base to the deposit address of the execution
  const [execution] = connect.list();
  expect(await wallet.calls('personal_sign')).toHaveLength(1);
  const [transfer] = await wallet.calls('eth_sendTransaction');
  const [tx] = transfer.params as { to: string; data: string }[];
  expect(tx.to.toLowerCase()).toBe(BASE_USDC.contractAddress!.toLowerCase());
  expect(tx.data).toBe(`${TRANSFER}${execution.quote.depositAddress.slice(2).padStart(64, '0')}${(800_000_000).toString(16).padStart(64, '0')}`);
  expect(connect.requests.find(({ path }) => path === '/api/v1/executions/deposit/submit')?.body).toMatchObject({ txHash: TX_HASH, depositAddress: execution.quote.depositAddress });
});

test('state 22 after a success, a new amount from the page opens a new payment with it', async ({ page, api, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  api.kamino = 'repaid';
  await button(page, SIGN).click();
  await expect(statusOf(page, DONE)).toBeVisible();
  // the position read again is at the target: the page has no amount for the card, and the run leads it
  await expect(statusOf(page, 'After the run the debt is $3,600.00, from $4,400.00, and the LTV is 45.00%, from 55.00%.')).toBeVisible();
  await expect(button(page, QUOTE)).toHaveCount(0);
  await expect(button(page, NEW_PAYMENT)).toBeVisible();

  // a lower target asks for 800 USDC more: Repay more opens the target the page folded away after the repay
  await page.getByRole('button', { name: 'Repay more' }).click();
  const target = page.getByLabel('Target LTV, %');
  await target.fill('35');
  // the card opens a new payment with that amount, over how the last run ended, and the focus stays where it was
  await expect(page.getByLabel('Amount you pay')).toHaveValue('800');
  await expect(button(page, QUOTE)).toBeEnabled();
  await expect(button(page, NEW_PAYMENT)).toHaveCount(0);
  await expect(statusOf(page, DONE)).toBeVisible();
  await expect(target).toBeFocused();
});

test('state 23 the instructions failed on Solana: retry with what the intermediary holds, or refund it', async ({ page, api, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  // the run fails, then its retry, and the Refund goes through
  connect.scripts.push(['OPERATION_FAILED'], ['OPERATION_FAILED']);
  api.balance = '510000';
  await button(page, SIGN).click();

  const failed = alertOf(page, 'The instructions failed on Solana, so the money stayed with your intermediary. You can run them again with it, or send it back.');
  await expect(failed).toBeVisible();
  await shows(page, 'Your intermediary holds 0.51 USDC.');
  // it broke at the execution, and the Result says where the money waits
  await expect(stages(page)).toContainText(['Signature, done', 'Deposit, done', 'Bridge, done', 'Execution, failed', 'Result, paused']);
  await expect(stages(page).last()).toContainText('Money is with your intermediary');

  // Retry spends what the intermediary holds, so it deposits nothing
  await button(page, 'Retry').click();
  await shows(page, 'The recipe spends');
  await button(page, 'Sign and retry').click();
  await expect.poll(() => connect.list()[1]?.status).toBe('OPERATION_FAILED');
  const retry = connect.list()[1];
  expect(retry).toMatchObject({ executionMode: 'steps_only', quote: { destinationAsset: SOL_USDC.assetId } });
  await expect(failed).toBeVisible();
  expect(await wallet.calls('eth_sendTransaction')).toHaveLength(1);
  await expect(stages(page)).toContainText(['Signature, done', 'Deposit, not needed', 'Bridge, not needed', 'Execution, failed', 'Result, paused']);

  // Refund sends it back to the wallet on Base
  await button(page, 'Refund').click();
  await shows(page, '0.475398 USDC on Base');
  // its fee at the precision of what comes back, as in the payment's quote
  await shows(page, '0.020000 USDC');
  await shows(page, WALLET);
  await expect(button(page, 'Sign and retry')).toHaveCount(0);
  await button(page, 'Sign and refund').click();
  await expect(statusOf(page, DONE)).toBeVisible();
  // a Refund deposits nothing: it runs its transfer on Solana, then crosses the bridge back
  await expect(stages(page)).toContainText(['Signature, done', 'Deposit, not needed', 'Execution, done', 'Bridge, done', 'Success, complete']);
  const refund = connect.list()[2];
  expect(refund.quote).toMatchObject({ originAsset: SOL_USDC.assetId, destinationAsset: BASE_USDC.assetId, amount: '510000', recipient: WALLET });
  expect(await wallet.calls('personal_sign')).toHaveLength(3);
  expect(await wallet.calls('eth_sendTransaction')).toHaveLength(1);
});

test('state 24 the Refund failed too: the money is still with the intermediary', async ({ page, api, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.scripts.push(['OPERATION_FAILED'], ['OPERATION_FAILED']);
  api.balance = '510000';
  await button(page, SIGN).click();
  await button(page, 'Refund').click();
  await button(page, 'Sign and refund').click();
  await expect(alertOf(page, 'The Refund failed, so the money is still with your intermediary. You can send it back again.')).toBeVisible();
  await shows(page, 'Your intermediary holds 0.51 USDC.');
  // the Refund broke at its transfer on Solana, before the bridge
  await expect(stages(page)).toContainText(['Signature, done', 'Deposit, not needed', 'Execution, failed', 'Bridge, not reached', 'Result, paused']);
  await expect(stages(page).nth(2)).toContainText('The transfer back failed on Solana');
  await expect(stages(page).last()).toContainText('Money is still with your intermediary');
  await expect(button(page, 'Retry')).toHaveCount(0);

  // and again, which goes through
  await button(page, 'Refund').click();
  await button(page, 'Sign and refund').click();
  await expect(statusOf(page, DONE)).toBeVisible();
  expect(connect.list().map(({ status }) => status)).toEqual(['OPERATION_FAILED', 'OPERATION_FAILED', 'SUCCESS']);
});

test('state 25 what a run left with the intermediary is offered back', async ({ page, api, wallet }) => {
  api.balance = '510000';
  await rescue(page, wallet);
  await expect(statusOf(page, 'Whatever a run does not spend stays with your intermediary until you send it back.')).toBeVisible();
  await shows(page, 'Your intermediary holds 0.51 USDC.');
  await expect(button(page, 'Retry')).toHaveCount(0);
  await button(page, 'Refund').click();
  await button(page, 'Sign and refund').click();
  await expect(statusOf(page, DONE)).toBeVisible();
});

test('state 26 an execution in flight that is not this recipe is never signed, only deleted', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  // created between the runner's check and its create, which Connect answers with a 409: a transfer of the
  // intermediary's SOL, by whoever knows the wallet's address
  const drain = { programId: '11111111111111111111111111111111', discriminator: '02000000', args: [], accounts: [{ pubkey: INTERMEDIARY, isSigner: true, isWritable: true }] };
  const create = connect.hold('create');
  await button(page, SIGN).click();
  await create.reached();
  const foreign = connect.seed({ wallet: WALLET, status: 'CREATED', signed: false, steps: [drain] });
  create.release();

  await shows(page, `${IN_FLIGHT} ${foreign.id}`);
  await expect(alertOf(page, 'This is not the recipe on this page, so this page will not sign or fund it. Anyone who knows your wallet address can create an execution for it, so if you did not start this one, delete it.')).toBeVisible();
  await expect(button(page, 'Resume it')).toHaveCount(0);
  expect(await wallet.calls('personal_sign')).toEqual([]);
  await button(page, DELETE).click();
  await shows(page, `Execution ${foreign.id} was deleted, so a new run can start.`);
  await expect(page.getByRole('region', { name: /Notifications/ }).getByText('Execution deleted')).toBeVisible();
  expect(connect.list()).toEqual([]);

  await button(page, SIGN).click();
  await expect(statusOf(page, DONE)).toBeVisible();
});

test('state 27 an execution is cancelled', async ({ page, connect, wallet }) => {
  await rescue(page, wallet);
  await quote(page);
  connect.script = ['EXPIRED'];
  await button(page, SIGN).click();
  await button(page, 'Cancel the execution').click();
  await expect(statusOf(page, 'The execution was cancelled.')).toBeVisible();
  // the stages stop where it was
  await expect(stages(page)).toContainText(['Signature, done', 'Deposit, cancelled', 'Bridge, not reached', 'Execution, not reached', 'Result, not reached']);
  expect(connect.list()).toEqual([]);
  const [, deletion] = await wallet.calls('personal_sign');
  expect(JSON.stringify(deletion.params)).toContain('delete_execution');
});
