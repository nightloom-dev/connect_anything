import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn.ts';

type TooltipProps = {
  content: ReactNode;
  /** One element that can take focus: a button, a link, or an element with tabIndex. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'bottom';
  /** Hover delay in ms. Keyboard focus shows it at once. */
  delay?: number;
  /** Off when the content repeats the element's own accessible name, as in an IconButton. */
  describe?: boolean;
  disabled?: boolean;
  /** Room for a whole address. */
  wide?: boolean;
  className?: string;
};

const GAP = 8;
const EDGE = 8;

/**
 * Shown on hover and on keyboard focus, hidden on Escape, and it stays while the pointer is over it (WCAG 1.4.13).
 * It sits in a portal with fixed coordinates, so no overflow clips it, and it flips under the element at the top edge.
 */
export function Tooltip({ content, children, side = 'top', delay = 300, describe = true, disabled, wide = false, className }: TooltipProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; side: 'top' | 'bottom' }>();

  const show = (wait: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), wait);
  };
  const hide = (wait = 60) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOpen(false);
      setPlace(undefined);
    }, wait);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    const target = anchor.current?.firstElementChild;
    if (!open || !target || !tip.current) return;
    const at = target.getBoundingClientRect();
    const size = tip.current.getBoundingClientRect();
    let where = side;
    if (where === 'top' && at.top - size.height - GAP < EDGE) where = 'bottom';
    else if (where === 'bottom' && at.bottom + size.height + GAP > window.innerHeight - EDGE) where = 'top';
    const top = where === 'top' ? at.top - size.height - GAP : at.bottom + GAP;
    const left = Math.min(Math.max(at.left + at.width / 2 - size.width / 2, EDGE), window.innerWidth - size.width - EDGE);
    setPlace({ top, left, side: where });
  }, [open, side, content]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && hide(0);
    const onScroll = () => hide(0);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (disabled || content === undefined || content === null || content === '') return children;
  const child = isValidElement(children) && describe && open ? cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' ') }) : children;

  return (
    <>
      {/* display: contents adds no box, so the child lays out as if this span were not there */}
      <span
        ref={anchor}
        className="contents"
        onPointerEnter={event => event.pointerType !== 'touch' && show(delay)}
        onPointerLeave={() => hide()}
        onFocus={event => (event.target as HTMLElement).matches(':focus-visible') && show(0)}
        onBlur={() => hide(0)}
        onPointerDown={() => hide(0)}
      >
        {child}
      </span>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            data-ui="tooltip"
            data-side={place?.side ?? side}
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={() => hide()}
            style={{ top: place?.top ?? 0, left: place?.left ?? 0, visibility: place ? 'visible' : 'hidden' }}
            className={cn(
              'pointer-events-auto fixed z-70 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-xs leading-snug font-medium text-text shadow-popover animate-fade-in',
              wide ? 'max-w-[min(25rem,calc(100vw_-_16px))]' : 'max-w-[min(20rem,calc(100vw_-_16px))]',
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
