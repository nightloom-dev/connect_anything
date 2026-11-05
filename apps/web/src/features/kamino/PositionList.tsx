import type { Obligation } from '@connect-anything/kamino-rescue';
import { Badge, HealthBar, TokenIcon, cn, truncateMiddle } from '../../ui/index.ts';
import { dollars, health, ltvOf } from './format.ts';

type PositionListProps = {
  /** In the order to show them: the rescue puts the riskiest first. */
  positions: Obligation[];
  /** The address of the one open below. */
  chosen?: string;
  disabled?: boolean;
  onChoose: (address: string) => void;
};

/** A wallet's positions as cards to choose from, each with its LTV against its liquidation line. */
export function PositionList({ positions, chosen, disabled, onChoose }: PositionListProps) {
  return (
    <section aria-label="Positions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-text">This wallet has {positions.length} positions. Choose one.</p>
        <p className="text-xs text-muted">Closest to liquidation first</p>
      </div>
      <ul className="flex flex-col gap-2">
        {positions.map(item => {
          const zone = health(item);
          const pressed = item.address === chosen;
          return (
            <li key={item.address}>
              <button
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                onClick={() => onChoose(item.address)}
                className={cn(
                  'flex w-full min-w-0 flex-col gap-2.5 rounded-lg border px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-120 disabled:cursor-not-allowed disabled:opacity-60',
                  pressed ? 'border-accent/70 bg-accent/8 shadow-[inset_0_0_0_1px_var(--color-accent-line)]' : 'border-border bg-surface enabled:hover:border-border-strong enabled:hover:bg-surface-2',
                )}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-md font-semibold text-text nums">{item.collateralUsd > 0 ? `LTV ${ltvOf(item)}` : 'LTV n/a'}</span>{' '}
                  <Badge variant={zone.variant} dot>
                    {zone.text}
                  </Badge>{' '}
                  <span className="ml-auto font-mono text-xs text-muted">{truncateMiddle(item.address)}</span>{' '}
                </span>
                {item.collateralUsd > 0 && (
                  <span aria-hidden className="block">
                    <HealthBar size="sm" value={item.ltv} liquidation={item.liquidationLtv} />
                  </span>
                )}
                {/* spaces written out: the flex gap shows them, and the button's name reads them */}
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
                  owes{' '}
                  {item.borrows.length ? (
                    item.borrows.map((row, index) => (
                      <span key={`${row.reserve}-${index}`} className="inline-flex items-center gap-1 text-text nums">
                        <TokenIcon symbol={row.symbol} size={14} />
                        {row.symbol} {dollars(row.usd)}
                        {index < item.borrows.length - 1 && ', '}
                      </span>
                    ))
                  ) : (
                    <span className="text-text">nothing</span>
                  )}{' '}
                  against <span className="text-text nums">{dollars(item.collateralUsd)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
