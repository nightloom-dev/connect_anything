import type { Obligation } from '@connect-anything/kamino-rescue';

/** A target the presets of the target LTV type in, as the field takes it. */
export type Preset = {
  label: string;
  /** What it types into the field: a whole percent. */
  value: string;
  /** What it does, in the tooltip of its button. */
  hint?: string;
};

/** A whole percent, kept on the slider of the target: 0 to 100. */
const onSlider = (percent: number) => String(Math.min(Math.max(percent, 0), 100));

/**
 * The presets of the target LTV for a position. Safe goes 10 points under the LTV now, and Safer 20, as far as that stays
 * 15 and 25 points under liquidation: from a position past liquidation, 10 points down would still be in the amber zone
 * the slider and the bar draw from 10 points under it. Repay all is a target of 0%.
 * They only suggest a target: the person sees it in the field and the bar, and the amount is worked out from it as from
 * one typed in.
 */
export function targetPresets({ ltv, liquidationLtv }: Pick<Obligation, 'ltv' | 'liquidationLtv'>): Preset[] {
  // the same figure as the target the page starts with, so that Safe shows as chosen when they agree
  const now = Math.floor(ltv * 100);
  // a liquidation LTV is set in whole percents, and 0.57 * 100 is 56.99…
  const liquidation = Math.floor(liquidationLtv * 100 + 1e-9);
  return [
    { label: 'Safe', value: onSlider(Math.min(now - 10, liquidation - 15)), hint: 'At least 10 pts under the LTV now, and 15 under liquidation' },
    { label: 'Safer', value: onSlider(Math.min(now - 20, liquidation - 25)), hint: 'At least 20 pts under the LTV now, and 25 under liquidation' },
    { label: 'Repay all', value: '0', hint: 'All the USDC this position owes' },
  ];
}
