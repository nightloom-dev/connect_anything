import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxFigures, quoteFigures, sharedPlaces, writeAmount } from './figures.ts';

const USDC = 6;
/** The quote of the e2e mocks: 800 USDC on Base, at least 776.16 USDC delivered, a fee of 0.02 and 774.19965 spendable. */
const QUOTE = { paid: { atomic: '800000000', decimals: USDC }, samePaid: true, delivered: '776160000', fee: '20000', spendable: '774199650', decimals: USDC };

/** A written figure back in atomic units, to check a sum. */
const atomic = (written: string, decimals = USDC) => {
  const [whole, fraction = ''] = written.replaceAll(',', '').split('.');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
};

test('what the quote leaves over is named, and the rows add up to the atomic unit', () => {
  const figures = quoteFigures(QUOTE);
  assert.deepEqual(figures, { paid: '800.00000', delivered: '776.16000', fee: '0.02000', held: '1.94035', spends: '774.19965' });
  assert.equal(atomic(figures.delivered) - atomic(figures.fee!) - atomic(figures.held!), atomic(figures.spends!));
});

test('every figure of the token delivered takes the precision the most exact of them needs', () => {
  const figures = quoteFigures({ ...QUOTE, delivered: '776161234', spendable: '774199651' });
  assert.deepEqual(figures, { paid: '800.000000', delivered: '776.161234', fee: '0.020000', held: '1.941583', spends: '774.199651' });
  assert.equal(atomic(figures.delivered) - atomic(figures.fee!) - atomic(figures.held!), atomic(figures.spends!));
});

test('a figure is never rounded, so a sum of the rows never drifts', () => {
  for (const [delivered, fee, spendable] of [
    ['1000000', '1', '997499'],
    ['999999999', '333333', '997163331'],
    ['5', '1', '3'],
  ]) {
    const figures = quoteFigures({ ...QUOTE, delivered, fee, spendable });
    assert.equal(atomic(figures.delivered) - atomic(figures.fee!) - atomic(figures.held!), atomic(figures.spends!), `${delivered} ${fee} ${spendable}`);
  }
});

test('without a fee stated, what is held back is what arrives less what is spent', () => {
  const figures = quoteFigures({ ...QUOTE, fee: undefined });
  assert.equal(figures.fee, undefined);
  assert.equal(figures.held, '1.96035');
});

test('nothing held back, or less than nothing, has no figure', () => {
  assert.equal(quoteFigures({ ...QUOTE, spendable: '776140000' }).held, undefined);
  assert.equal(quoteFigures({ ...QUOTE, spendable: '776150000' }).held, undefined);
  // and the others keep the precision they need on their own
  assert.deepEqual(quoteFigures({ ...QUOTE, spendable: '776140000' }), { paid: '800.00', delivered: '776.16', fee: '0.02', held: undefined, spends: '776.14' });
});

test('a recipe with its amounts written in spends no figure of the quote, which then holds nothing back', () => {
  assert.deepEqual(quoteFigures({ ...QUOTE, spendable: undefined }), { paid: '800.00', delivered: '776.16', fee: '0.02', held: undefined, spends: undefined });
});

test('another token paid with is written exactly on its own, and does not change the precision of the others', () => {
  const figures = quoteFigures({ ...QUOTE, paid: { atomic: '312345678900000000', decimals: 18 }, samePaid: false });
  assert.equal(figures.paid, '0.3123456789');
  assert.equal(figures.spends, '774.19965');
});

test('large amounts are grouped, and the precision never goes past the decimals of the token', () => {
  assert.equal(writeAmount({ atomic: '4400000000', decimals: USDC }, 2), '4,400.00');
  assert.equal(writeAmount({ atomic: '123456789012345678901234567', decimals: 18 }, 18), '123,456,789.012345678901234567');
  assert.equal(writeAmount({ atomic: '42', decimals: 0 }, 2), '42');
  assert.equal(sharedPlaces([{ atomic: '100000000', decimals: 6 }]), 2);
  assert.equal(sharedPlaces([{ atomic: '100', decimals: 6 }]), 4);
  assert.equal(sharedPlaces([{ atomic: '1', decimals: 6 }, { atomic: '10', decimals: 6 }]), 6);
});

test('the figures of a Retry or a Refund share one precision too, each in its own token, and one not known is a dash', () => {
  const usdc = { decimals: USDC, symbol: 'USDC' };
  // the Refund of the e2e mocks: at least 0.475398 USDC back on Base, for a fee of 0.02
  assert.deepEqual(boxFigures([{ atomic: '475398', token: usdc }, { atomic: '20000', token: usdc }]), ['0.475398 USDC', '0.020000 USDC']);
  assert.deepEqual(boxFigures([{ atomic: '20000', token: usdc }, { atomic: '1234490000', token: usdc }]), ['0.02 USDC', '1,234.49 USDC']);
  assert.deepEqual(boxFigures([{ atomic: '312345678900000000', token: { decimals: 18, symbol: 'ETH' } }, { atomic: '20000', token: usdc }]), ['0.3123456789 ETH', '0.020000 USDC']);
  assert.deepEqual(boxFigures([{ token: usdc }, { atomic: '776110000', token: usdc }, { atomic: '20000' }]), ['–', '776.11 USDC', '–']);
});
