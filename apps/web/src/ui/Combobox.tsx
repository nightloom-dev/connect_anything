import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, CircleAlert, Search } from 'lucide-react';
import { ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Description, Field, Combobox as HeadlessCombobox, Label } from '@headlessui/react';
import { cn } from './cn.ts';
import { FIELD_SIZE, type InputSize } from './Input.tsx';
import { popoverPanel } from './Popover.tsx';
import { optionRow } from './Select.tsx';

type ComboboxProps<T> = {
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly T[];
  /** A stable key: an instruction's name, an address. */
  getKey: (option: T) => string;
  /** What the field shows for the chosen option, and what the default filter searches. */
  getLabel: (option: T) => string;
  /** Whether an option matches what was typed. Default: the label contains it, ignoring case. */
  filter?: (option: T, query: string) => boolean;
  /** A whole row of the list; the default is the label. */
  renderOption?: (option: T, state: { selected: boolean }) => ReactNode;
  isDisabled?: (option: T) => boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  /** Shown when nothing matches. */
  empty?: ReactNode;
  size?: InputSize;
  disabled?: boolean;
  /** Open the list on focus, before anything is typed. */
  immediate?: boolean;
  'aria-label'?: string;
  className?: string;
};

const contains = (label: string, query: string) => label.toLowerCase().includes(query.trim().toLowerCase());

/** A field that filters a list as you type. Arrows move, Enter picks, Escape closes and restores the value. */
export function Combobox<T>({
  value,
  onChange,
  options,
  getKey,
  getLabel,
  filter,
  renderOption,
  isDisabled,
  label,
  hint,
  error,
  placeholder = 'Search…',
  empty = 'Nothing matches.',
  size = 'md',
  disabled,
  immediate = true,
  className,
  ...rest
}: ComboboxProps<T>) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => (query.trim() ? options.filter(option => (filter ? filter(option, query) : contains(getLabel(option), query))) : options),
    [options, query, filter, getLabel],
  );
  return (
    <Field data-ui="combobox" disabled={disabled} className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && <Label className="text-sm font-medium text-text">{label}</Label>}
      <HeadlessCombobox
        value={value}
        onChange={onChange}
        by={(a: T | null, z: T | null) => (a === null || z === null ? a === z : getKey(a) === getKey(z))}
        onClose={() => setQuery('')}
        immediate={immediate}
        invalid={!!error}
      >
        <div
          className={cn(
            'group relative flex w-full min-w-0 items-center gap-2 rounded-md border transition-[border-color,box-shadow] duration-120 ease-out',
            FIELD_SIZE[size],
            disabled
              ? 'cursor-not-allowed border-border-control bg-surface opacity-60'
              : error
                ? 'border-danger/70 bg-surface-2 has-[input:focus]:border-danger has-[input:focus]:shadow-[0_0_0_4px_rgb(255_92_108/0.18)]'
                : 'border-border-control bg-surface-2 [&:hover:not(:has(input:focus))]:border-[#4a5468] has-[input:focus]:border-accent has-[input:focus]:shadow-glow',
          )}
        >
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <ComboboxInput
            aria-label={rest['aria-label']}
            placeholder={placeholder}
            displayValue={(option: T | null) => (option ? getLabel(option) : '')}
            onChange={event => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-placeholder disabled:cursor-not-allowed"
          />
          <ComboboxButton className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:text-text" aria-label="Show all">
            <ChevronsUpDown className="size-4" aria-hidden />
          </ComboboxButton>
        </div>
        <ComboboxOptions
          anchor={{ to: 'bottom start', gap: 6 }}
          transition
          className={cn(popoverPanel, 'max-h-80 w-(--input-width) min-w-72 overflow-y-auto p-1 empty:invisible')}
        >
          {shown.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted">{empty}</div>
          ) : (
            shown.map(option => (
              <ComboboxOption key={getKey(option)} value={option} disabled={isDisabled?.(option)} className={optionRow}>
                {({ selected }) => (
                  <>
                    <span className="min-w-0 flex-1">{renderOption ? renderOption(option, { selected }) : <span className="block truncate">{getLabel(option)}</span>}</span>
                    {selected && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
                  </>
                )}
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </HeadlessCombobox>
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
