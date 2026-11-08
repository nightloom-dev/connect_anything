import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from './cn.ts';

type Props = { href: string; children: ReactNode; className?: string; iconClassName?: string };

/** A link that opens in a new tab: an arrow shows it, and a screen reader says it. */
export function ExternalLink({ href, children, className, iconClassName }: Props) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn('inline-flex items-center', className)}>
      {children}
      <ArrowUpRight className={cn('size-3.5 shrink-0', iconClassName)} aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
