import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.ts';
import { Spinner } from './Spinner.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const BASE =
  'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border select-none transition-[background-color,border-color,color,box-shadow,translate] duration-120 ease-out enabled:active:translate-y-px [&:is(a)]:active:translate-y-px disabled:cursor-not-allowed aria-busy:cursor-progress';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-accent-solid text-white shadow-button enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:border-border disabled:bg-surface-2 disabled:text-faint disabled:shadow-none',
  secondary:
    'border-border-strong bg-surface text-text enabled:hover:border-border-hover enabled:hover:bg-surface-2 enabled:active:bg-surface-3 disabled:border-border disabled:bg-surface disabled:text-faint',
  // accent tint, for a call to action that should not outshout the screen's primary: the wallet in the header
  soft: 'border-accent/40 bg-accent/8 text-accent enabled:hover:border-accent/60 enabled:hover:bg-accent/12 enabled:hover:text-accent-hover enabled:active:bg-accent/16 disabled:border-border disabled:bg-surface disabled:text-faint',
  ghost: 'border-transparent bg-transparent text-muted enabled:hover:bg-text/6 enabled:hover:text-text enabled:active:bg-text/9 disabled:text-faint',
  danger:
    'border-danger/40 bg-danger/7 text-danger-text enabled:hover:border-danger/60 enabled:hover:bg-danger/11 enabled:active:bg-danger/15 disabled:border-border disabled:bg-surface disabled:text-faint',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1 px-2 text-xs font-medium',
  sm: 'h-8 gap-1.5 px-3 text-sm font-medium',
  md: 'h-10 gap-2 px-4 text-sm font-medium',
  lg: 'h-12 gap-2 px-5 text-base font-semibold',
};

const ICON: Record<ButtonSize, string> = { xs: 'size-3.5', sm: 'size-3.5', md: 'size-4', lg: 'size-[18px]' };

/** The colors and states of a variant without a size, for controls that size themselves (IconButton). */
export const buttonLook = (variant: ButtonVariant) => cn(BASE, VARIANT[variant]);

/** The look of a Button, for a link that acts as one: `<Link href="/kamino" className={buttonClass({ variant: 'primary' })}>`. */
export const buttonClass = ({ variant = 'secondary', size = 'md', block = false, className }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) =>
  cn(BASE, VARIANT[variant], SIZE[size], block && 'w-full', className);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Shows a spinner in place of the icon, or over the label when there is none, so the width stays. Clicks do nothing
   * meanwhile, and the button keeps the focus: pass this, not `disabled`, to a button that works after a click.
   */
  loading?: boolean;
  /** Before the label. */
  icon?: ReactNode;
  /** After the label, for an arrow or a chevron. */
  iconRight?: ReactNode;
  /** Takes the whole width. */
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, iconRight, block, className, children, type = 'button', onClick, ...rest },
  ref,
) {
  const overlay = loading && !icon;
  // A busy button that has the focus keeps it: the disabled attribute would drop it to the page, and the next Tab would
  // start somewhere else. Meanwhile it is disabled for assistive tech and takes no click, as any busy button.
  const [focused, setFocused] = useState(false);
  const slot = (node: ReactNode) => (
    <span className={cn('inline-flex shrink-0 items-center justify-center [&>svg]:size-full', ICON[size])} aria-hidden>
      {node}
    </span>
  );
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={rest.disabled && !(loading && focused)}
      onFocus={event => {
        setFocused(true);
        rest.onFocus?.(event);
      }}
      onBlur={event => {
        setFocused(false);
        rest.onBlur?.(event);
      }}
      data-ui="button"
      data-variant={variant}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      onClick={loading ? event => event.preventDefault() : onClick}
      className={buttonClass({ variant, size, block, className })}
    >
      {/* under the spinner the label is see-through, not hidden, so that it still names the button */}
      <span className={cn('inline-flex min-w-0 items-center justify-center gap-[inherit]', overlay && 'opacity-0')}>
        {icon && slot(loading ? <Spinner /> : icon)}
        {children}
        {iconRight && slot(iconRight)}
      </span>
      {overlay && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === 'lg' ? 'lg' : 'md'} />
        </span>
      )}
    </button>
  );
});
