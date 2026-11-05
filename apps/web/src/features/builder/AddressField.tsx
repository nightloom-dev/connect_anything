import { BookMarked, UserRound } from 'lucide-react';
import { AddressInput, IconButton, Popover, PopoverClose, cn, truncateMiddle } from '../../ui/index.ts';
import type { QuickPick } from './known.ts';

type AddressFieldProps = {
  /** The accessible name, as "Address of repay_accounts.obligation". */
  label: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** What "Use the intermediary" puts in: the stand-in key of whoever runs the recipe. */
  intermediary: string;
  /** Known addresses the name points at, shown as one-click chips under the field. */
  suggestions?: QuickPick[];
  /** Every known address, in a menu. */
  known: QuickPick[];
};

/** An address with the intermediary and the well-known programs and sysvars one click away. */
export function AddressField({ label, id, value, onChange, placeholder = 'Address', disabled = false, intermediary, suggestions = [], known }: AddressFieldProps) {
  const isIntermediary = value === intermediary;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <AddressInput id={id} aria-label={label} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
        </div>
        <IconButton
          label="Use the intermediary of whoever runs this"
          icon={<UserRound />}
          size="md"
          variant={isIntermediary ? 'soft' : 'secondary'}
          disabled={disabled}
          onClick={() => onChange(intermediary)}
        />
        <Popover
          label={`Known addresses for ${label}`}
          anchor="bottom end"
          panelClassName="w-80"
          trigger={<IconButton label="Known addresses" icon={<BookMarked />} size="md" variant="secondary" disabled={disabled} />}
        >
          <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted">Known addresses</p>
          <ul className="flex flex-col">
            {known.map(pick => (
              <li key={pick.address}>
                <PopoverClose
                  type="button"
                  onClick={() => onChange(pick.address)}
                  className={cn('flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/6', value === pick.address && 'bg-accent/10')}
                >
                  <span className="truncate text-text">{pick.label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{truncateMiddle(pick.address)}</span>
                </PopoverClose>
              </li>
            ))}
          </ul>
        </Popover>
      </div>
      {suggestions.length > 0 && !disabled && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Suggested:</span>
          {suggestions.map(pick => {
            const chosen = value === pick.address;
            return (
              <button
                key={pick.address}
                type="button"
                onClick={() => onChange(pick.address)}
                className={cn(
                  'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium transition-colors duration-120',
                  chosen ? 'border-accent/50 bg-accent/15 text-text' : 'border-border-strong bg-surface-2 text-muted hover:border-border-control hover:text-text',
                )}
              >
                {pick.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
