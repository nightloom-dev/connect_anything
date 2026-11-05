import type { ReactNode } from 'react';
import { cn } from './cn.ts';

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  /** One sentence: why it is empty, or what to do. */
  children?: ReactNode;
  /** Buttons. */
  action?: ReactNode;
  level?: 2 | 3 | 4;
  /** Less air, inside a card. */
  compact?: boolean;
  className?: string;
};

export function EmptyState({ icon, title, children, action, level = 3, compact = false, className }: EmptyStateProps) {
  const Heading = `h${level}` as const;
  return (
    <div data-ui="empty-state" className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      {icon && (
        <div
          className={cn(
            'mb-4 flex items-center justify-center rounded-xl border border-border-strong bg-linear-to-b from-surface-3 to-surface-2 text-muted shadow-card',
            compact ? 'size-10 [&>svg]:size-[18px]' : 'size-12 [&>svg]:size-5',
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <Heading className="text-base font-semibold text-text">{title}</Heading>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
