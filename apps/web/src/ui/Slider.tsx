import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from './cn.ts';

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  /** How a value reads, for the figure next to the label and for screen readers: 62 → "62%". */
  format?: (value: number) => string;
  /** Points under the track, as the current LTV or a liquidation threshold. */
  marks?: { value: number; label: ReactNode; tone?: 'default' | 'danger' | 'accent' }[];
  /** The colour of the filled part. */
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  /** Hide the figure on the right of the label, when a number field next to the slider already shows it. */
  hideValue?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
};

const TONE = { accent: 'var(--color-accent)', success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)' };
const MARK_TONE = { default: 'text-muted', danger: 'text-danger-text', accent: 'text-accent' };

// the thumb is 18px wide and its centre runs from 9px to (width - 9px)
const at = (fraction: number) => `calc(9px + (100% - 18px) * ${fraction})`;

type Mark = NonNullable<SliderProps['marks']>[number];

// Labels closer than this share of the width go on a second row, so "Now 77%" and "Liquidation" do not overlap.
const NEAR = 0.16;

function place(marks: Mark[], min: number, span: number) {
  const last = [-1, -1];
  return [...marks]
    .sort((a, z) => a.value - z.value)
    .map(mark => {
      const where = Math.min(Math.max((mark.value - min) / span, 0), 1);
      const row = where - last[0] >= NEAR || last[0] < 0 ? 0 : where - last[1] >= NEAR || last[1] < 0 ? 1 : 0;
      last[row] = where;
      return { mark, where, row };
    });
}

/** A native range input: arrows, Page Up and Down, Home and End move it. It shows the value it is given. */
export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, format = String, marks, tone = 'accent', hideValue = false, disabled, className, ...rest }: SliderProps) {
  const id = useId();
  const span = max - min || 1;
  const fraction = Math.min(Math.max((value - min) / span, 0), 1);
  const placed = place(marks ?? [], min, span);
  const rows = Math.max(0, ...placed.map(({ row }) => row + 1));
  return (
    <div data-ui="slider" className={cn('flex min-w-0 flex-col gap-2', className)}>
      {(label || !hideValue) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-text">
              {label}
            </label>
          )}
          {!hideValue && <span className="ml-auto text-sm font-medium text-text nums">{format(value)}</span>}
        </div>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={rest['aria-label']}
        aria-valuetext={format(value)}
        onChange={event => onChange(Number(event.target.value))}
        className="ui-range"
        style={{ '--fill': at(fraction), '--range-color': TONE[tone] } as CSSProperties}
      />
      {placed.length > 0 && (
        <div className="relative -mt-1" style={{ height: rows * 18 + 6 }} aria-hidden>
          {placed.map(({ mark, where, row }) => (
            <span key={mark.value} className={cn('absolute top-0', MARK_TONE[mark.tone ?? 'default'])} style={{ left: at(where) }}>
              <span className="absolute top-0 left-0 h-1.5 w-px bg-current opacity-70" />
              {/* centred under its point, or flush with the end of the track near either end */}
              <span
                className="absolute left-0 text-xs whitespace-nowrap nums"
                style={{ top: 6 + row * 18, transform: `translateX(${where < 0.06 ? '-9px' : where > 0.94 ? 'calc(-100% + 9px)' : '-50%'})` }}
              >
                {mark.label}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
