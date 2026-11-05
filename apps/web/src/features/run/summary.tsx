import type { ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, ListOrdered, LoaderCircle, ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import type { StoredRecipe, buildRecipe } from '../../recipe.ts';
import { AccountList, short } from '../../ui.tsx';
import { Address, cn } from '../../ui/index.ts';

// What a recipe runs, and on a shared link who stands behind it. Presentational: execute.tsx builds the steps and checks
// each program's published IDL, and passes the results in.

const SOLSCAN = 'https://solscan.io';

/** An account on Solscan, in a new tab: the whole address, since it is what a reader checks. */
function ProgramLink({ program }: { program: string }) {
  return (
    <a
      href={`${SOLSCAN}/account/${program}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-start gap-1 rounded-xs font-mono text-[0.8125rem] leading-5 tracking-tight break-all text-accent underline decoration-accent/40 underline-offset-[3px] transition-colors hover:text-accent-hover hover:decoration-current"
    >
      <span className="min-w-0 text-balance">{program}</span>
      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> on Solscan, opens in a new tab</span>
    </a>
  );
}

export type IdlState = 'checking' | 'unknown' | 'match' | 'differs';

const CHECK: Record<IdlState, { text: string; tone: string; Icon: typeof ShieldCheck }> = {
  checking: { text: "checking the program's published IDL…", tone: 'text-muted', Icon: LoaderCircle },
  unknown: {
    text: 'could not be compared with an IDL the program publishes, so the names below are only the word of whoever made the link',
    tone: 'text-warning',
    Icon: ShieldQuestion,
  },
  match: { text: 'matches the IDL the program publishes', tone: 'text-success', Icon: ShieldCheck },
  differs: { text: 'differs from the IDL the program publishes: do not trust the names below', tone: 'text-danger-text', Icon: ShieldX },
};

/** Whether the IDL a shared recipe carries is the one its program publishes. */
export function IdlCheck({ state }: { state: IdlState }) {
  const { text, tone, Icon } = CHECK[state];
  return (
    <p aria-live="polite" className={cn('flex items-start gap-1.5 text-xs leading-5', tone, state !== 'checking' && 'font-medium')}>
      <Icon aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', state === 'checking' && 'animate-spin')} />
      <span className="min-w-0 first-letter:uppercase">{text}</span>
    </p>
  );
}

type TrustPanelProps = {
  stored: StoredRecipe;
  /** How many instructions run. */
  instructions: number;
  /** The published-IDL check of one program. */
  check: (program: string) => ReactNode;
};

/** On a shared link: who made the recipe, and what a reader can check before trusting it. */
export function TrustPanel({ stored, instructions, check }: TrustPanelProps) {
  const programs = [...new Set(stored.steps.map(({ program }) => program))];
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-warning/35 bg-warning/[0.06]">
      <div role="status" className="flex gap-3 px-4 py-3.5 text-sm leading-relaxed">
        <ShieldAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-warning" strokeWidth={2.1} />
        <div className="min-w-0">
          <p className="font-semibold text-text">This recipe was made by whoever shared this link, not by Connect Anything.</p>
          <p className="mt-1 text-text/80">
            Nobody has checked it. If you run it you pay from your own wallet, and the instructions below run on Solana with your intermediary as the signer, so they can move whatever your
            intermediary holds. Run it only if you trust the person who sent you the link and you understand what is listed here.
          </p>
        </div>
      </div>
      <div className="border-t border-warning/20 bg-surface/70 px-4 py-3.5">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">What you can check</h3>
        <ul className="mt-3 flex flex-col gap-3.5">
          {programs.map(program => (
            <li key={program} className="flex min-w-0 flex-col gap-1">
              <ProgramLink program={program} />
              {stored.idls[program].metadata?.name && <span className="text-xs text-muted">calls itself {stored.idls[program].metadata.name}</span>}
              {check(program)}
            </li>
          ))}
          <li className="flex items-start gap-1.5 text-xs leading-5 text-muted">
            <ListOrdered aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {instructions} {instructions === 1 ? 'instruction' : 'instructions'} on {programs.length} {programs.length === 1 ? 'program' : 'programs'}, each listed below with its accounts.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

type SummaryProps = {
  stored: StoredRecipe;
  steps: ReturnType<typeof buildRecipe>;
  intermediary: string;
  real: boolean;
  amountKnown: boolean;
  shared: boolean;
  /** Open from the start: by default only on a shared link. */
  open?: boolean;
};

const H4 = 'text-xs font-medium tracking-wide text-muted uppercase';

/** What will run: the programs, then each instruction with its arguments, data and accounts. Open from the start on a shared link. */
export function Summary({ stored, steps, intermediary, real, amountKnown, shared, open = shared }: SummaryProps) {
  const programs = [...new Set(stored.steps.map(({ program }) => program))];
  return (
    <details open={open} className="group/summary min-w-0 rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-text transition-colors duration-120 select-none hover:bg-white/3 [&::-webkit-details-marker]:hidden">
        <ListOrdered aria-hidden className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          What will run: {steps.length} {steps.length === 1 ? 'instruction' : 'instructions'} on {programs.length} {programs.length === 1 ? 'program' : 'programs'}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform duration-200 group-open/summary:rotate-180" />
      </summary>
      <div className="flex min-w-0 flex-col gap-5 border-t border-border px-4 pt-4 pb-5">
        {/* on a shared link the panel above lists the programs, with their checks */}
        {!shared && (
          <section className="flex flex-col gap-2.5">
            <h4 className={H4}>{programs.length === 1 ? 'Program' : 'Programs'}</h4>
            <ul className="flex flex-col gap-2">
              {programs.map(program => (
                <li key={program} className="flex min-w-0 flex-col gap-0.5">
                  <ProgramLink program={program} />
                  {stored.idls[program].metadata?.name && <span className="text-xs text-muted">calls itself {stored.idls[program].metadata.name}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-col gap-3">
          <h4 className={H4}>Instructions, in this order</h4>
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={index} className="min-w-0 rounded-lg border border-border bg-surface-2/40">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3.5 py-2.5">
                  <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-3 text-[11px] font-semibold text-muted nums">
                    {index + 1}
                  </span>
                  <strong className="min-w-0 font-mono text-[0.8125rem] font-semibold break-all text-text">{step.ixName}</strong>
                  <span className="text-xs text-muted">on {short(step.program)}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-3 p-3.5">
                  <pre className="min-w-0 rounded-md border border-border bg-bg/70 px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-text [overflow-wrap:anywhere]">
                    {JSON.stringify(step.amountArg !== undefined && !amountKnown ? { ...step.args, [step.amountArg]: 'the amount delivered, known after the quote' } : step.args, null, 2)}
                  </pre>
                  <p className="text-xs leading-5 text-muted">
                    Data sent: <code className="font-mono break-all text-text/85">{step.instruction.data.toString('hex')}</code>
                    {step.amountArg !== undefined && !amountKnown && ' (0 in place of the amount)'}
                  </p>
                  <AccountList accounts={step.accounts} program={step.program} intermediary={intermediary} real={real} inputLabel={shared ? 'typed by whoever made the link' : undefined} />
                </div>
              </li>
            ))}
          </ol>
        </section>
        {stored.lookupTables?.length ? (
          <section className="flex flex-col gap-2.5">
            <h4 className={H4}>Lookup tables</h4>
            <ul className="flex flex-col gap-1.5">
              {stored.lookupTables.map(table => (
                <li key={table} className="min-w-0">
                  <Address value={table} full />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
