import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Obligation, ObligationRow } from '@connect-anything/kamino-rescue';
import { besideRetry, dollars, health, listed, ltvOf, percent, points, risk, targetPercent, tokens } from './format.ts';

// How /kamino writes its figures, and how it ranks positions by risk.

const position = (ltv: number, liquidationLtv = 0.8, collateralUsd = 8000, debtUsd = ltv * collateralUsd) => ({ ltv, liquidationLtv, collateralUsd, debtUsd }) as Obligation;
const row = (symbol: string, usd: number, amount = '0', decimals = 6) => ({ symbol, usd, amount, decimals }) as ObligationRow;

test('percentages: an LTV with two decimals, a target as it was typed', () => {
  assert.equal(percent(0.55), '55.00%');
  assert.equal(percent(0.4532), '45.32%');
  assert.equal(percent(0), '0.00%');
  assert.equal(targetPercent(0.45), '45%');
  assert.equal(targetPercent(0.455), '45.5%');
  assert.equal(targetPercent(0.12345), '12.35%');
  assert.equal(points(0.1), '10.00 pts');
  // a difference reads as a distance, whichever way it goes
  assert.equal(points(-0.0867), '8.67 pts');
});

test('dollars in en-US, with cents and thousands', () => {
  assert.equal(dollars(800), '$800.00');
  assert.equal(dollars(5212.494), '$5,212.49');
  assert.equal(dollars(0), '$0.00');
  assert.equal(listed([row('USDT', 1400), row('CASH', 3.2345)]), 'USDT $1,400.00, CASH $3.23');
  assert.equal(listed([]), 'nothing');
});

test('an LTV means nothing without collateral', () => {
  assert.equal(ltvOf(position(0.55)), '55.00%');
  assert.equal(ltvOf(position(0, 0.8, 0, 50)), 'no collateral');
});

test('token amounts are rounded to six significant digits for reading', () => {
  assert.equal(tokens(row('USDC', 4400, '4400000000')), '4,400');
  assert.equal(tokens(row('cbBTC', 8000, '9474170', 8)), '0.0947417');
  assert.equal(tokens(row('SOL', 10_000, '62500000000', 9)), '62.5');
  assert.equal(tokens(row('USDC', 0.123456789, '123457', 6)), '0.123457');
});

test('health: how far from liquidation, in the zones of the LTV bar', () => {
  assert.deepEqual(health(position(0.55)), { variant: 'ok', text: '25.00 pts to liquidation' });
  // amber from 10 points under liquidation
  assert.deepEqual(health(position(0.7133)), { variant: 'warn', text: '8.67 pts to liquidation' });
  assert.deepEqual(health(position(0.78)), { variant: 'warn', text: '2.00 pts to liquidation' });
  assert.deepEqual(health(position(0.8)), { variant: 'bad', text: 'At liquidation' });
  assert.deepEqual(health(position(0.85)), { variant: 'bad', text: 'Past liquidation' });
  assert.deepEqual(health(position(0, 0.8, 0, 50)), { variant: 'bad', text: 'No collateral' });
  assert.deepEqual(health(position(0, 0.8, 0, 0)), { variant: 'neutral', text: 'Empty' });
});

test('risk ranks a debt with no collateral first, then by the share of the liquidation LTV used, and no debt last', () => {
  const near = position(0.78);
  const healthy = position(0.55);
  const lenient = position(0.802, 0.91);
  const bare = position(0, 0.8, 0, 50);
  const empty = position(0, 0.8, 8000, 0);
  const ranked = [healthy, empty, lenient, near, bare].sort((one, other) => risk(other) - risk(one));
  assert.deepEqual(ranked, [bare, near, lenient, healthy, empty]);
  assert.equal(risk(near), 0.78 / 0.8);
  assert.equal(risk(empty), -1);
  assert.equal(risk(bare), Number.POSITIVE_INFINITY);
  // a market with no liquidation LTV gives nothing to measure against, so it counts as the riskiest
  assert.equal(risk(position(0.5, 0)), Number.POSITIVE_INFINITY);
});

test('a message beside Try again does not say it again', () => {
  assert.equal(besideRetry('Could not read the position from Solana, try again'), 'Could not read the position from Solana.');
  assert.equal(besideRetry('The server could not be reached. Check your connection and try again.'), 'The server could not be reached. Check your connection.');
  assert.equal(besideRetry('Could not read it. Try again!'), 'Could not read it.');
  // the rest stays as it is
  assert.equal(besideRetry('The server answered 500.'), 'The server answered 500.');
  assert.equal(besideRetry('Please try again later'), 'Please try again later');
  assert.equal(besideRetry('Try again'), 'Try again');
});
