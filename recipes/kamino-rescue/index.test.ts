import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CU_LIMIT, estimateCu, ltvAfter, repayUsd, rescuable, rescueAmount, rescueRecipe, usdToAtomic, type Obligation, type ObligationRow } from './index.ts';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

const row = (over: Partial<ObligationRow> = {}): ObligationRow => ({
  reserve: 'usdc-reserve',
  mint: USDC,
  symbol: 'USDC',
  decimals: 6,
  amount: '1000000000',
  usd: 1000,
  tokenProgram: 'token-program',
  supplyVault: 'vault',
  debtFarm: null,
  pythOracle: null,
  switchboardPriceOracle: null,
  switchboardTwapOracle: null,
  scopePrices: 'scope',
  ...over,
});

const position = (over: Partial<Obligation> = {}): Obligation => ({
  address: 'obligation',
  market: 'market',
  deposits: [row({ reserve: 'sol-reserve', symbol: 'SOL', mint: 'sol', usd: 2000 })],
  borrows: [row()],
  collateralUsd: 2000,
  debtUsd: 1000,
  adjustedDebtUsd: 1000,
  ltv: 0.5,
  liquidationLtv: 0.8,
  refreshRemaining: ['sol-reserve', 'usdc-reserve'],
  repayRemaining: [],
  unjoinedDebtFarms: [],
  ...over,
});

test('the amount is B - t*C', () => {
  assert.equal(repayUsd(1000, 2000, 0.4), 200);
  assert.equal(repayUsd(1000, 2000, 0), 1000, 'a target of 0 repays everything');
});

test('a debt already at or under the target repays nothing', () => {
  assert.equal(repayUsd(500, 2000, 0.4), 0);
  assert.equal(repayUsd(800, 2000, 0.4), 0);
  assert.equal(repayUsd(0, 2000, 0.4), 0);
});

test('the amount never passes the debt', () => {
  assert.equal(repayUsd(100, 2000, -1), 100);
  assert.equal(repayUsd(100, 0, 0.5), 100, 'with no collateral it is the whole debt');
  assert.equal(repayUsd(0, 0, 0.5), 0);
});

test('dollars become atomic units through decimals and price', () => {
  const dollarPerToken = { amount: '100000000', usd: 100 }; // 100.000000 USDC at $1
  assert.equal(usdToAtomic(1, dollarPerToken), '1000000');
  assert.equal(usdToAtomic(1.5, dollarPerToken), '1500000');
  assert.equal(usdToAtomic(0.000001, dollarPerToken), '1');
  assert.equal(usdToAtomic(12.34, dollarPerToken), '12340000', 'floating point noise is not a unit');

  // 10 / 0.9998 = 10.0020004, so a dollar figure is more USDC than it says when USDC is under its peg
  assert.equal(usdToAtomic(10, { amount: '100000000', usd: 99.98 }), '10002001');
  // and another token's decimals change nothing, because the row states its own amount
  assert.equal(usdToAtomic(150, { amount: '2000000000', usd: 300 }), '1000000000');
});

test('a conversion rounds up, and past the debt it is exactly the debt', () => {
  assert.equal(usdToAtomic(0.0000011, { amount: '1000000', usd: 1 }), '2');
  assert.equal(usdToAtomic(1000, { amount: '1000000123', usd: 1000 }), '1000000123');
  assert.equal(usdToAtomic(5000, { amount: '1000000123', usd: 1000 }), '1000000123');
});

test('nothing to convert is zero atomic units', () => {
  assert.equal(usdToAtomic(0, { amount: '1000000', usd: 1 }), '0');
  assert.equal(usdToAtomic(-1, { amount: '1000000', usd: 1 }), '0');
  assert.equal(usdToAtomic(NaN, { amount: '1000000', usd: 1 }), '0');
  assert.equal(usdToAtomic(1, { amount: '0', usd: 0 }), '0');
});

test('a target becomes an amount of the debt and the LTV it leads to', () => {
  const debt = row();
  const { usd, atomic, short } = rescueAmount(position(), debt, 0.4);
  assert.deepEqual([usd, atomic, short], [200, '200000000', false]);
  assert.equal(ltvAfter(position(), debt, atomic), 0.4);

  assert.deepEqual(rescueAmount(position(), debt, 0.6), { usd: 0, atomic: '0', short: false }, 'already under the target');
});

test('when USDC alone cannot reach the target, it is all the USDC and the screen is told', () => {
  const debt = row({ amount: '100000000', usd: 100 });
  const mixed = position({ borrows: [debt, row({ symbol: 'USDT', mint: USDT, usd: 900 })] });
  assert.deepEqual(rescueAmount(mixed, debt, 0.4), { usd: 100, atomic: '100000000', short: true });
  assert.equal(ltvAfter(mixed, debt, '100000000'), 0.45);
});

