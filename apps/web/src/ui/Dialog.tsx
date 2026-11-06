import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Description, DialogBackdrop, DialogPanel, DialogTitle, Dialog as HeadlessDialog } from '@headlessui/react';
import { cn } from './cn.ts';
import { IconButton } from './IconButton.tsx';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One or two sentences under the title; it becomes the dialog's description. */
  description?: ReactNode;
  children?: ReactNode;
  /** The buttons, the main one last: on a phone they stack with it on top. */
  footer?: ReactNode;
  /** An icon in a tinted square before the title, as for a destructive question. */
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

/** Modal: focus moves in and stays in, Escape and a click outside close it, and focus returns where it was. */
export function Dialog({ open, onClose, title, description, children, footer, icon, tone = 'default', size = 'md', className }: DialogProps) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-[#0e1a2b]/35 transition-opacity duration-200 ease-out data-closed:opacity-0" />
      <div className="fixed inset-0 flex w-screen items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
        <DialogPanel
          data-ui="dialog"
          transition
          className={cn(
            'relative w-full rounded-xl border border-border-strong bg-surface shadow-popover transition duration-200 ease-out data-closed:translate-y-2 data-closed:opacity-0 sm:data-closed:translate-y-0 sm:data-closed:scale-[0.97] motion-reduce:transition-none',
            SIZE[size],
            className,
          )}
        >
          <div className="flex items-start gap-3.5 px-5 pt-5">
            {icon && (
              <span
                aria-hidden
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-5',
                  tone === 'danger' ? 'border-danger/32 bg-danger/12 text-danger-text' : 'border-accent/36 bg-accent/14 text-accent',
                )}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="text-base font-semibold text-text">{title}</DialogTitle>
              {description && <Description className="mt-1 text-sm text-muted">{description}</Description>}
            </div>
            <IconButton label="Close" icon={<X />} size="sm" tooltip={false} onClick={onClose} className="-mt-1 -mr-2" />
          </div>
          {children ? <div className="px-5 pt-4 pb-5 text-sm text-text">{children}</div> : <div className="h-5" />}
          {footer && <div className="flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-surface-2/40 px-5 py-3.5 sm:flex-row sm:justify-end">{footer}</div>}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
