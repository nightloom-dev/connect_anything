import { useEffect, useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ArrowDown, ArrowUpRight, ChevronDown, CircleCheck, CircleMinus, HandCoins, Info, OctagonAlert, TriangleAlert, Wallet } from 'lucide-react';
import { BACKEND_PLACEHOLDERS, type ExecutionStep } from '@aurora-is-near/intents-connect';
import type { UseExecutionResult } from '@aurora-is-near/intents-connect/react';
import { Address, Card, ChainIcon, Spinner, TokenIcon, cn, toast } from '../../ui/index.ts';

// The run card's presentational parts. Each takes ready values and works nothing out: the conditions, the figures and the
// money stay in execute.tsx, which composes these, and the /dev/states gallery composes them the same way on fake values.

/** The card itself. */
export function RunCard({ children, className }: { children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <Card as="section" elevated padding="none" aria-labelledby={id} className={cn('min-w-0', className)}>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <h3 id={id} className="text-base leading-6 font-semibold text-text">
          Pay and run
        </h3>
        {children}
      </div>
    </Card>
  );
}

type PanelProps = {
  /** "You pay", "You get". */
  label: ReactNode;
  /** The field the label names. */
  htmlFor?: string;
  /** Top right: the chain. */
  aside?: ReactNode;
  children: ReactNode;
  /** Under an edge: whose wallet, where it goes. */
  footer?: ReactNode;
  /** Nothing can happen yet, as before a wallet connects. */
  idle?: boolean;
};

/** One side of the swap: From or To. */
export function Panel({ label, htmlFor, aside, children, footer, idle = false }: PanelProps) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div
      data-idle={idle || undefined}
      className="group/panel min-w-0 rounded-lg border border-border bg-surface-2/55 transition-colors duration-120 has-[input:focus-visible]:border-accent/70 has-[input:focus-visible]:bg-surface-2"
    >
      <div className="flex min-h-9 items-center justify-between gap-3 px-3.5 pt-2.5">
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted">
          {label}
        </Label>
        {aside}
      </div>
      <div className="flex min-h-13 min-w-0 items-center gap-3 px-3.5 pt-1 pb-3 group-data-idle/panel:opacity-60">{children}</div>
      {footer && <div className="flex min-w-0 flex-col gap-1.5 border-t border-border/70 px-3.5 py-2.5 text-xs leading-5 text-muted">{footer}</div>}
    </div>
  );
}

/**
 * Whose wallet pays. The whole address is the text, for a screen reader and a search of the page, and on a narrow screen
 * its middle gives way to an ellipsis, so that the last characters a person checks stay in sight.
 */
