import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from './cn.ts';

type FieldProps = {
  label?: ReactNode;
  /** On the right of the label: a balance, a link. */
  aside?: ReactNode;
  hint?: ReactNode;
  /** Takes the place of the hint. */
  error?: ReactNode;
  htmlFor?: string;
  hintId?: string;
  errorId?: string;
  className?: string;
  children: ReactNode;
};

/** A label above, a hint or an error below. Input uses it when given any of them; wrap other controls in it by hand. */
export function Field({ label, aside, hint, error, htmlFor, hintId, errorId, className, children }: FieldProps) {
  return (
    <div data-ui="field" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex min-h-5 items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={htmlFor} className="text-sm font-medium text-text">
              {label}
            </label>
          )}
          {aside && <div className="ml-auto text-xs text-muted">{aside}</div>}
        </div>
      )}
      {children}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs leading-5 text-danger-text">
          <CircleAlert className="mt-[3px] size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs leading-5 text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export type InputSize = 'sm' | 'md' | 'lg';

// 16px under 640px wide, or iOS zooms the page in on focus
export const FIELD_SIZE: Record<InputSize, string> = {
  sm: 'h-8 px-2.5 text-base sm:text-sm',
  md: 'h-10 px-3 text-base sm:text-sm',
  lg: 'h-12 px-3.5 text-base',
};

/** The frame of a field: Input draws it, and so can a custom control that wants to look like one. */
export const fieldBox = ({ size = 'md', invalid = false, disabled = false, className }: { size?: InputSize; invalid?: boolean; disabled?: boolean; className?: string } = {}) =>
  cn(
    'flex w-full min-w-0 items-center gap-2 rounded-md border transition-[border-color,box-shadow,background-color] duration-120 ease-out',
    FIELD_SIZE[size],
    disabled
      ? 'cursor-not-allowed border-border-control bg-surface opacity-60'
      : invalid
        ? 'border-danger/70 bg-surface-2 has-[input:focus]:border-danger has-[input:focus]:shadow-[0_0_0_4px_rgb(255_92_108/0.18)]'
        : 'border-border-control bg-surface-2 [&:hover:not(:has(input:focus))]:border-border-control-hover has-[input:focus]:border-accent has-[input:focus]:shadow-glow',
    className,
  );

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  /** Shown under the field, and sets aria-invalid. */
  error?: ReactNode;
  /** Inside the frame, before the text: an icon. */
  leading?: ReactNode;
  /** Inside the frame, after the text: a unit, buttons. */
  trailing?: ReactNode;
  size?: InputSize;
  /** JetBrains Mono, for addresses, ids and hex. */
  mono?: boolean;
  /** Classes for the Field around it. */
  containerClassName?: string;
  /** Classes for the frame. `className` goes to the <input>. */
  boxClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, aside, hint, error, leading, trailing, size = 'md', mono, className, containerClassName, boxClassName, id, disabled, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const invalid = !!error || rest['aria-invalid'] === true || rest['aria-invalid'] === 'true';
  const describedBy = [rest['aria-describedby'], error ? errorId : hint ? hintId : undefined].filter(Boolean).join(' ') || undefined;

  const box = (
    <div data-ui="input" className={fieldBox({ size, invalid, disabled, className: boxClassName })}>
      {leading && (
        <span className="flex shrink-0 items-center text-muted [&>svg]:size-4" aria-hidden>
          {leading}
        </span>
      )}
      <input
        {...rest}
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-full w-full min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-placeholder disabled:cursor-not-allowed',
          mono && 'font-mono text-[0.9em] tracking-tight',
          className,
        )}
      />
      {trailing && <span className="-mr-1 flex shrink-0 items-center gap-1">{trailing}</span>}
    </div>
  );

  if (!label && !aside && !hint && !error) return box;
  return (
    <Field label={label} aside={aside} hint={hint} error={error} htmlFor={inputId} hintId={hintId} errorId={errorId} className={containerClassName}>
      {box}
    </Field>
  );
});
