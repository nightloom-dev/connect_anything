import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../ui/index.ts';

/** One labelled example in a gallery section. */
export function Demo({ title, children, className, wide = false }: { title: string; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', wide && 'md:col-span-2', className)}>
      <h4 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h4>
      {children}
    </div>
  );
}

/** Examples side by side, two columns from md. */
export function DemoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-x-8 gap-y-10 md:grid-cols-2', className)}>{children}</div>;
}

/** Items in a wrapping row. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>;
}

/** A surface like a page card, to show something as it sits on one. */
export function Surface({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-xl border border-border bg-surface p-5', className)}>
      {children}
    </div>
  );
}
