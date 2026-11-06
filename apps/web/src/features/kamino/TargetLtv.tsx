import { useId, useRef, type Ref } from 'react';
import { Input, Slider, TokenIcon, Tooltip, cn } from '../../ui/index.ts';
import type { Preset } from './presets.ts';
import { useSettled } from './simulate.ts';

export type { Preset } from './presets.ts';

type TargetLtvProps = {
  /** The field's text, as typed. */
  value: string;
  /** The one way the target changes: typing, the slider and the presets all call it with the text of a target. */
  onChange: (value: string) => void;
  /** The target as a fraction, or null while the text is not one. */
  fraction: number | null;
  /** Marked under the slider, as fractions. Leave out where an LTV means nothing, with no collateral. */
  now?: number;
  liquidation?: number;
  presets: Preset[];
  disabled?: boolean;
  /** The field, for the page to put the focus in it. */
  fieldRef?: Ref<HTMLInputElement>;
};

/** The target LTV: a field and a slider that show the same value, and presets that type one in. */
export function TargetLtv({ value, onChange, fraction, now, liquidation, presets, disabled, fieldRef }: TargetLtvProps) {
  const id = useId();
  const errorId = `${id}-error`;
  // while the text is not a target, the slider stays where the last one put it
  const last = useRef(fraction);
  if (fraction !== null) last.current = fraction;
  const shown = Math.round((fraction ?? last.current ?? 0) * 1000) / 10;
  const invalid = fraction === null;
  const tone = fraction === null || liquidation === undefined ? 'accent' : fraction >= liquidation ? 'danger' : fraction >= liquidation - 0.1 ? 'warning' : 'success';
  // the words only: the LTV bar above gives the figures, and on a phone a figure each would not fit side by side
  const marks = [
    ...(now !== undefined ? [{ value: now * 100, label: 'Now' }] : []),
    ...(liquidation !== undefined ? [{ value: liquidation * 100, label: 'Liquidation', tone: 'danger' as const }] : []),
  ];
  // a preset that comes to the same target as a later one says less than it, as Safer under 20%: Repay all
  const distinct = presets.filter((preset, index) => !presets.slice(index + 1).some(other => other.value === preset.value));

  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={id} className="text-base font-semibold text-text">
            Target LTV
          </h3>
          <p className="mt-0.5 text-sm text-muted">Where the repay brings the LTV, at today's prices.</p>
        </div>
        <div className="w-28 shrink-0">
          <Input
            ref={fieldRef}
            aria-label="Target LTV, %"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            disabled={disabled}
            onChange={event => onChange(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            trailing={<span className="pr-2 text-sm text-muted">%</span>}
            className="text-right text-base font-semibold nums"
          />
        </div>
      </div>
      <Slider aria-label="Target LTV" value={shown} onChange={next => onChange(String(next))} min={0} max={100} step={1} hideValue format={next => `${next}%`} tone={tone} marks={marks} disabled={disabled} />
      {invalid && (
        <p id={errorId} className="-mt-1 text-xs text-danger-text">
          Enter a target from 0 to 100.
        </p>
      )}
      <div role="group" aria-label="Presets" className="flex flex-wrap gap-2">
        {distinct.map(preset => {
          const pressed = value === preset.value;
          return (
            <Tooltip key={preset.label} content={preset.hint} disabled={disabled}>
              <button
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                onClick={() => onChange(preset.value)}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-50',
                  pressed ? 'border-accent/60 bg-accent/14 text-text' : 'border-border-strong bg-surface-2 text-text enabled:hover:border-border-control enabled:hover:bg-surface-3',
                )}
              >
                {preset.label}{' '}
                <span className={cn('nums', pressed ? 'text-accent-hover' : 'text-muted')}>{preset.value}%</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The amount the target works out to, in dollars and in the token repaid. The page's tests read it word for word.
 * A screen reader hears it once the target holds still, not at every step of the slider, which says its own value. It
 * reads the line it hears, which says the same as the one on the screen, so it does not read the amount twice.
 */
export function RepaySummary({ usd, amount, symbol }: { usd: string; amount: string; symbol: string }) {
  const heard = useSettled(`Amount to repay: ${usd}, ${amount} ${symbol}.`, 700);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/8 px-4 py-3 text-md leading-8 text-text">
      <p aria-hidden>
        Repay <strong className="text-lg font-semibold nums">{usd}</strong>, which is{' '}
        <strong className="text-lg font-semibold whitespace-nowrap nums">
          <TokenIcon symbol={symbol} size={18} className="mr-1.5 inline-block -translate-y-px align-middle" />
          {amount} {symbol}
        </strong>
        .
      </p>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {heard}
      </p>
    </div>
  );
}
