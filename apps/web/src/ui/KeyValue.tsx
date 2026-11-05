import type { ReactNode } from 'react';
import { cn } from './cn.ts';

type Tone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'accent';

const TONE: Record<Tone, string> = {
  default: 'text-text',
  muted: 'text-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger-text',
  accent: 'text-accent-hover',
};

export type KeyValueItem = {
  label: ReactNode;
  value: ReactNode;
  /** A line under the label, as "after the bridge's fee and slippage". */
  hint?: ReactNode;
  /** The sum the rows above lead to: an edge above it, a larger figure. */
  total?: boolean;
  tone?: Tone;
  /** For React, when labels repeat or are not strings. */
  key?: string;
};

type KeyValueProps = {
  items?: KeyValueItem[];
  /** KeyValueRow elements, for rows that come and go by condition. Rendered after `items`. */
  children?: ReactNode;
  /** A hairline between rows. */
  divided?: boolean;
  /** Tighter rows, for a list in a popover. */
  dense?: boolean;
  /** Long values wrap and stay left, under or beside the label, instead of right-aligned figures. */
  stacked?: boolean;
  className?: string;
};

/** Label on the left, figure on the right: what dl.figures was, for amounts, fees and statuses. */
export function KeyValue({ items = [], children, divided = false, dense = false, stacked = false, className }: KeyValueProps) {
  return (
    <dl data-ui="key-value" data-divided={divided || undefined} data-dense={dense || undefined} data-stacked={stacked || undefined} className={cn('group/kv flex flex-col text-sm', className)}>
      {items.map((item, index) => (
        <KeyValueRow key={item.key ?? (typeof item.label === 'string' ? item.label : index)} {...item} />
      ))}
      {children}
    </dl>
  );
}

export function KeyValueRow({ label, value, hint, total = false, tone = 'default' }: Omit<KeyValueItem, 'key'>) {
  return (
    <div
      className={cn(
        'flex gap-x-4 gap-y-0.5 py-2.5 group-data-dense/kv:py-1.5',
        'group-data-stacked/kv:flex-col sm:group-data-stacked/kv:flex-row',
        'group-data-divided/kv:border-t group-data-divided/kv:border-border group-data-divided/kv:first:border-t-0',
        total && 'mt-1 border-t border-border-strong pt-3.5 group-data-divided/kv:border-border-strong',
      )}
    >
      <dt className={cn('min-w-0 shrink-0 text-muted', 'group-data-stacked/kv:sm:w-2/5', total && 'font-medium text-text')}>
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted/90">{hint}</span>}
      </dt>
      <dd
        className={cn(
          'ml-auto min-w-0 text-right nums group-data-stacked/kv:ml-0 group-data-stacked/kv:text-left',
          total ? 'text-base font-semibold' : 'font-medium',
          TONE[tone],
        )}
      >
        {value}
      </dd>
    </div>
  );
}
