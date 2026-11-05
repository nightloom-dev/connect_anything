import { cn } from './cn.ts';

const SIZE = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 };

type SpinnerProps = {
  size?: keyof typeof SIZE;
  /** Said by a screen reader. Without it the spinner is decoration next to a text that says the same. */
  label?: string;
  className?: string;
};

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const px = SIZE[size];
  return (
    <svg
      data-ui="spinner"
      className={cn('animate-spin shrink-0', className)}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21.5 12A9.5 9.5 0 0 0 12 2.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
