import { useId, useState, type MouseEvent } from 'react';
import { ArrowRight, CircleCheck, CircleDashed } from 'lucide-react';
import { breakable } from './breakable.tsx';

/** One thing the form still lacks, with the field that takes it. */
export type ReadinessItem = { key: string; label: string; problem: string; anchor?: string };

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Scrolls to a field and puts the cursor in it, without a # in the address. */
export function goTo(anchor: string, event?: MouseEvent) {
  const target = document.getElementById(anchor);
  if (!target) return;
  event?.preventDefault();
  target.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  const field = target.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), textarea:not([disabled]), button:not([disabled])');
  (field ?? target).focus({ preventScroll: true });
}

type ReadinessProps = { items: ReadinessItem[]; ready: boolean };

/** How many show before "Show all": a fresh form can lack a dozen things, and the fields say so too. */
const FIRST = 5;

/** What stands between the form and "Add to recipe", each a link to its field. */
export function Readiness({ items, ready }: ReadinessProps) {
  const title = useId();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="sr-only" role="status">
        {ready ? 'Ready to add.' : `${items.length} left to fill in.`}
      </p>
      {ready ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Ready to add: every argument and account is filled in.
        </p>
      ) : (
        <>
          <p id={title} className="flex items-baseline justify-between gap-3 text-sm font-medium text-text">
            Still to fill in
            <span className="text-xs font-normal text-muted nums">{items.length}</span>
          </p>
          <ul aria-labelledby={title} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-warning/25 bg-warning/5">
            {shown.map(item => (
              <li key={item.key} className="border-b border-warning/15 last:border-b-0">
                {item.anchor ? (
                  <a
                    href={`#${item.anchor}`}
                    onClick={event => goTo(item.anchor!, event)}
                    className="group flex min-w-0 items-start gap-2.5 px-3 py-2 text-sm transition-colors duration-120 hover:bg-warning/8 focus-visible:outline-offset-[-2px]"
                  >
                    <Line item={item} />
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-faint transition-[color,translate] duration-120 group-hover:translate-x-0.5 group-hover:text-text motion-reduce:transition-none" aria-hidden />
                  </a>
                ) : (
                  <div className="flex min-w-0 items-start gap-2.5 px-3 py-2 text-sm">
                    <Line item={item} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {items.length > FIRST && (
            <button type="button" aria-expanded={all} onClick={() => setAll(!all)} className="self-start rounded-sm text-xs font-medium text-accent-hover transition-colors duration-120 hover:text-text">
              {all ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Line({ item }: { item: ReadinessItem }) {
  return (
    <>
      <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-mono text-[13px] [overflow-wrap:anywhere] text-text">{breakable(item.label)}</span> <span className="text-muted">{item.problem}</span>
      </span>
    </>
  );
}
