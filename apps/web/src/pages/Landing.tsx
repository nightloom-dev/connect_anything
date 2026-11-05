import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Blocks, Braces, Check, FlaskConical, LifeBuoy, ListChecks, Send, X } from 'lucide-react';
import { Link } from 'wouter';
import { usePageTitle } from '../app/title.ts';
import { Badge } from '../ui/Badge.tsx';
import { buttonClass } from '../ui/Button.tsx';
import { cn } from '../ui/cn.ts';
import { Meter } from '../ui/Meter.tsx';
import { Tooltip } from '../ui/Tooltip.tsx';
import { FlowScheme } from './landing/FlowScheme.tsx';
import { WatcherChat } from './landing/WatcherChat.tsx';
import { CU_LIMIT, FIXTURES_URL, PROOF_RUNS, SOLSCAN, SOURCE_CHAINS, TX_BYTES_LIMIT, VERIFIED, WATCHER_URL, type ProofRun } from './landing/facts.ts';

const grouped = new Intl.NumberFormat('en-US');
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// ui/Address and ui/TxLink would bring connect.ts and the SDK into the first load, so the landing page draws its own
const short = (value: string, chars = 5) => `${value.slice(0, chars)}…${value.slice(-chars)}`;

function External({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn('link inline-flex items-center gap-1', className)}>
      {children}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-xl leading-tight font-semibold tracking-tight sm:text-2xl sm:leading-tight">
        {title}
      </h2>
      {children && <p className="mt-3 text-muted sm:text-base">{children}</p>}
    </div>
  );
}

function ChainList({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {SOURCE_CHAINS.map(({ id, name, icon }) => (
        <li key={id} className="flex items-center gap-1.5 text-sm text-text">
          <img src={icon} alt="" width={18} height={18} className="shrink-0 rounded-full" />
          {name}
        </li>
      ))}
    </ul>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="grid items-center gap-12 pb-16 sm:pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:pt-8 lg:pb-20">
      <div className="flex flex-col items-start">
        <p className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/80 py-1 pr-3 pl-2 text-xs font-medium text-muted">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Built on Aurora Intents Connect
        </p>
        <h2 id="hero-title" className="mt-5 text-[2rem] leading-[1.12] font-semibold tracking-[-0.025em] sm:text-3xl sm:leading-[1.06]">
          Any Solana program. <span className="text-brand">One signature from any EVM chain.</span>
        </h2>
        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg sm:leading-8">
          Turn an Anchor program into a button anyone can press from Base, Arbitrum or Ethereum. Aurora Intents Connect bridges the money and runs the instructions on Solana.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/kamino" className={buttonClass({ variant: 'primary', size: 'lg' })}>
            <LifeBuoy className="size-[18px]" aria-hidden />
            Rescue a Kamino position
          </Link>
          <Link href="/build" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
            <Blocks className="size-[18px]" aria-hidden />
            Build a recipe
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span>Pay from</span>
          <ChainList />
        </div>
      </div>
      <div className="relative isolate mx-auto w-full max-w-[27rem] lg:max-w-[30rem]">
        {/* a dotted canvas under the scheme, fading out at its edges */}
        <div
          aria-hidden
          className="absolute -inset-x-4 -inset-y-8 -z-10 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1.5px)] bg-size-[18px_18px] mask-[radial-gradient(closest-side,black_55%,transparent)]"
        />
        <FlowScheme />
      </div>
    </section>
  );
}

const WITHOUT = ['An exchange or a bridge to move the money', 'A Solana wallet, set up and funded', 'SOL to pay for gas', 'Several transactions, signed one by one'];
const WITH = ['The exact amount and fee before you sign', 'No Solana wallet and no SOL', 'Retry or Refund if the run fails on Solana'];

