import { useId, type ReactNode } from 'react';
import type { Obligation, ObligationRow } from '@connect-anything/kamino-rescue';
import { Address, Badge, Card, HealthBar, TokenIcon } from '../../ui/index.ts';
import { dollars, health, percent, tokens } from './format.ts';

function Holdings({ title, total, rows, empty }: { title: string; total: number; rows: ObligationRow[]; empty: string }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 id={id} className="text-xs font-medium tracking-wide text-muted uppercase">
          {title}
        </h4>
        <span className="text-lg font-semibold text-text nums">{dollars(total)}</span>
      </div>
      {rows.length ? (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((row, index) => (
            <li key={`${row.reserve}-${index}`} className="flex min-w-0 items-center gap-2.5 text-sm">
              <TokenIcon symbol={row.symbol} size={22} />
              {/* spaces written out: the flex layout hides them, and they keep the parts of a row apart when read */}
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate font-medium text-text">{row.symbol}</span>{' '}
                <span className="truncate text-xs text-muted nums">
                  {tokens(row)} {row.symbol}
                </span>
              </span>{' '}
              <span className="shrink-0 font-medium text-text nums">{dollars(row.usd)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

type PositionCardProps = {
  position: Obligation;
  /** The target LTV, as a fraction, while one is typed and the position can be repaid. */
  target?: number | null;
  /** Where the LTV lands with the amount a quote delivers. The bar moves to it. */
  after?: number | null;
  /** The target, the amount and what to know before paying. */
  children?: ReactNode;
};

/** A position read from Kamino: how close to liquidation, what backs it and what it owes, then whatever repays it. */
export function PositionCard({ position, target, after, children }: PositionCardProps) {
  const id = useId();
  const zone = health(position);
  return (
    <Card as="section" aria-labelledby={id} padding="lg" className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={id} className="text-base font-semibold text-text">
          Position
        </h3>
        <Address value={position.address} />
        <Badge variant={zone.variant} dot size="md" className="ml-auto">
          {zone.text}
        </Badge>
      </header>

      {position.collateralUsd > 0 && <HealthBar value={position.ltv} liquidation={position.liquidationLtv} target={target} after={after} format={percent} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Holdings title="Collateral" total={position.collateralUsd} rows={position.deposits} empty="Nothing deposited" />
        <Holdings title="Debt" total={position.debtUsd} rows={position.borrows} empty="Nothing owed" />
      </div>

      {children}
    </Card>
  );
}
