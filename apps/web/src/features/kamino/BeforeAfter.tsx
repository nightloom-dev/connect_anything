import { useEffect, useId, useState } from 'react';
import { ArrowRight, CircleCheck, RotateCw } from 'lucide-react';
import type { Obligation } from '@connect-anything/kamino-rescue';
import { Button, Card, HealthBar, Skeleton, Spinner, cn } from '../../ui/index.ts';
import { dollars, percent, points } from './format.ts';

function Change({ label, from, to, delta, down }: { label: string; from: string; to: string; delta: string; down: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-lg leading-7 font-semibold nums">
        <span className="text-muted line-through decoration-muted/50">{from}</span>
        <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="text-text">{to}</span>
      </span>
      <span className={cn('text-xs font-medium nums', down ? 'text-success' : 'text-muted')}>{delta}</span>
    </div>
  );
}

type BeforeAfterProps = {
  /** The position as it was read before the run. */
  before: Obligation;
  /** The same position read again after it. */
  after: Obligation;
  /** Reading it again now. */
  reading?: boolean;
  onReadAgain: () => void;
};

/** After a run: what the debt and the LTV were and are now, with the bar moving from one to the other. */
export function BeforeAfter({ before, after, reading = false, onReadAgain }: BeforeAfterProps) {
  const id = useId();
  const ltv = after.collateralUsd > 0 && before.collateralUsd > 0;
  // the bar starts where the position was and moves once it is on the screen
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMoved(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const paid = before.debtUsd - after.debtUsd;
  const fell = before.ltv - after.ltv;

  return (
    <Card as="section" aria-labelledby={id} padding="lg" className="flex flex-col gap-5 border-success/32 bg-linear-to-b from-success/6 to-surface">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-success/32 bg-success/12 text-success" aria-hidden>
          <CircleCheck className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={id} className="text-base leading-6 font-semibold text-text">
            After the run
          </h3>
          <p role="status" className="mt-0.5 text-sm text-text/80">
            After the run the debt is {dollars(after.debtUsd)}, from {dollars(before.debtUsd)}
            {ltv && `, and the LTV is ${percent(after.ltv)}, from ${percent(before.ltv)}`}.
          </p>
        </div>
        <Button size="sm" icon={<RotateCw />} loading={reading} onClick={onReadAgain}>
          Read again
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-4">
        <Change label="Debt" from={dollars(before.debtUsd)} to={dollars(after.debtUsd)} delta={paid > 0 ? `${dollars(paid)} repaid` : 'unchanged'} down={paid > 0} />
        {ltv && <Change label="LTV" from={percent(before.ltv)} to={percent(after.ltv)} delta={fell > 0 ? `${points(fell)} lower` : fell < 0 ? `${points(fell)} higher` : 'unchanged'} down={fell > 0} />}
      </div>
      {/* says nothing the sentence and the figures above do not, so it is not read out as a second LTV */}
      {ltv && (
        <div aria-hidden>
          <HealthBar size="sm" value={before.ltv} after={moved ? after.ltv : null} liquidation={after.liquidationLtv} format={percent} />
        </div>
      )}
    </Card>
  );
}

/**
 * While the position is read again after a run. The first time there is nothing to compare yet, so it holds the place of
 * the comparison; `compact` once there is one, which stays under it.
 */
export function ReadingAgain({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        Reading the position again…
      </p>
    );
  }
  return (
    <Card as="section" padding="lg" aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="text-sm text-muted">
        Reading the position again…
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="h-1.5 w-full" />
    </Card>
  );
}
