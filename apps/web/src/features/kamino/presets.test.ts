import assert from 'node:assert/strict';
import { test } from 'node:test';
import { targetPresets } from './presets.ts';

/** Each preset as "label value". */
const presets = (ltv: number, liquidationLtv = 0.8) => targetPresets({ ltv, liquidationLtv }).map(({ label, value }) => `${label} ${value}`);

test('a healthy position: Safe and Safer are 10 and 20 points under the LTV now, which is the target the page starts with', () => {
  assert.deepEqual(presets(0.55), ['Safe 45', 'Safer 35', 'Repay all 0']);
  // the start target is floor(ltv) - 10 in rescue.tsx, and Safe agrees with it, so it shows as chosen
  assert.equal(targetPresets({ ltv: 0.5532, liquidationLtv: 0.8 })[0].value, String(Math.max(Math.floor(0.5532 * 100) - 10, 0)));
});

test('near liquidation, Safe stays 15 points under it and Safer 25, out of the amber zone that starts 10 under', () => {
  // 78% against 80%: 10 points down would be 68%, 12 points from liquidation
  assert.deepEqual(presets(0.78), ['Safe 65', 'Safer 55', 'Repay all 0']);
  // where both rules give the same target
  assert.deepEqual(presets(0.75), ['Safe 65', 'Safer 55', 'Repay all 0']);
});

test('past liquidation, Safe is no longer 10 points down, which would land in the amber zone', () => {
  // the review's case: 85% against 80%, where 10 points down is 75%
  assert.deepEqual(presets(0.85), ['Safe 65', 'Safer 55', 'Repay all 0']);
  // far past it, where even 20 points down would be amber
  assert.deepEqual(presets(1.05), ['Safe 65', 'Safer 55', 'Repay all 0']);
  for (const ltv of [0.5, 0.7, 0.79, 0.8, 0.85, 0.95, 1.2]) {
    for (const liquidationLtv of [0.65, 0.75, 0.8, 0.85, 0.91]) {
      const [safe, safer] = targetPresets({ ltv, liquidationLtv }).map(({ value }) => Number(value) / 100);
      // green on the slider: under liquidation − 10 points
      assert.ok(safe < liquidationLtv - 0.1, `Safe ${safe} for ${ltv} against ${liquidationLtv}`);
      assert.ok(safer < safe || safer === 0, `Safer ${safer} under Safe ${safe}`);
    }
  }
});

test('the targets stay on the slider, 0 to 100, and a low LTV comes down to Repay all', () => {
  assert.deepEqual(presets(0.12), ['Safe 2', 'Safer 0', 'Repay all 0']);
  assert.deepEqual(presets(0.05), ['Safe 0', 'Safer 0', 'Repay all 0']);
  // no collateral: an LTV of 0, and a liquidation LTV of 0 as well
  assert.deepEqual(presets(0, 0), ['Safe 0', 'Safer 0', 'Repay all 0']);
  for (const { value } of targetPresets({ ltv: 3, liquidationLtv: 1 })) assert.ok(Number(value) >= 0 && Number(value) <= 100);
});

test('a liquidation LTV read as a float noisy under its whole percent still counts as that percent', () => {
  // 0.57 * 100 is 56.99999999999999
  assert.deepEqual(presets(0.7, 0.57), ['Safe 42', 'Safer 32', 'Repay all 0']);
  // a liquidation LTV between two percents rounds down, toward the safe side
  assert.deepEqual(presets(0.9, 0.775), ['Safe 62', 'Safer 52', 'Repay all 0']);
});

test('every preset says what it does', () => {
  for (const preset of targetPresets({ ltv: 0.55, liquidationLtv: 0.8 })) assert.ok(preset.hint && preset.hint.length > 0, preset.label);
});
