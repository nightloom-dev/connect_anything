import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DisclosureButton, DisclosurePanel, Disclosure as HeadlessDisclosure } from '@headlessui/react';
import { cn } from './cn.ts';

type DisclosureProps = {
  title: ReactNode;
  /** Shown next to the title, closed or open: a count, a badge. */
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** plain: a quiet text toggle. card: a bordered row the width of its container. */
  variant?: 'plain' | 'card';
  className?: string;
  panelClassName?: string;
};

const panelMotion = 'transition duration-200 ease-out data-closed:-translate-y-1 data-closed:opacity-0 motion-reduce:transition-none';

/** Show more on demand. The button carries aria-expanded, and Enter or Space toggles it. */
export function Disclosure({ title, aside, children, defaultOpen = false, variant = 'plain', className, panelClassName }: DisclosureProps) {
  if (variant === 'card') {
    return (
      <HeadlessDisclosure as="div" data-ui="disclosure" defaultOpen={defaultOpen} className={cn('rounded-lg border border-border bg-surface', className)}>
        <DisclosureButton className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm font-medium text-text transition-colors duration-120 hover:bg-white/3">
          <span className="min-w-0 flex-1">{title}</span>
          {aside && <span className="shrink-0 text-xs text-muted">{aside}</span>}
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-200 group-data-open:rotate-180" aria-hidden />
        </DisclosureButton>
        <DisclosurePanel transition className={cn('border-t border-border px-4 py-3.5 text-sm', panelMotion, panelClassName)}>
          {children}
        </DisclosurePanel>
      </HeadlessDisclosure>
    );
  }
  return (
    <HeadlessDisclosure as="div" data-ui="disclosure" defaultOpen={defaultOpen} className={className}>
      <DisclosureButton className="group -ml-0.5 inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted transition-colors duration-120 hover:text-text data-open:text-text">
        <ChevronRight className="size-4 transition-transform duration-200 group-data-open:rotate-90" aria-hidden />
        {title}
        {aside && <span className="ml-1 text-xs font-normal text-muted">{aside}</span>}
      </DisclosureButton>
      <DisclosurePanel transition className={cn('mt-2.5', panelMotion, panelClassName)}>
        {children}
      </DisclosurePanel>
    </HeadlessDisclosure>
  );
}
