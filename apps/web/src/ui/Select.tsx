import type { ReactNode } from 'react';
import { Check, ChevronsUpDown, CircleAlert } from 'lucide-react';
import { Description, Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { cn } from './cn.ts';
import { FIELD_SIZE, type InputSize } from './Input.tsx';
import { popoverPanel } from './Popover.tsx';

export type SelectOption<T> = {
  value: T;
  label: ReactNode;
  /** A second line under the label, in the list only. */
  description?: ReactNode;
  /** A ChainIcon or TokenIcon, in the button and in the list. */
  icon?: ReactNode;
  /** On the right in the list: a balance, a count. */
  aside?: ReactNode;
  disabled?: boolean;
};

type SelectProps<T> = {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shown while no option has the value. */
  placeholder?: ReactNode;
  size?: InputSize;
  disabled?: boolean;
  /** How two values compare: a field name or a function. Objects need it, strings and numbers do not. */
  by?: (T extends object ? keyof T & string : never) | ((a: T, z: T) => boolean);
  name?: string;
  /** The accessible name when there is no visible label. */
  'aria-label'?: string;
  className?: string;
  /** Width of the list: the button's (default) or as wide as its content needs. */
  wide?: boolean;
};

export const fieldButton = ({ size = 'md', invalid = false, disabled = false }: { size?: InputSize; invalid?: boolean; disabled?: boolean } = {}) =>
  cn(
    'flex w-full min-w-0 items-center gap-2 rounded-md border text-left transition-[border-color,box-shadow,background-color] duration-120 ease-out focus-visible:outline-none',
    FIELD_SIZE[size],
    disabled
      ? 'cursor-not-allowed border-border-control bg-surface text-muted opacity-60'
      : invalid
        ? 'border-danger/70 bg-surface-2 data-focus:border-danger data-focus:shadow-[0_0_0_4px_rgb(255_92_108/0.18)] data-open:border-danger'
        : 'border-border-control bg-surface-2 [&[data-hover]:not([data-focus],[data-open])]:border-[#4a5468] data-focus:border-accent data-focus:shadow-glow data-open:border-accent',
  );

export const optionRow =
  'group/option flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text select-none data-disabled:cursor-not-allowed data-disabled:opacity-45 data-focus:bg-white/6';

/** A list to pick one from, with the keyboard of a native select: arrows, Home, End, typing a letter, Escape. */
export function Select<T>({ value, onChange, options, label, hint, error, placeholder = 'Choose…', size = 'md', disabled, by, name, className, wide, ...rest }: SelectProps<T>) {
  const compare = by ?? ((a: T, z: T) => a === z);
  const selected = options.find(option => (typeof compare === 'function' ? compare(option.value, value) : (option.value as Record<string, unknown>)?.[compare] === (value as Record<string, unknown>)?.[compare]));
  return (
    <Field data-ui="select" disabled={disabled} className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && <Label className="text-sm font-medium text-text">{label}</Label>}
      <Listbox value={value} onChange={onChange} by={by as never} name={name} invalid={!!error}>
        <ListboxButton aria-label={rest['aria-label']} className={cn(fieldButton({ size, invalid: !!error, disabled }), 'group')}>
          {selected?.icon && <span className="flex shrink-0 items-center [&>svg]:size-4">{selected.icon}</span>}
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-placeholder')}>{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted group-data-open:text-text" aria-hidden />
        </ListboxButton>
        <ListboxOptions
          anchor={{ to: 'bottom start', gap: 6 }}
          transition
          className={cn(popoverPanel, 'max-h-72 overflow-y-auto p-1 [--anchor-max-height:18rem]', wide ? 'min-w-(--button-width)' : 'w-(--button-width)')}
        >
          {options.map((option, index) => (
            <ListboxOption key={index} value={option.value} disabled={option.disabled} className={optionRow}>
              {option.icon && <span className="flex shrink-0 items-center [&>svg]:size-4">{option.icon}</span>}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate group-data-selected/option:font-medium">{option.label}</span>
                {option.description && <span className="truncate text-xs text-muted">{option.description}</span>}
              </span>
              {option.aside && <span className="shrink-0 text-xs text-muted nums">{option.aside}</span>}
              <Check className="invisible size-4 shrink-0 text-accent group-data-selected/option:visible" aria-hidden />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
      {error ? (
        <Description className="flex items-start gap-1.5 text-xs leading-5 text-danger-text">
          <CircleAlert className="mt-[3px] size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </Description>
      ) : (
        hint && <Description className="text-xs leading-5 text-muted">{hint}</Description>
      )}
    </Field>
  );
}
