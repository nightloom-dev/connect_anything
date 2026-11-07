import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn.ts';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  /** Some but not all: shows a dash, and aria-checked="mixed". */
  indeterminate?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
};

/** A native checkbox in the app's look, so the label, Space and form behaviour stay the browser's. */
export function Checkbox({ checked, onChange, label, description, indeterminate = false, disabled, name, className }: CheckboxProps) {
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <div data-ui="checkbox" className={cn('flex items-start gap-2.5', className)}>
      <span className="relative mt-0.5 flex size-4 shrink-0">
        <input
          ref={box}
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={event => onChange(event.target.checked)}
          className={cn(
            'peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-xs border border-border-control bg-surface transition-colors duration-120',
            'hover:border-border-control-hover checked:border-accent-solid checked:bg-accent-solid indeterminate:border-accent-solid indeterminate:bg-accent-solid disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="pointer-events-none absolute inset-0 hidden text-white peer-checked:block peer-indeterminate:hidden">
          <path d="m4 8.5 2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="pointer-events-none absolute inset-0 hidden text-white peer-indeterminate:block">
          <path d="M4.5 8h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className={cn('text-sm leading-5 text-text', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
          {label}
        </label>
        {description && (
          <span id={`${id}-description`} className="text-xs leading-5 text-muted">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
