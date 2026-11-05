import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.ts';

const PADDING = {
  none: '[--card-p:0px]',
  sm: '[--card-p:1rem]',
  md: '[--card-p:1.25rem]',
  lg: '[--card-p:1.5rem]',
};

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
  padding?: keyof typeof PADDING;
  /** The one card a screen is about, as the run card: rounder, with a shadow. */
  elevated?: boolean;
};

/** A surface with an edge. The header, body and footer parts lay out inside its padding; the footer reaches its edges. */
export function Card({ as: Tag = 'div', padding = 'md', elevated, className, ...rest }: CardProps) {
  return (
    <Tag
      data-ui="card"
      className={cn(
        'border bg-surface p-(--card-p)',
        PADDING[padding],
        elevated ? 'rounded-xl border-border-strong/70 shadow-card' : 'rounded-lg border-border',
        className,
      )}
      {...rest}
    />
  );
}

type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** On the right: a badge, a button. */
  actions?: ReactNode;
  /** The heading level, 3 unless the card is a section of its own. */
  level?: 2 | 3 | 4;
  className?: string;
};

export function CardHeader({ title, description, icon, actions, level = 3, className }: CardHeaderProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      {icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-2 text-muted [&>svg]:size-[18px]" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Heading className="text-base leading-6 font-semibold text-text">{title}</Heading>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-5 -mx-(--card-p) -mb-(--card-p) flex flex-wrap items-center justify-end gap-2 rounded-b-[inherit] border-t border-border bg-surface-2/40 px-(--card-p) py-3',
        className,
      )}
      {...rest}
    />
  );
}
