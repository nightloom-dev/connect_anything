import { useEffect, useState } from 'react';
import { ArrowDown, CircleAlert, Hourglass } from 'lucide-react';
import { Button, Spinner, TokenIcon, cn } from '../../ui/index.ts';

/**
 * What the bar says: the amount to pay while a new payment is the way on, or else where the payment is, in place of the
 * amount, and View. `busy`: a run is in flight; `waiting`: it waits on the person or on Connect; `failed`: it failed, and
 * the card says what can be done with the money.
 */
export type Bar = { amount?: string; symbol: string; status?: { text: string; tone: 'busy' | 'waiting' | 'failed' } };

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The bar covers the bottom 72px of the screen, and the card is under the screen while its top is lower than that. The
// area the card is watched in reaches far above the screen, so that a jump from under the screen to past it, as the End
// key makes, still counts as the card coming up, and only the line at the bottom counts.
const UNDER = '100000px 0px -72px 0px';

/** Takes the person to the payment card: scrolls it under the header and puts the focus on it, for a screen reader too. */
export function goTo(id: string) {
  const card = document.getElementById(id);
  if (!card) return;
  card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  // focusable for this once, so that a click inside the card later does not take the focus to it
  if (!card.hasAttribute('tabindex')) {
    card.setAttribute('tabindex', '-1');
    card.addEventListener('blur', () => card.removeAttribute('tabindex'), { once: true });
  }
  card.focus({ preventScroll: true });
}

const TONE = {
  busy: <Spinner size="sm" className="text-muted" />,
  waiting: <Hourglass className="size-4 shrink-0 text-warning" aria-hidden />,
  failed: <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden />,
};

/** The bar's words and its button, without the bar: the page draws it in PayBar, the gallery on its own. */
export function PayStrip({ amount, symbol, status, onGo }: Bar & { onGo: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {status ? (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-text">
          {TONE[status.tone]}
          <span className="truncate">{status.text}</span>
        </p>
      ) : (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
          {/* the space keeps the words apart for a screen reader; the gap does it on the screen */}
          Repay{' '}
          <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-text nums">
            <TokenIcon symbol={symbol} size={18} />
            <span className="truncate">
              {amount} {symbol}
            </span>
          </span>
        </p>
      )}
      <Button variant={status ? 'secondary' : 'primary'} iconRight={<ArrowDown />} aria-label={status ? 'View the payment' : 'Pay, in the payment card below'} onClick={onGo}>
        {status ? 'View' : 'Pay'}
      </Button>
    </div>
  );
}

type PayBarProps = Bar & {
  /** The id of the payment card it leads to. */
  to: string;
};

/**
 * Below 960px the payment comes after the position, a long way down on a phone, so this bar at the bottom of the screen
 * leads down to it. It shows while the card is under the screen, not while it is in view or once it has been scrolled
 * past, and the page leaves it out while there is nothing to pay and nothing to look at there.
 * It is sticky at the end of the page, not fixed: where the page ends it sits in its own place, so it never covers the
 * last of the page or the footer. The wallet's modal and the dialogs open above it.
 */
export function PayBar({ to, ...bar }: PayBarProps) {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const card = document.getElementById(to);
    if (!card) return;
    if (typeof IntersectionObserver === 'undefined') {
      setBelow(true);
      return;
    }
    const observer = new IntersectionObserver(entries => setBelow(!entries[entries.length - 1].isIntersecting), { rootMargin: UNDER });
    observer.observe(card);
    return () => observer.disconnect();
  }, [to]);

  return (
    <div
      data-ui="pay-bar"
      className={cn(
        // full width under the page's 16 or 24px side padding
        'sticky bottom-0 z-30 -mx-4 transition-[translate,opacity,visibility] duration-200 ease-out motion-reduce:transition-none sm:-mx-6 md:hidden',
        !below && 'invisible translate-y-full opacity-0',
      )}
    >
      <div className="border-t border-border-strong bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-16px_rgb(14_26_43/0.25)] backdrop-blur-md sm:px-6">
        <PayStrip {...bar} onGo={() => goTo(to)} />
      </div>
    </div>
  );
}
