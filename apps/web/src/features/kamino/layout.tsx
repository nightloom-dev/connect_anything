import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BellRing, Inbox, LifeBuoy, MousePointerClick } from 'lucide-react';
import { Address, Alert, Button, Card, EmptyState, Skeleton, Spinner, cn } from '../../ui/index.ts';

/**
 * Two columns from 960px: on the left the list of positions, the position and the check on a fork, one under the other;
 * on the right the payment. On a phone one column in the order of the page, so the payment follows the position.
 * The payment is 440px wide up to 1200px, so that the position keeps the wider column, then the run card's own width.
 * The last row takes whatever height the payment has over the left column.
 */
export const COLUMNS =
  'grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,27.5rem)] md:grid-rows-[auto_auto_1fr] md:gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--container-run))]';
/** A place in the left column of COLUMNS: the next row free there. */
export const LEFT = 'min-w-0 md:col-start-1 md:self-start';

// The header is 56px tall and the column keeps 24px under it, and as much over the bottom edge.
const TOP = 80;
const BOTTOM = 24;

/**
 * The payment, beside the position. It stays in view while the position scrolls, as long as all of it fits on the screen:
 * a column taller than the screen would hide its own end, so then it scrolls with the page.
 */
export function RunColumn({ children, className }: { children: ReactNode; className?: string }) {
  const column = useRef<HTMLElement>(null);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const element = column.current;
    if (!element) return;
    const measure = () => setFits(element.offsetHeight + TOP + BOTTOM <= window.innerHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return (
    <section ref={column} aria-label="Payment" className={cn('min-w-0 md:col-start-2 md:row-span-3 md:row-start-1 md:self-start', fits && 'md:sticky md:top-20', className)}>
      {children}
    </section>
  );
}

/** In the payment column while it has nothing to show. */
export function RunPlaceholder({ kind }: { kind: 'choose' | 'closed' }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface/40">
      {kind === 'choose' ? (
        <EmptyState compact icon={<MousePointerClick />} title="Choose a position" className="py-10">
          The payment for it opens here.
        </EmptyState>
      ) : (
        <EmptyState compact icon={<LifeBuoy />} title="No payment for this position" className="py-10">
          This page cannot repay it, so there is nothing to pay.
        </EmptyState>
      )}
    </div>
  );
}

/** While the positions of a wallet are read: the two columns, at about the height they will take. */
export function ReadingPositions() {
  return (
    <div className={COLUMNS}>
      <div className={cn(LEFT, 'flex flex-col gap-4')}>
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          Reading the positions of this wallet…
        </p>
        <Card padding="lg" aria-hidden className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="ml-auto h-6 w-36 rounded-full" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-8 w-28" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
          <Skeleton className="h-28 rounded-lg" />
        </Card>
      </div>
      <RunColumn>
        <Card padding="lg" aria-hidden className="flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </RunColumn>
    </div>
  );
}

/** `field`: the id of the wallet field above, where the action takes the person back to. */
export function NoPositions({ field }: { field?: string }) {
  const another = () => {
    const input = field ? document.getElementById(field) : null;
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  };
  return (
    <Card padding="none" role="status">
      <EmptyState
        icon={<Inbox />}
        title="No open positions"
        action={
          field && (
            <Button size="sm" onClick={another}>
              Check another wallet
            </Button>
          )
        }
      >
        This wallet has no open positions on Kamino.
      </EmptyState>
    </Card>
  );
}

/** The Telegram watcher links here with ?wallet=&obligation=. `missing`: the wallet has no such position open any more. */
export function WatcherBanner({ obligation, missing = false }: { obligation: string; missing?: boolean }) {
  return (
    <Alert icon={<BellRing strokeWidth={2.1} />} title="Opened from a watcher alert">
      The Telegram watcher rang about position <Address value={obligation} copy={false} explorer={false} />.{' '}
      {missing ? 'This wallet has no such position open any more.' : 'It is open below.'}
    </Alert>
  );
}

const STEPS = [
  { title: 'Read the position', text: 'The LTV, collateral and debt of any wallet, read from Solana.' },
  { title: 'Choose a target LTV', text: 'The page works out how much USDC brings the position there.' },
  { title: 'Pay with one signature', text: 'From Base, Arbitrum or Ethereum. It lands in about 150 s.' },
];

/** Before any wallet is read: what the page does, in three steps. */
export function HowItWorks() {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {STEPS.map(({ title, text }, index) => (
        <li key={title} className="flex gap-3 rounded-lg border border-border bg-surface/60 p-4 sm:flex-col">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/36 bg-accent/14 text-sm font-semibold text-accent-hover nums">
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold text-text">{title}</span>
            <span className="text-sm text-muted">{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
