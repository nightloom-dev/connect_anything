import type { ReactNode } from 'react';
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { ChevronDown, CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from './cn.ts';

export type AlertKind = 'info' | 'success' | 'warning' | 'danger';

const KIND: Record<AlertKind, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'border-info/32 bg-info/12', icon: 'text-info', Icon: Info },
  success: { box: 'border-success/32 bg-success/12', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'border-warning/32 bg-warning/12', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'border-danger/32 bg-danger/12', icon: 'text-danger', Icon: OctagonAlert },
};

export type AlertProps = {
  kind?: AlertKind;
  /** The short version, in one line. */
  title?: ReactNode;
  /** The exact version. */
  children?: ReactNode;
  /** Buttons, under the text. */
  actions?: ReactNode;
  /** The long reason behind a "Why?" toggle, for a caveat that matters but would bury the title. */
  why?: ReactNode;
  whyLabel?: string;
  /** Another icon, or false for none. */
  icon?: ReactNode | false;
  className?: string;
  id?: string;
};

/** danger is announced at once (role alert), everything else politely (role status), as Notice did. */
export function Alert({ kind = 'info', title, children, actions, why, whyLabel = 'Why?', icon, className, id }: AlertProps) {
  const { box, icon: tint, Icon } = KIND[kind];
  return (
    <div id={id} data-ui="alert" data-kind={kind} role={kind === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed', box, className)}>
      {icon !== false && (
        <span className={cn('mt-0.5 flex size-[18px] shrink-0 items-center justify-center [&>svg]:size-full', tint)} aria-hidden>
          {icon ?? <Icon strokeWidth={2.1} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-text">{title}</div>}
        {children && <div className={cn(title ? 'mt-0.5 text-text/80' : 'text-text/90')}>{children}</div>}
        {why && (
          <Disclosure>
            <DisclosureButton className="group mt-1.5 -ml-1 inline-flex items-center gap-1 rounded-sm px-1 text-xs font-medium text-text/70 transition-colors hover:text-text">
              {whyLabel}
              <ChevronDown className="size-3.5 transition-transform duration-200 group-data-open:rotate-180" aria-hidden />
            </DisclosureButton>
            <DisclosurePanel transition className="mt-1.5 text-text/80 transition duration-200 ease-out data-closed:-translate-y-1 data-closed:opacity-0">
              {why}
            </DisclosurePanel>
          </Disclosure>
        )}
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
