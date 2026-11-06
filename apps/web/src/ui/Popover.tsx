import { Fragment, type ReactElement, type ReactNode } from 'react';
import { CloseButton, Popover as HeadlessPopover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { cn } from './cn.ts';

type Anchor = 'bottom' | 'bottom start' | 'bottom end' | 'top' | 'top start' | 'top end';

type PopoverProps = {
  /** The element that opens it: a Button or an IconButton. It gets aria-expanded and data-open. */
  trigger: ReactElement;
  /** A function gets close(), for links and actions that should shut the panel. */
  children: ReactNode | ((bag: { close: () => void }) => ReactNode);
  anchor?: Anchor;
  /** Names the panel, which then is a non-modal dialog: an aria-label needs a role to name. Without it, the panel has neither. */
  label?: string;
  className?: string;
  panelClassName?: string;
};

export const popoverPanel =
  'z-60 rounded-xl border border-border-strong bg-surface shadow-popover outline-none transition duration-150 ease-out [--anchor-padding:8px] data-closed:-translate-y-1 data-closed:opacity-0 motion-reduce:transition-none';

/**
 * Click to open, Escape or a click outside to close, focus returns to the trigger. The panel sits in a portal next to its
 * trigger and stays on screen.
 */
export function Popover({ trigger, children, anchor = 'bottom end', label, className, panelClassName }: PopoverProps) {
  return (
    <HeadlessPopover data-ui="popover" className={cn('relative', className)}>
      <PopoverButton as={Fragment}>{trigger}</PopoverButton>
      <PopoverPanel
        anchor={{ to: anchor, gap: 8 }}
        transition
        role={label ? 'dialog' : undefined}
        aria-label={label}
        className={cn(popoverPanel, 'w-72 max-w-[calc(100vw_-_16px)] p-1.5', panelClassName)}
      >
        {({ close }) => <>{typeof children === 'function' ? children({ close }) : children}</>}
      </PopoverPanel>
    </HeadlessPopover>
  );
}

/** Closes the popover around it when clicked, so a menu item needs no close() of its own. */
export const PopoverClose = CloseButton;
