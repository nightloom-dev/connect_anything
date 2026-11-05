import type { ReactNode } from 'react';
import { Check, Minus, Pause, X } from 'lucide-react';
import { cn } from './cn.ts';
import { Spinner } from './Spinner.tsx';

/** paused: stopped where it is and waiting on the person, as an execution this page no longer follows. */
export type StageState = 'pending' | 'active' | 'paused' | 'done' | 'failed' | 'success' | 'cancelled';

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

const SPOKEN: Record<StageState, string> = { pending: 'waiting', active: 'in progress', paused: 'paused', done: 'done', failed: 'failed', success: 'complete', cancelled: 'cancelled' };

const NODE: Record<StageState, string> = {
  pending: 'border-border-strong bg-surface',
  active: 'border-accent bg-accent/14 text-accent shadow-[0_0_0_4px_rgb(110_123_255/0.14)]',
  paused: 'border-warning/50 bg-warning/14 text-warning',
  done: 'border-success/40 bg-success/12 text-success',
  failed: 'border-danger/50 bg-danger/14 text-danger-text',
  success: 'border-success bg-success text-[#062012]',
  cancelled: 'border-border-strong bg-surface-3 text-muted',
};

const TITLE: Record<StageState, string> = {
  pending: 'text-muted',
  active: 'text-text font-semibold',
  paused: 'text-warning font-semibold',
  done: 'text-text',
  failed: 'text-danger-text font-semibold',
  success: 'text-success font-semibold',
  cancelled: 'text-muted',
};

function Node({ state }: { state: StageState }) {
  if (state === 'active') return <Spinner size="xs" />;
  if (state === 'paused') return <Pause className="size-3" strokeWidth={2.75} aria-hidden />;
  if (state === 'done' || state === 'success') return <Check className="size-3.5" strokeWidth={2.75} aria-hidden />;
  if (state === 'failed') return <X className="size-3.5" strokeWidth={2.75} aria-hidden />;
  if (state === 'cancelled') return <Minus className="size-3.5" strokeWidth={2.75} aria-hidden />;
  return <span className="size-1.5 rounded-full bg-faint" aria-hidden />;
}

/** The stages of a run, top to bottom. A screen reader hears each change of stage once, politely. */
export function Timeline({ stages, label = 'Progress', announce, className }: TimelineProps) {
  const latest = [...stages].reverse().find(stage => stage.state !== 'pending');
  const spoken = announce ?? (latest ? `${latest.title}: ${SPOKEN[latest.state]}` : '');
  return (
    <div data-ui="timeline" className={className}>
      <ol aria-label={label} className="flex flex-col">
        {stages.map((stage, index) => {
          const last = index === stages.length - 1;
          const reached = stage.state === 'done' || stage.state === 'success';
          return (
            <li key={stage.id} aria-current={stage.state === 'active' || stage.state === 'paused' ? 'step' : undefined} className={cn('relative flex gap-3', !last && 'pb-5')}>
              {!last && <span aria-hidden className={cn('absolute top-7 bottom-0.5 left-[11.5px] w-px', reached ? 'bg-success/40' : 'bg-border-strong')} />}
              <span className={cn('relative flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300', NODE[stage.state])}>
                <Node state={stage.state} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn('text-sm leading-5', TITLE[stage.state])}>
                    {stage.title}
                    <span className="sr-only">, {SPOKEN[stage.state]}</span>
                  </span>
                  {stage.time && <span className="shrink-0 text-xs text-muted nums">{stage.time}</span>}
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
