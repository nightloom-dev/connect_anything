import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from './cn.ts';
import { Tooltip } from './Tooltip.tsx';

export type StepState = 'done' | 'current' | 'upcoming' | 'locked';

export type StepItem = {
  id: string;
  title: string;
  state: StepState;
  /** Why it cannot be opened yet; shown in its tooltip. */
  reason?: string;
};

type StepperProps = {
  steps: StepItem[];
  /** Called for a done or upcoming step. Without it the stepper only shows where you are. */
  onSelect?: (id: string) => void;
  label?: string;
  className?: string;
};

const CIRCLE: Record<StepState, string> = {
  done: 'border-accent/40 bg-accent/8 text-accent',
  current: 'border-accent-solid bg-accent-solid text-white shadow-glow',
  upcoming: 'border-border-strong bg-surface text-muted',
  locked: 'border-border bg-surface text-muted',
};

const TITLE: Record<StepState, string> = { done: 'text-text', current: 'text-text font-semibold', upcoming: 'text-muted', locked: 'text-muted' };
const SPOKEN: Record<StepState, string> = { done: 'done', current: 'current step', upcoming: 'not started', locked: 'locked' };

/** Numbered steps in a row. The current one has aria-current="step"; a locked one stays focusable to tell why. */
export function Stepper({ steps, onSelect, label = 'Steps', className }: StepperProps) {
  const current = steps.findIndex(step => step.state === 'current');
  return (
    <nav data-ui="stepper" aria-label={label} className={className}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          const open = !!onSelect && (step.state === 'done' || step.state === 'upcoming');
          const button = (
            <button
              type="button"
              aria-current={step.state === 'current' ? 'step' : undefined}
              aria-disabled={!open || undefined}
              onClick={open ? () => onSelect?.(step.id) : undefined}
              className={cn('group flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-1 text-left', open ? 'cursor-pointer' : 'cursor-default', step.state === 'locked' && 'cursor-not-allowed')}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-120 nums',
                  CIRCLE[step.state],
                  open && 'group-hover:border-accent group-hover:text-text',
                )}
              >
                {step.state === 'done' ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : step.state === 'locked' ? <Lock className="size-3" aria-hidden /> : index + 1}
              </span>
              <span className={cn('truncate text-sm transition-colors duration-120 max-sm:sr-only', TITLE[step.state], open && 'group-hover:text-text')}>
                {step.title}
              </span>
              <span className="sr-only">, {SPOKEN[step.state]}</span>
            </button>
          );
          return (
            <li key={step.id} className={cn('flex min-w-0 items-center', !last && 'flex-1')}>
              {step.state === 'locked' && step.reason ? <Tooltip content={step.reason}>{button}</Tooltip> : button}
              {!last && (
                // the line to the next step fills from the left once this one is done, and empties if it is not any more
                <span aria-hidden className="relative mx-2 h-px min-w-4 flex-1 bg-border-strong sm:mx-3">
                  <span
                    className={cn(
                      'absolute inset-0 origin-left bg-accent transition-transform duration-600 ease-run motion-reduce:transition-none',
                      step.state === 'done' ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {current >= 0 && (
        <p className="mt-3 text-sm text-muted sm:hidden" aria-hidden>
          Step {current + 1} of {steps.length}: <span className="font-medium text-text">{steps[current].title}</span>
        </p>
      )}
    </nav>
  );
}
