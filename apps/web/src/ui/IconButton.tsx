import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.ts';
import { Spinner } from './Spinner.tsx';
import { Tooltip } from './Tooltip.tsx';
import { buttonLook, type ButtonVariant } from './Button.tsx';

type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<IconButtonSize, string> = { xs: 'size-6', sm: 'size-8', md: 'size-10', lg: 'size-12' };
const ICON: Record<IconButtonSize, string> = { xs: 'size-3.5', sm: 'size-4', md: 'size-[18px]', lg: 'size-5' };

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** The accessible name and the tooltip: say what it does, as in "Copy address". */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  /** Set false where the label is already visible next to it. */
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'sm', loading = false, tooltip = true, tooltipSide, className, type = 'button', onClick, ...rest },
  ref,
) {
  const button = (
    <button
      {...rest}
      ref={ref}
      type={type}
      data-ui="icon-button"
      data-variant={variant}
      aria-label={label}
      aria-busy={loading || undefined}
      onClick={loading ? event => event.preventDefault() : onClick}
      className={cn(buttonLook(variant), SIZE[size], className)}
    >
      <span className={cn('inline-flex items-center justify-center [&>svg]:size-full', ICON[size])} aria-hidden>
        {loading ? <Spinner /> : icon}
      </span>
    </button>
  );
  return tooltip ? (
    <Tooltip content={label} describe={false} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  );
});
