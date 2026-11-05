import { forwardRef, type ReactNode } from 'react';
import { toAtomic } from '../connect.ts';
import { cn } from './cn.ts';
import { Input, type InputProps } from './Input.tsx';
import { TokenIcon } from './TokenIcon.tsx';

/** Why a typed amount is not one of this token, or null when it is one or is empty. toAtomic has the last word. */
export function amountProblem(value: string, symbol: string, decimals: number): string | null {
  const text = value.trim();
  if (!text) return null;
  const parts = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!parts || !(parts[1] || parts[2])) return 'Enter a number, like 1.5.';
  if ((parts[2] ?? '').length > decimals) return decimals === 0 ? `${symbol} has no decimals.` : `${symbol} has ${decimals} decimals, so at most ${decimals} digits after the point.`;
  return toAtomic(text, decimals) === null ? 'Enter an amount above zero.' : null;
}

export type AmountInputProps = Omit<InputProps, 'value' | 'onChange' | 'trailing' | 'inputMode' | 'type' | 'aside'> & {
  /** As typed, a decimal with a point. */
  value: string;
  onChange: (value: string) => void;
  symbol: string;
  decimals: number;
  /** The token's icon before the symbol; TokenIcon of the symbol by default, false for none. */
  icon?: ReactNode | false;
  /** What the wallet holds, already formatted: "12.5". */
  balance?: ReactNode;
  /** Fills in the most that can be paid. The caller works out the figure. */
  onMax?: () => void;
  /** An error from outside, shown in place of the check's. */
  error?: ReactNode;
};

/** A decimal keyboard on phones, a comma read as a point, nothing but digits and one point accepted. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onChange, symbol, decimals, icon, balance, onMax, error, size = 'md', disabled, placeholder = '0.00', className, ...rest },
  ref,
) {
  const problem = amountProblem(value, symbol, decimals);
  const aside =
    balance !== undefined || onMax ? (
      <span className="inline-flex items-center gap-2">
        {balance !== undefined && (
          <span>
            Balance{' '}
            <span className="nums text-text">
              {balance} {symbol}
            </span>
          </span>
        )}
        {onMax && (
          <button
            type="button"
            data-ui="button"
            disabled={disabled}
            onClick={onMax}
            className="rounded-sm px-1 font-semibold text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:text-faint"
          >
            Max
          </button>
        )}
      </span>
    ) : undefined;

  return (
    <Input
      {...rest}
      ref={ref}
      size={size}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      disabled={disabled}
      value={value}
      aside={aside}
      error={error ?? problem ?? undefined}
      className={cn('nums', size === 'lg' && 'text-xl font-medium', className)}
      onChange={event => {
        const next = event.target.value.replace(',', '.').replace(/\s/g, '');
        if (/^\d*\.?\d*$/.test(next)) onChange(next);
      }}
      trailing={
        <span className={cn('flex items-center gap-1.5 pr-1 font-medium text-muted', size === 'lg' ? 'text-base' : 'text-sm')}>
          {icon !== false && (icon ?? <TokenIcon symbol={symbol} size={size === 'lg' ? 20 : 16} />)}
          {symbol}
        </span>
      }
    />
  );
});
