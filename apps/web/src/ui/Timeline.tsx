import type { ReactNode } from 'react';
import { Check, Minus, Pause, X } from 'lucide-react';
import { cn } from './cn.ts';
import { Spinner } from './Spinner.tsx';

/**
 * paused: stopped where it is and waiting on the person, as an execution this page no longer follows.
 * unreached: the run ended before it, with a failure or a cancel, so it never comes.
 * skipped: not part of this kind of run at all, as a deposit for a run that spends what is already there.
 */
export type StageState = 'pending' | 'active' | 'paused' | 'done' | 'failed' | 'success' | 'cancelled' | 'unreached' | 'skipped';

export type TimelineStage = {
  id: string;
  title: string;
  state: StageState;
  /** One short line: what happens now, or what happened. */
  description?: ReactNode;
  /** When it started or how long it took, already formatted. */
  time?: ReactNode;
  /** A TxLink, or any link to what this stage produced. */
  link?: ReactNode;
};

type TimelineProps = {
  stages: TimelineStage[];
  label?: string;
  /** What the polite live region says. Default: the title and state of the latest stage that is not pending. */
  announce?: string;
  className?: string;
};

const SPOKEN: Record<StageState, string> = {
  pending: 'waiting',
  active: 'in progress',
  paused: 'paused',
  done: 'done',
  failed: 'failed',
  success: 'complete',
  cancelled: 'cancelled',
  unreached: 'not reached',
  skipped: 'not needed',
};

/** The states a run never goes through: drawn dashed, and named on the right. */
const NEVER: Partial<Record<StageState, string>> = { unreached: 'Not reached', skipped: 'Not needed' };

/** The states of a stage the run has come to: the line into it is drawn in. */
const ARRIVED = new Set<StageState>(['active', 'paused', 'done', 'failed', 'success', 'cancelled']);

const NODE: Record<StageState, string> = {
  pending: 'border-border-strong bg-surface',
  active: 'border-accent bg-accent/8 text-accent shadow-glow',
  paused: 'border-warning/50 bg-warning/14 text-warning',
  done: 'border-success/40 bg-success/12 text-success',
  failed: 'border-danger/50 bg-danger/14 text-danger-text',
  success: 'border-success bg-success text-white',
  cancelled: 'border-border-strong bg-surface-3 text-muted',
  unreached: 'border-dashed border-border-strong',
  skipped: 'border-dashed border-border-strong',
};

const TITLE: Record<StageState, string> = {
  pending: 'text-muted',
  active: 'text-text font-semibold',
  paused: 'text-warning font-semibold',
  done: 'text-text',
  failed: 'text-danger-text font-semibold',
  success: 'text-success font-semibold',
  cancelled: 'text-muted',
  unreached: 'text-muted',
  skipped: 'text-muted',
};

function Node({ state }: { state: StageState }) {
  if (state === 'active') return <Spinner size="xs" />;
  if (state === 'paused') return <Pause className="size-3" strokeWidth={2.75} aria-hidden />;
  if (state === 'done' || state === 'success') return <Check className="size-3.5" strokeWidth={2.75} aria-hidden />;
  if (state === 'failed') return <X className="size-3.5" strokeWidth={2.75} aria-hidden />;
  if (state === 'cancelled') return <Minus className="size-3.5" strokeWidth={2.75} aria-hidden />;
  if (NEVER[state]) return null;
  return <span className="size-1.5 rounded-full bg-faint" aria-hidden />;
}

/** The stages of a run, top to bottom. A screen reader hears each change of stage once, politely. */
export function Timeline({ stages, label = 'Progress', announce, className }: TimelineProps) {
  const latest = [...stages].reverse().find(stage => stage.state !== 'pending' && !NEVER[stage.state]);
  const spoken = announce ?? (latest ? `${latest.title}: ${SPOKEN[latest.state]}` : '');
  return (
    <div data-ui="timeline" className={className}>
      <ol aria-label={label} className="flex flex-col">
        {stages.map((stage, index) => {
          const next = stages[index + 1];
          // the way to a stage the run never goes through is dashed, like its node, and stays empty
          const never = !!next && !!NEVER[next.state];
          const filled = !!next && !never && (stage.state === 'done' || stage.state === 'success' || ARRIVED.has(next.state));
          return (
            <li key={stage.id} aria-current={stage.state === 'active' || stage.state === 'paused' ? 'step' : undefined} className={cn('relative flex gap-3', next && 'pb-5')}>
              {next && (
                // the line to the next stage: cobalt runs down it once the run gets there, and a bead while this one works
                <span aria-hidden className="absolute top-7 bottom-0.5 left-[9px] w-1.5 overflow-hidden">
                  <span className={cn('absolute inset-y-0 left-[2.5px] w-px', never ? 'border-l border-dashed border-border-strong' : 'bg-border-strong')} />
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0.5 w-0.5 origin-top bg-accent transition-transform duration-600 ease-run motion-reduce:transition-none',
                      filled ? 'scale-y-100' : 'scale-y-0',
                    )}
                  />
                  {stage.state === 'active' && !never && (
                    <span className="absolute inset-0 animate-run-bead motion-reduce:hidden">
                      <span className="absolute top-0 left-0 size-1.5 rounded-full bg-accent" />
                    </span>
                  )}
                </span>
              )}
              <span className={cn('relative flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-320', NODE[stage.state])}>
                <Node state={stage.state} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn('text-sm leading-5', TITLE[stage.state])}>
                    {stage.title}
                    <span className="sr-only">, {SPOKEN[stage.state]}</span>
                  </span>
                  {stage.time && <span className="shrink-0 text-xs text-muted nums">{stage.time}</span>}
                  {/* the title already says it to a screen reader */}
                  {NEVER[stage.state] && !stage.time && (
                    <span aria-hidden className="shrink-0 text-xs text-muted">
                      {NEVER[stage.state]}
                    </span>
                  )}
                </div>
                {stage.description && <div className={cn('mt-0.5 text-xs leading-5', stage.state === 'failed' ? 'text-danger-text/90' : 'text-muted')}>{stage.description}</div>}
                {stage.link && <div className="mt-1 text-xs">{stage.link}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite" aria-atomic>
        {spoken}
      </p>
    </div>
  );
}
