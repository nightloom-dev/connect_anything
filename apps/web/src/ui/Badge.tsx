import type { ReactNode } from 'react';
import { cn } from './cn.ts';

/** The account sources and flags of the builder, then plain statuses. */
export type BadgeVariant = 'auto' | 'recipe' | 'input' | 'signs' | 'writable' | 'optional' | 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'neutral';

const SUCCESS = 'border-success/32 bg-success/12 text-success';
const WARNING = 'border-warning/32 bg-warning/12 text-warning';
const DANGER = 'border-danger/32 bg-danger/12 text-danger-text';
const ACCENT = 'border-accent/36 bg-accent/14 text-accent-hover';
const INFO = 'border-info/32 bg-info/12 text-info';

const VARIANT: Record<BadgeVariant, string> = {
  auto: SUCCESS,
  ok: SUCCESS,
  recipe: ACCENT,
  accent: ACCENT,
  input: WARNING,
  warn: WARNING,
  signs: DANGER,
  bad: DANGER,
  writable: INFO,
  info: INFO,
  optional: 'border-dashed border-border-control bg-transparent text-muted',
  neutral: 'border-border-strong bg-surface-2 text-muted',
};

type BadgeProps = {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  /** A dot in the badge's color before the text. */
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
};

export function Badge({ variant = 'neutral', size = 'sm', dot, icon, children, className, title }: BadgeProps) {
  return (
    <span
      data-ui="badge"
      data-variant={variant}
      title={title}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-xs' : 'h-6 px-2.5 text-xs',
        VARIANT[variant],
        className,
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {icon && (
        <span className="flex size-3 shrink-0 [&>svg]:size-full" aria-hidden>
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
