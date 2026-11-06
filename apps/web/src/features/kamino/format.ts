import type { Obligation, ObligationRow } from '@connect-anything/kamino-rescue';
import { fromAtomic } from '../../connect.ts';
import type { BadgeVariant } from '../../ui/index.ts';

// How /kamino writes its figures. The rescue and its parts share these, so a figure reads the same in every place.

export const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;
/** A target as it was typed, without the zeros percent() adds: 0.45 is "45%". */
export const targetPercent = (fraction: number) => `${(fraction * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
export const dollars = (usd: number) => usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const listed = (rows: ObligationRow[]) => rows.map(row => `${row.symbol} ${dollars(row.usd)}`).join(', ') || 'nothing';
export const ltvOf = (position: Obligation) => (position.collateralUsd > 0 ? percent(position.ltv) : 'no collateral');

/** A difference of LTVs in percentage points: 0.1 → "10.00 pts". */
export const points = (fraction: number) => `${(Math.abs(fraction) * 100).toFixed(2)} pts`;

const units = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });

/** How much of its token a row holds, rounded for reading: 0.0947417 cbBTC, 4,400 USDC. The exact figure is the run card's. */
export const tokens = (row: Pick<ObligationRow, 'amount' | 'decimals'>) => units.format(Number(fromAtomic(row.amount, row.decimals)));

/** How far a position is from liquidation, in the HealthBar's zones: amber from 10 points under it, red at it. */
export function health(position: Pick<Obligation, 'ltv' | 'liquidationLtv' | 'collateralUsd' | 'debtUsd'>): { variant: BadgeVariant; text: string } {
  if (!(position.collateralUsd > 0)) return position.debtUsd > 0 ? { variant: 'bad', text: 'No collateral' } : { variant: 'neutral', text: 'Empty' };
  const left = position.liquidationLtv - position.ltv;
  if (left < 0) return { variant: 'bad', text: 'Past liquidation' };
  if (left === 0) return { variant: 'bad', text: 'At liquidation' };
  return { variant: left < 0.1 ? 'warn' : 'ok', text: `${points(left)} to liquidation` };
}

/** For a list sorted by risk: the share of its liquidation LTV a position uses, and a debt with no collateral first of all. */
export const risk = ({ ltv, liquidationLtv, collateralUsd, debtUsd }: Obligation) =>
  !(debtUsd > 0) ? -1 : !(collateralUsd > 0) ? Number.POSITIVE_INFINITY : liquidationLtv > 0 ? ltv / liquidationLtv : Number.POSITIVE_INFINITY;
