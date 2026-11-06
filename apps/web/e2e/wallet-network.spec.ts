import { RECORDED_WALLET } from './mocks/kamino.ts';
import { KAMINO } from './paths.ts';
import { expect, statusOf, test } from './support.ts';

// What the app asks of a wallet's network. Each wallet_switchEthereumChain is a prompt the person has to confirm, so a
// wallet already on the chain the person pays from is asked nothing, and the header names the network it is on.

test('a wallet on Base stays on Base: connecting and paying from Base ask for no switch of network', async ({ page, wallet }) => {
  test.fixme(true, 'QA-09: AppKit moves a wallet that connects to Ethereum, its first network, and the run moves it back to Base: two prompts of the wallet');
  await page.goto(`${KAMINO}?wallet=${RECORDED_WALLET}`);
  await expect(page.getByText('Repay $800.00, which is 800 USDC.')).toBeVisible();
  await wallet.connect();
  await expect(page.locator('[data-wallet="connected"]')).toHaveAccessibleName(/ on Base$/);
  await page.getByRole('button', { name: 'Get exact amount and fee' }).click();
  await page.getByRole('button', { name: 'Sign and run' }).click();
  await expect(statusOf(page, 'Done: the instructions ran on Solana.')).toBeVisible();
  expect(await wallet.calls('wallet_switchEthereumChain')).toEqual([]);
});
