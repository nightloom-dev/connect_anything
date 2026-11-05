import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from './cn.ts';

type HealthBarProps = {
  /** The LTV now, as a fraction: 0.72. */
  value: number;
  /** Where liquidation starts, as a fraction. */
  liquidation: number;
  /** Where the amber zone starts. Default: 10 points under liquidation. */
  caution?: number;
  /** The LTV the user aims for. */
  target?: number | null;
  /** The LTV after the repayment, once there is a quote. The bar moves to it. */
  after?: number | null;
  /** The right end of the bar. Default 100%, or further when a value is past it. */
  max?: number;
  format?: (fraction: number) => string;
  label?: string;
  /** sm: the bar alone, for a list of positions. */
  size?: 'sm' | 'md';
  className?: string;
};

type Zone = 'safe' | 'caution' | 'danger';

const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;
const FILL: Record<Zone, string> = { safe: 'bg-success', caution: 'bg-warning', danger: 'bg-danger' };
const TEXT: Record<Zone, string> = { safe: 'text-success', caution: 'text-warning', danger: 'text-danger-text' };
const MOVE = 'transition-[left,width,opacity,background-color] duration-700 ease-out motion-reduce:transition-none';

/** An LTV against its liquidation line: the zones, where it is now, the target, and where it lands after paying. */
export function HealthBar({ value, liquidation, caution, target, after, max, format = percent, label = 'LTV', size = 'md', className }: HealthBarProps) {
  const amber = caution ?? Math.max(liquidation - 0.1, 0);
  const end = max ?? Math.max(1, value, after ?? 0, target ?? 0, liquidation);
  const at = (fraction: number) => `${(Math.min(Math.max(fraction, 0), end) / end) * 100}%`;
  const zone = (fraction: number): Zone => (fraction >= liquidation ? 'danger' : fraction >= amber ? 'caution' : 'safe');
  const landed = after ?? value;
  const paying = after != null && after < value;
  const text = [`${label} ${format(value)}`, `liquidation at ${format(liquidation)}`, target != null && `target ${format(target)}`, after != null && `${format(after)} after the repayment`].filter(Boolean).join(', ');

  const bar = (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(end * 1000) / 10}
      aria-valuenow={Math.round(Math.min(value, end) * 1000) / 10}
      aria-valuetext={text}
      className={cn('relative', size === 'sm' ? 'h-1.5' : 'h-2.5')}
    >
      {/* the zones */}
      <div className="absolute inset-0 overflow-hidden rounded-full bg-surface-3">
        <span className="absolute inset-y-0 left-0 bg-success/16" style={{ width: at(amber) }} />
        <span className="absolute inset-y-0 bg-warning/20" style={{ left: at(amber), width: `calc(${at(liquidation)} - ${at(amber)})` }} />
        <span className="absolute inset-y-0 right-0 bg-danger/22" style={{ left: at(liquidation) }} />
        {/* what the repayment takes off, between where it is and where it lands */}
        <span
          className={cn('absolute inset-y-0', MOVE, paying ? 'opacity-100' : 'opacity-0')}
          style={{ left: at(landed), width: `calc(${at(value)} - ${at(landed)})`, backgroundImage: 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.22) 0 3px, transparent 3px 6px)' } as CSSProperties}
        />
        <span className={cn('absolute inset-y-0 left-0 rounded-full', MOVE, FILL[zone(landed)])} style={{ width: at(landed) }} />
      </div>
      {/* liquidation, dashed through the bar */}
      <span
        aria-hidden
        className={cn('absolute w-0 border-l-2 border-dashed border-danger', size === 'sm' ? '-inset-y-1' : '-inset-y-2')}
        style={{ left: at(liquidation), transform: 'translateX(-1px)' }}
      />
      {size === 'md' && (
        <>
          {/* now */}
          <span aria-hidden className="absolute -inset-y-1.5 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_var(--color-surface)]" style={{ left: at(value) }} />
          {/* after */}
          <span
            aria-hidden
            className={cn('absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white', MOVE, FILL[zone(landed)], after != null ? 'opacity-100' : 'opacity-0')}
            style={{ left: at(landed) }}
          />
          {/* target */}
          {target != null && (
            <span aria-hidden className="absolute top-full mt-1 -translate-x-1/2 text-accent" style={{ left: at(target) }}>
              <svg width="10" height="7" viewBox="0 0 10 7" fill="currentColor">
                <path d="M5 0 10 7H0z" />
              </svg>
            </span>
          )}
        </>
      )}
    </div>
  );

  if (size === 'sm') return <div data-ui="health-bar" className={cn('py-1', className)}>{bar}</div>;

  return (
    <div data-ui="health-bar" className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-end justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="flex items-baseline gap-2 text-2xl leading-8 font-semibold tracking-tight nums" aria-hidden>
          <span className={cn(after != null ? 'text-muted' : TEXT[zone(value)], 'transition-colors duration-500')}>{format(value)}</span>
          {after != null && (
            <>
              <ArrowRight className="size-4 self-center text-muted" />
              <span className={TEXT[zone(after)]}>{format(after)}</span>
            </>
          )}
        </span>
      </div>
      <div className="mt-3 mb-5">{bar}</div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-1 rounded-full bg-white" />
          Now <span className="text-text nums">{format(value)}</span>
        </li>
        {after != null && (
          <li className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full border-2 border-white', FILL[zone(after)])} />
            After <span className="text-text nums">{format(after)}</span>
          </li>
        )}
        {target != null && (
          <li className="flex items-center gap-1.5">
            <svg width="10" height="7" viewBox="0 0 10 7" fill="currentColor" className="text-accent">
              <path d="M5 0 10 7H0z" />
            </svg>
            Target <span className="text-text nums">{format(target)}</span>
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-0 border-l-2 border-dashed border-danger" />
          Liquidation <span className="text-text nums">{format(liquidation)}</span>
        </li>
      </ul>
    </div>
  );
}