test('with no collateral it is the whole debt, and an LTV after it means nothing', () => {
  const broke = position({ collateralUsd: 0, deposits: [], ltv: 0 });
  assert.deepEqual(rescueAmount(broke, row(), 0.5), { usd: 1000, atomic: '1000000000', short: false });
  assert.equal(ltvAfter(broke, row(), '1000000000'), null);
});

test('a surplus does not lower the LTV past the whole debt', () => {
  assert.equal(ltvAfter(position(), row(), '5000000000'), 0);
  assert.equal(ltvAfter(position({ borrows: [] }), row({ amount: '0', usd: 0 }), '5'), 0.5);
});

test('only a USDC debt runs, and every other case says why', () => {
  assert.match(rescuable(position({ borrows: [] })).why!, /no debt/);

  const usdt = row({ symbol: 'USDT', mint: USDT });
  assert.match(rescuable(position({ borrows: [usdt] })).why!, /owes USDT\..*not supported yet/);
  assert.match(rescuable(position({ borrows: [usdt, row({ symbol: 'CASH', mint: 'cash' })] })).why!, /owes USDT and CASH\./);
  assert.ok(rescuable(position({ borrows: [row({ mint: 'someone-elses-mint' })] })).why, 'a token that calls itself USDC is not USDC');

  assert.equal(rescuable(position()).debt?.reserve, 'usdc-reserve');
  assert.equal(rescuable(position({ borrows: [usdt, row()] })).debt?.symbol, 'USDC', 'a mixed position repays its USDC');
  const larger = row({ reserve: 'larger', usd: 5000 });
  assert.equal(rescuable(position({ borrows: [row(), larger] })).debt, larger);
});

test('a debt farm the position never joined is refused, because the repay would fail', () => {
  const farmed = row({ debtFarm: 'farm' });
  assert.match(rescuable(position({ borrows: [farmed], unjoinedDebtFarms: ['farm'] })).why!, /never joined/);
  assert.equal(rescuable(position({ borrows: [farmed] })).debt, farmed);
  assert.equal(rescuable(position({ unjoinedDebtFarms: ['farm of another borrow'] })).debt?.reserve, 'usdc-reserve');
});

test('the steps refresh every reserve once, then the obligation, then repay v2 of the amount delivered', () => {
  const both = row({ reserve: 'sol-reserve', mint: 'sol', symbol: 'SOL' });
  const debt = row();
  const { steps, destination } = rescueRecipe(position({ borrows: [both, debt], refreshRemaining: ['sol-reserve', 'sol-reserve', 'usdc-reserve'] }), debt);
  assert.deepEqual(destination.tokenAddress, USDC);
  assert.deepEqual(steps.map(step => step.ixName), ['refresh_reserve', 'refresh_reserve', 'refresh_obligation', 'repay_obligation_liquidity_v2']);

  const [first, , refresh, repay] = steps as any[];
  assert.deepEqual(first.hints, { reserve: 'sol-reserve', lending_market: 'market', pyth_oracle: null, switchboard_price_oracle: null, switchboard_twap_oracle: null, scope_prices: 'scope' });
  assert.deepEqual(refresh.hints, { lending_market: 'market', obligation: 'obligation' });
  // the server's list is the answer, repeats and all: this is the SDK's own and the program checks its length
  assert.deepEqual(refresh.remaining.map((account: any) => [account.pubkey, account.isWritable, account.source]), [['sol-reserve', true, 'recipe'], ['sol-reserve', true, 'recipe'], ['usdc-reserve', true, 'recipe']]);
  assert.equal(repay.amountArg, 'liquidity_amount');
  assert.equal(repay.hints['repay_accounts.repay_reserve'], 'usdc-reserve');
  assert.equal(repay.hints['repay_accounts.reserve_liquidity_mint'], USDC);
  assert.deepEqual(repay.remaining, []);
});

test('a debt with no farm leaves out both farm accounts, and one with a farm derives the user state', () => {
  const hintsFor = (debt: ObligationRow) => (rescueRecipe(position({ borrows: [debt] }), debt).steps.at(-1) as any).hints;
  const plain = hintsFor(row());
  assert.equal(plain['farms_accounts.reserve_farm_state'], null);
  assert.equal(plain['farms_accounts.obligation_farm_user_state'], null);
  const farmed = hintsFor(row({ debtFarm: 'farm' }));
  assert.equal(farmed['farms_accounts.reserve_farm_state'], 'farm');
  assert.ok(!('farms_accounts.obligation_farm_user_state' in farmed));
});

test('the compute estimate covers the real repays and passes the limit where the spec says it does', () => {
  // klend-repay-plain measured 112673 and klend-repay-farms 135304, both with two reserves
  assert.equal(estimateCu(position(), row()), 117_000);
  assert.equal(estimateCu(position(), row({ debtFarm: 'farm' })), 147_000);
  const reserves = (count: number) => position({ deposits: Array.from({ length: count - 1 }, (_, i) => row({ reserve: `deposit-${i}` })) });
  assert.ok(estimateCu(reserves(5), row()) <= CU_LIMIT);
  assert.ok(estimateCu(reserves(6), row()) > CU_LIMIT);
});