function Pain() {
  return (
    <section aria-labelledby="pain-title" className="border-t border-border py-16 sm:py-20">
      <SectionHead id="pain-title" eyebrow="The problem" title="The money is on Base. The program is on Solana." />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface/60 p-6">
          <h3 className="text-base font-semibold text-muted">Without Connect Anything</h3>
          <ul className="mt-5 flex flex-col gap-3.5">
            {WITHOUT.map(item => (
              <li key={item} className="flex items-start gap-3 text-text/80">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-muted" aria-hidden>
                  <X className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-accent/36 bg-surface p-6 shadow-card">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-accent/14 blur-3xl" />
          <h3 className="relative text-base font-semibold text-text">With Connect Anything</h3>
          <p className="relative mt-4 text-xl leading-snug font-semibold tracking-tight text-text">One signature, from the EVM wallet you already have.</p>
          <ul className="relative mt-5 flex flex-col gap-3">
            {WITH.map(item => (
              <li key={item} className="flex items-start gap-3 text-text">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/14 text-success" aria-hidden>
                  <Check className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="relative mt-5 text-sm text-muted">Your wallet asks for the signature, then for the deposit.</p>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Braces, step: 'Program', title: 'Load the IDL', text: 'Paste a program ID and the IDL comes from the chain, or drop the IDL file.' },
  { icon: ListChecks, step: 'Instruction', title: 'Fill in the form and accounts', text: 'Each argument becomes a field. Accounts are found for you: PDAs, token accounts, the intermediary.' },
  { icon: FlaskConical, step: 'Simulation', title: 'Simulate on a mainnet fork', text: 'See compute units, transaction size and logs before anyone pays.' },
  { icon: Send, step: 'Run', title: 'Run through Intents Connect', text: 'Pay from an EVM chain. Connect delivers the token and runs the steps on Solana.' },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="border-t border-border py-16 sm:py-20">
      <SectionHead id="how-title" eyebrow="How it works" title="From an IDL to a run in four steps">
        The builder reads the program&apos;s IDL and walks you through the rest. Nothing is written for a program in particular.
      </SectionHead>
      <ol className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, step, title, text }, index) => (
          <li
            key={step}
            className="group relative flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors duration-120 hover:border-border-strong hover:bg-surface-2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-accent-hover transition-colors duration-120 group-hover:bg-surface-3" aria-hidden>
                <Icon className="size-5" />
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors duration-120 group-hover:text-accent-hover" aria-hidden>
                <span className="font-mono nums">0{index + 1}</span> {step}
                <ArrowRight className="size-3.5 transition-transform duration-120 group-hover:translate-x-0.5" />
              </span>
            </div>
            <h3 className="mt-4 text-base font-semibold sm:mt-5">
              <Link href={`/build?step=${index + 1}`} className="outline-none after:absolute after:inset-0 after:rounded-xl">
                {title}
              </Link>
            </h3>
            <p className="mt-1.5 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A program ID or a transaction, shortened, in its explorer; the whole value shows on hover and focus. */
function ExplorerLink({ href, value, explorer, chars }: { href: string; value: string; explorer: string; chars?: number }) {
  return (
    <Tooltip content={<span className="font-mono font-normal break-all">{value}</span>} wide>
      <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 font-mono text-[0.8125rem] tracking-tight">
        {short(value, chars)}
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only"> on {explorer}, opens in a new tab</span>
      </a>
    </Tooltip>
  );
}

function ProgramCard({ program }: { program: (typeof VERIFIED)[number] }) {
  return (
    <li className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{program.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{program.what}</p>
        </div>
        <Badge variant="ok" icon={<Check />}>
          Ran on the fork
        </Badge>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        Program
        <ExplorerLink href={`${SOLSCAN.account}${program.programId}`} value={program.programId} explorer={SOLSCAN.name} />
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Instructions">
        {program.instructions.map(name => (
          <li key={name}>
            <code className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text">{name}</code>
          </li>
        ))}
      </ul>
      <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <Meter label="Compute units" value={program.computeUnits} max={CU_LIMIT} size="sm" />
        <Meter label="Transaction size" value={program.txBytes} max={TX_BYTES_LIMIT} unit="bytes" size="sm" />
      </div>
    </li>
  );
}

function MainnetRuns({ runs }: { runs: ProofRun[] }) {
  const chainOf = (id: ProofRun['chain']) => SOURCE_CHAINS.find(chain => chain.id === id)!;
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-5">
      <h3 className="text-base font-semibold">On mainnet, with real money</h3>
      <ul className="mt-4 flex flex-col divide-y divide-border">
        {runs.map(run => (
          <li key={run.solanaTx} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">{run.what}</p>
              <p className="text-sm text-muted nums">
                <time dateTime={run.date}>{day.format(new Date(run.date))}</time> · {run.amounts}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                Deposit on {chainOf(run.chain).name}
                <ExplorerLink href={`${chainOf(run.chain).tx}${run.evmTx}`} value={run.evmTx} explorer={chainOf(run.chain).explorer} chars={6} />
              </span>
              <span className="flex items-center gap-1.5">
                On Solana
                <ExplorerLink href={`${SOLSCAN.tx}${run.solanaTx}`} value={run.solanaTx} explorer={SOLSCAN.name} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Proof() {
  return (
    <section aria-labelledby="proof-title" className="border-t border-border py-16 sm:py-20">
      <SectionHead id="proof-title" eyebrow="Proof" title="Four programs, run on a fork of mainnet">
        Each request was built by this app and run by a simulator on a fork of Solana mainnet. The limits are Connect&apos;s for one transaction: {grouped.format(CU_LIMIT)} compute units
        and {grouped.format(TX_BYTES_LIMIT)} bytes.
      </SectionHead>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {VERIFIED.map(program => (
          <ProgramCard key={program.programId} program={program} />
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <h3 className="text-sm font-medium text-muted">Source chains</h3>
          <ChainList />
        </div>
        <External href={FIXTURES_URL} className="text-sm">
          How these were measured
        </External>
      </div>
      {PROOF_RUNS.length > 0 && <MainnetRuns runs={PROOF_RUNS} />}
    </section>
  );
}

const COMMANDS = [
  { command: '/watch <wallet>', what: 'Rings 10 points under the liquidation LTV of each position.' },
  { command: '/watch <wallet> 65', what: 'Rings at 65% instead.' },
  { command: '/unwatch <wallet>', what: 'Stops.' },
];

function Watcher() {
  return (
    <section aria-labelledby="watcher-title" className="grid items-center gap-10 border-t border-border pt-16 pb-4 sm:pt-20 sm:pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16">
      <div>
        <SectionHead id="watcher-title" eyebrow="Telegram watcher" title="A warning before liquidation, with the repay in it">
          A bot reads your Kamino positions every minute. When one comes within 10 points of liquidation, it sends a link that repays the debt from Base, Arbitrum or Ethereum.
        </SectionHead>
        <dl className="mt-8 flex flex-col gap-3">
          {COMMANDS.map(({ command, what }) => (
            <div key={command} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
              <dt className="shrink-0 sm:w-44">
                <code className="rounded-md border border-border-strong bg-surface-2 px-2 py-1 font-mono text-[13px] text-text">{command}</code>
              </dt>
              <dd className="text-sm text-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-xl text-sm text-muted">
          A repay lands about 3 minutes after the tap, so the line sits well before the edge. A position rings once, and again only after it falls 3 points under its line.
        </p>
        <p className="mt-6">
          <External href={WATCHER_URL} className="text-sm font-medium">
            Run your own watcher
          </External>
        </p>
      </div>
      <WatcherChat className="mx-auto w-full max-w-[27rem]" />
    </section>
  );
}

/** `/`: what the product does, the two ways in, how it works, what backs it. */
export function Landing() {
  usePageTitle();
  return (
    <div className="flex flex-col">
      <Hero />
      <Pain />
      <HowItWorks />
      <Proof />
      <Watcher />
    </div>
  );
}
