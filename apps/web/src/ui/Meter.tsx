import { useId, type ReactNode } from 'react';
import { cn } from './cn.ts';

type MeterProps = {
  label: ReactNode;
  value: number;
  /** The limit: 200,000 compute units, 1,232 bytes. */
  max: number;
  /** The share of max where it turns amber. */
  warnAt?: number;
  /** How a figure reads: 154000 → "154,000". */
  format?: (value: number) => string;
  /** After the figures: "CU", "bytes". */
  unit?: string;
  /** Under the bar, in place of the share of the limit. */
  hint?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
};

const FILL = { ok: 'bg-accent', warn: 'bg-warning', over: 'bg-danger' };
const FIGURE = { ok: 'text-text', warn: 'text-warning', over: 'text-danger-text' };
const grouped = (value: number) => value.toLocaleString('en-US');

/** How much of a limit something uses. Over the limit the bar fills red and says by how much. */
export function Meter({ label, value, max, warnAt = 0.85, format = grouped, unit, hint, size = 'md', className }: MeterProps) {
  const id = useId();
  const state = value > max ? 'over' : value >= max * warnAt ? 'warn' : 'ok';
  const share = max > 0 ? value / max : 0;
  const tail = unit ? ` ${unit}` : '';
  const status = state === 'over' ? `${format(value - max)}${tail} over the limit` : `${Math.round(share * 100)}% of the limit`;
  return (
    <div data-ui="meter" data-state={state} className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span id={id} className="text-sm font-medium text-text">
          {label}
        </span>
        <span className="text-sm text-muted nums">
          <span className={cn('font-medium', FIGURE[state])}>{format(value)}</span> / {format(max)}
          {tail}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={`${format(value)} of ${format(max)}${tail}${state === 'over' ? ', over the limit' : ''}`}
        className={cn('relative mt-2 overflow-hidden rounded-full bg-surface-3', size === 'sm' ? 'h-1.5' : 'h-2')}
      >
        <div
          className={cn('h-full transition-[clip-path,background-color] duration-600 ease-out motion-reduce:transition-none', FILL[state])}
          style={{ clipPath: `inset(0 ${100 - Math.min(share, 1) * 100}% 0 0 round 999px)` }}
        />
        {/* where amber starts */}
        <span aria-hidden className="absolute inset-y-0 w-px bg-bg/70" style={{ left: `${warnAt * 100}%` }} />
      </div>
      {(hint ?? size === 'md') && <p className={cn('mt-1.5 text-xs leading-5', state === 'over' ? 'text-danger-text' : 'text-muted')}>{hint ?? status}</p>}
    </div>
  );
}
