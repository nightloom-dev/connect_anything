import { useId, type ReactNode } from 'react';
import { cn } from './cn.ts';

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** A line under the label: what turning it on does. */
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  name?: string;
  className?: string;
};

const TRACK = { sm: 'h-4 w-7', md: 'h-5 w-9' };
const THUMB = { sm: 'size-3 peer-checked:translate-x-3', md: 'size-4 peer-checked:translate-x-4' };

/** A native checkbox with role="switch": Space toggles it, the label toggles it, and forms and tests see a checkbox. */
export function Switch({ checked, onChange, label, description, disabled, size = 'md', name, className }: SwitchProps) {
  const id = useId();
  return (
    <div data-ui="switch" className={cn('flex items-start gap-3', className)}>
      <span className={cn('relative mt-0.5 inline-flex shrink-0', TRACK[size])}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          name={name}
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={event => onChange(event.target.checked)}
          className={cn(
            'peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-full border border-border-control bg-surface-3 transition-colors duration-200 ease-out',
            'hover:border-border-control-hover checked:border-accent-solid checked:bg-accent-solid checked:hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
        <span
          aria-hidden
          className={cn('pointer-events-none absolute top-1/2 left-0.5 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-transform duration-200 ease-out peer-disabled:opacity-70', THUMB[size])}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className={cn('text-sm font-medium text-text', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
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