export function PaidFrom({ address, children }: { address?: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="flex min-w-0 items-baseline gap-1">
        <span className="shrink-0">From </span>
        {address && (
          <span title={address} className="flex min-w-0 font-mono text-[0.8125rem] leading-5 tracking-tight text-text">
            <span className="truncate">{address.slice(0, -4)}</span>
            <span className="shrink-0">{address.slice(-4)}</span>
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

/** From, the arrow and To, close together. */
export function Swap({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1">{children}</div>;
}

/** Between From and To, over both edges. */
export function PanelArrow() {
  return (
    <div aria-hidden className="relative z-10 -my-4 flex justify-center">
      <span className="flex size-8 items-center justify-center rounded-lg border border-border-strong bg-surface text-muted shadow-card">
        <ArrowDown className="size-4" strokeWidth={2.25} />
      </span>
    </div>
  );
}

const TAG = 'inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-3/40 pr-3 pl-1.5 text-sm font-medium text-text';

/** The token of the To side, which nobody picks: the recipe names it. A screen reader has it from the figure's sentence. */
export function TokenTag({ symbol }: { symbol: string }) {
  return (
    <span aria-hidden className={TAG}>
      <TokenIcon symbol={symbol} size={22} />
      {symbol}
    </span>
  );
}

/** The chain of the To side: always Solana. */
export function ChainTag({ chain, name }: { chain: string; name: string }) {
  return (
    <span className={cn(TAG, 'h-8')}>
      <ChainIcon chain={chain} size={18} />
      {name}
    </span>
  );
}

/** The amount, large: an input of the From panel. */
export const AMOUNT_INPUT =
  'w-full min-w-0 flex-1 bg-transparent text-[1.75rem] leading-9 font-semibold tracking-tight text-text nums outline-none placeholder:text-faint focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted';

type SelectPillProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> & {
  /** The accessible name, as "Chain". */
  label: string;
  /** What the pill shows: an icon and the chosen option's short name. */
  display: ReactNode;
  /** Lower, for the chain in the panel's top row. */
  compact?: boolean;
  className?: string;
};

/** A native select, for the keyboard, the screen reader and the phone's own picker, drawn as a pill. */
export function SelectPill({ label, display, compact = false, className, ...select }: SelectPillProps) {
  const id = useId();
  return (
    <span
      className={cn(
        'relative inline-flex max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface-3/70 pr-2.5 pl-1.5 text-sm font-medium text-text transition-colors duration-120',
        compact ? 'h-8' : 'h-9',
        // the words of a pill that waits stay readable: only its icon fades
        'hover:border-border-control has-[select:disabled]:text-muted has-[select:disabled]:hover:border-border-strong has-[select:disabled]:[&_img]:opacity-55',
        'has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent',
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="flex min-w-0 items-center gap-1.5 truncate">{display}</span>
      <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted" />
      <select id={id} {...select} className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed" />
    </span>
  );
}

const share = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

/**
 * What arrives, at least: one sentence for the page's text and a screen reader, "at least 776.16 USDC, after the bridge's
 * fee and slippage: the bridge keeps 3% of what you pay", drawn as the figure over two short lines.
 */
export function Arrives({ amount, symbol, kept }: { amount: ReactNode; symbol: ReactNode; kept: number | null }) {
  // a bridge between two stablecoins keeps well under a percent, so more is worth a look before signing
  const notable = kept !== null && kept >= 0.01;
  return (
    <p className="flex min-w-0 flex-col">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="text-xs font-medium text-muted">at least</span>{' '}
        <span className="text-[1.75rem] leading-9 font-semibold tracking-tight break-all text-text nums">{amount}</span>
        {/* the token's tag beside the figure shows it */}
        <span className="sr-only"> {symbol}</span>
      </span>
      <span className="sr-only">,</span>
      <span className="block text-xs text-muted first-letter:uppercase"> after the bridge's fee and slippage</span>
      {kept !== null && (
        <>
          <span className="sr-only">:</span>
          <span className={cn('mt-0.5 flex items-center gap-1 text-xs', notable ? 'font-medium text-warning' : 'text-muted')}>
            {notable && <TriangleAlert aria-hidden className="size-3.5 shrink-0" />}
            <span className="first-letter:uppercase"> the bridge keeps {share.format(kept)} of what you pay</span>
          </span>
        </>
      )}
    </p>
  );
}

/** Nothing quoted yet: the place of the figure, without a figure. */
export function NoFigure() {
  return (
    <span aria-hidden className="text-[1.75rem] leading-9 font-semibold tracking-tight text-faint">
      –
    </span>
  );
}

/** The figures of a quote, a FigureRow each: the rows of this card and those an `outcome` adds, as a Kamino repay does. */
export function Figures({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('flex min-w-0 flex-col gap-2.5 text-sm', className)}>{children}</dl>;
}

/**
 * One row of Figures: the term on the left and its figure on the right. Each row is sized on its own, so a long term does
 * not narrow the others, and on a narrow card a figure that does not fit beside its term goes under it, still on the
 * right. A note runs under both, small and from the left.
 */
export function FigureRow({ term, children, note, total = false }: { term: ReactNode; children: ReactNode; note?: ReactNode; total?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1', total && 'mt-1 border-t border-border-strong pt-3')}>
      <dt className={cn('min-w-0', total ? 'font-medium text-text' : 'text-muted')}>{term}</dt>
      <dd className={cn('ml-auto min-w-0 text-right text-pretty break-words text-text nums', total ? 'text-base font-semibold' : 'font-medium')}>{children}</dd>
      {note && <dd className="basis-full text-xs leading-5 text-muted">{note}</dd>}
    </div>
  );
}

/** The last row of a quote: what the recipe spends, or without a figure, that its amounts are written into it. */
export function SpendsRow({ figure }: { figure?: ReactNode }) {
  return figure !== undefined ? (
    <FigureRow term="The recipe spends" total>
      {figure}
    </FigureRow>
  ) : (
    <div className="mt-1 flex flex-col gap-1 border-t border-border-strong pt-3">
      <dt className="font-medium text-text">Amounts</dt>
      <dd className="text-xs text-muted">Fixed in the recipe's instructions and listed under What will run, whatever you pay here. What they do not spend stays with your intermediary.</dd>
    </div>
  );
}

type FigureProps = {
  value: ReactNode;
  /** Said after the figure in the same sentence, drawn under it: ", plus the gas of the deposit". */
  note?: ReactNode;
  /** What joins the note to the figure in that sentence. */
  joint?: string;
};

/** A figure with what it means: one sentence for the page's text, the figure over a quiet line on the screen. */
export function Figure({ value, note, joint = ',' }: FigureProps) {
  return (
    <>
      <span className="block">{value}</span>
      {note && (
        <>
          <span className="sr-only">{joint}</span>
          <span className="block text-xs font-normal text-muted first-letter:uppercase"> {note}</span>
        </>
      )}
    </>
  );
}

/** A quote's figures, with what to do about them. */
export function QuoteBox({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2/30 px-3.5 pt-2.5 pb-3.5">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

export type Tone = 'muted' | 'warning' | 'danger';

const TONE: Record<Tone, { text: string; Icon: typeof Info }> = {
  muted: { text: 'text-muted', Icon: Info },
  warning: { text: 'text-warning', Icon: TriangleAlert },
  danger: { text: 'text-danger-text', Icon: OctagonAlert },
};

/** Why the button above does nothing yet, in the words the page has always used. */
export function Reason({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  const { text, Icon } = TONE[tone];
  return (
    <p className={cn('flex items-start gap-2 text-sm leading-5', text)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A quiet line with an icon. */
export function Caption({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-xs leading-5 text-muted', className)}>
      {icon && (
        <span aria-hidden className="mt-0.5 flex size-3.5 shrink-0 [&>svg]:size-full">
          {icon}
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The consent of a shared recipe, marked until it is given, right above the button it opens. */
export function ConsentBox({ given, children }: { given: boolean; children: ReactNode }) {
  return <div className={cn('rounded-lg border px-3.5 py-3 transition-colors duration-200', given ? 'border-border bg-surface-2/40' : 'border-warning/45 bg-warning/[0.07]')}>{children}</div>;
}

export function WorkingLine() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <Spinner size="sm" />
      Working…
    </p>
  );
}

/** That an execution was deleted, here and in a toast. */
export function DeletedLine({ id }: { id: string }) {
  useEffect(() => {
    toast.success('Execution deleted', { id: `deleted-${id}` });
  }, [id]);
  return (
    <div role="status" className="flex items-start gap-2 text-sm text-muted">
      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      <p className="min-w-0 break-words">
        Execution <code className="font-mono text-[0.8125rem] break-all text-text">{id}</code> was deleted, so a new run can start.
      </p>
    </div>
  );
}

/** A transaction in an explorer, in a new tab. */
export function ExplorerLink({ href, label, explorer }: { href: string; label: ReactNode; explorer: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-xs font-mono text-[0.8125rem] tracking-tight text-accent underline decoration-accent/40 underline-offset-[3px] transition-colors hover:text-accent-hover hover:decoration-current"
    >
      {label}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> on {explorer}, opens in a new tab</span>
    </a>
  );
}

type Phase = UseExecutionResult['phase'];

const WALLET_PHASES: Phase[] = ['awaiting-signature', 'awaiting-deposit'];

/** Time since `since`, m:ss or h:mm:ss, every second. */
export function Elapsed({ since }: { since?: string }) {
  const [start] = useState(() => {
    const at = since ? Date.parse(since) : NaN;
    return Number.isFinite(at) ? at : Date.now();
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const two = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  return <span className="nums">{hours ? `${hours}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}` : `${Math.floor(seconds / 60)}:${two(seconds % 60)}`}</span>;
}

type PhaseCalloutProps = {
  phase: Phase;
  /** The phase's own words, said by a screen reader as they change. */
  text: string;
  /** When the execution was created, for the time of a long wait. */
  since?: string;
};

/** What happens now, above the stages: the wallet to check, the wait, or the end. */
export function PhaseCallout({ phase, text, since }: PhaseCalloutProps) {
  const wallet = WALLET_PHASES.includes(phase);
  const box =
    phase === 'success'
      ? 'border-success/32 bg-success/10'
      : phase === 'expired'
        ? 'border-warning/32 bg-warning/10'
        : phase === 'cancelled'
          ? 'border-border-strong bg-surface-2/60'
          : 'border-accent/30 bg-accent/[0.08]';
  return (
    <div data-phase={phase} className={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3', box)}>
      {wallet ? (
        <span aria-hidden className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-accent-hover">
          <span className="absolute inset-0 animate-ping rounded-full border border-accent/40 [animation-duration:1.8s] motion-reduce:hidden" />
          <Wallet className="size-5" />
        </span>
      ) : (
        <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          {phase === 'success' ? (
            <CircleCheck className="size-5 text-success" />
          ) : phase === 'expired' ? (
            <TriangleAlert className="size-5 text-warning" />
          ) : phase === 'cancelled' ? (
            <CircleMinus className="size-5 text-muted" />
          ) : (
            <Spinner size="md" className="text-accent" />
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div role="status" className="text-sm leading-5 text-text">
          {wallet && <p className="font-semibold">Check your wallet</p>}
          <p className={cn(wallet && 'mt-0.5 text-text/85')}>{text}</p>
        </div>
        {phase === 'settling' && (
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Running for <Elapsed since={since} />. You can close this page: come back and press Resume.
          </p>
        )}
      </div>
    </div>
  );
}

/** The raw status and the id, for whoever asks for help with it. */
export function MetaLine({ children }: { children: ReactNode }) {
  return <p className="min-w-0 text-xs leading-5 break-words text-muted [&_code]:font-mono [&_code]:break-all [&_code]:text-text/80">{children}</p>;
}

/** An execution this page did not just create, with what can be done about it. */
export function ExistingFrame({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border-strong bg-surface-2/50 p-3.5">
      <div className="text-sm leading-5 font-medium text-text [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:break-all [&_code]:text-accent-hover">{title}</div>
      {children}
    </div>
  );
}

/** Label and value, values left: for statuses and addresses rather than amounts. */
export function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid min-w-0 grid-cols-[fit-content(38%)_minmax(0,1fr)] gap-y-2 text-sm [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:break-all [&>dd]:min-w-0 [&>dd]:break-words [&>dd]:text-text [&>dt]:pr-4 [&>dt]:text-muted">
      {children}
    </dl>
  );
}

/** A native details: open by a prop as the page decides, and by hand. */
export function Details({ open, summary, children, className }: { open?: boolean; summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details open={open} className={cn('group/details min-w-0 rounded-lg border border-border bg-surface', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium text-text transition-colors duration-120 select-none hover:bg-white/3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform duration-200 group-open/details:rotate-180" />
      </summary>
      <div className="border-t border-border px-3.5 py-3">{children}</div>
    </details>
  );
}

/** For a Button whose label runs long, as "Delete it (a signature that moves no money)": it wraps on a narrow screen. */
export const LONG_LABEL = 'h-auto! min-h-8 max-w-full shrink! py-1.5 leading-5 whitespace-normal!';

/** A row of buttons. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A way out of a failed run: what it does, and the button that asks for its figures. */
export function OptionTile({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface-2/40 p-3.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-3 text-muted [&>svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted">{children}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** A deposit this page waits for, which can come from any wallet. */
export function DepositBox({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div role="status" className="flex min-w-0 flex-col gap-3 rounded-lg border border-info/32 bg-info/[0.08] p-3.5 text-sm leading-relaxed text-text/90">
      <p className="flex items-center gap-2 font-semibold text-text">
        <Spinner size="sm" className="text-info" />
        Waiting for your deposit
      </p>
      <div className="min-w-0 break-words [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:break-all [&_code]:text-text">{children}</div>
      <Actions>{actions}</Actions>
    </div>
  );
}

/** A part of the card under a rule: the run's progress, the way out of a failed one. */
export function Block({ children, tight = false }: { children: ReactNode; tight?: boolean }) {
  return <div className={cn('flex min-w-0 flex-col border-t border-border pt-4', tight ? 'gap-3' : 'gap-4')}>{children}</div>;
}

/** What the intermediary holds, as a figure: "Your intermediary holds 0.51 USDC." */
export function Held({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-3 text-muted">
        <HandCoins className="size-4" />
      </span>
      <p className="text-sm text-text [&>strong]:font-semibold [&>strong]:nums">
        Your intermediary holds <strong>{children}</strong>.
      </p>
    </div>
  );
}

/** The steps of an execution as Connect lists them: program, data, arguments and accounts, the intermediary marked. */
export function ExecutionSteps({ steps, intermediary }: { steps: ExecutionStep[]; intermediary?: string | null }) {
  return (
    <ol className="flex flex-col gap-3 text-xs leading-5 [&_code]:font-mono [&_code]:break-all [&_code]:text-text">
      {steps.map((step, index) => (
        <li key={index} className="flex min-w-0 flex-col gap-1.5">
          {'programId' in step ? (
            <>
              <Address value={step.programId} full />
              <div className="text-muted">
                Data: <code>{step.discriminator}</code>
              </div>
              {step.args?.length > 0 && <pre className="rounded-md border border-border bg-bg/70 px-3 py-2 font-mono whitespace-pre-wrap text-text [overflow-wrap:anywhere]">{JSON.stringify(step.args, null, 2)}</pre>}
              <ul className="flex flex-col gap-1 border-l border-border pl-3">
                {step.accounts?.map(({ pubkey }, at) => (
                  <li key={at} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    {pubkey === BACKEND_PLACEHOLDERS.intermediary ? <code>{pubkey}</code> : <Address value={pubkey} full />}{' '}
                    {(pubkey === BACKEND_PLACEHOLDERS.intermediary || pubkey === intermediary) && (
                      <em className="rounded-full border border-accent/36 bg-accent/14 px-2 text-xs leading-5 font-medium text-accent-hover not-italic">your intermediary</em>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <pre className="rounded-md border border-border bg-bg/70 px-3 py-2 font-mono whitespace-pre-wrap text-text [overflow-wrap:anywhere]">{JSON.stringify(step, null, 2)}</pre>
          )}
        </li>
      ))}
    </ol>
  );
}
