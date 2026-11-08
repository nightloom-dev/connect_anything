import { useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Blocks, Check, LifeBuoy, RotateCcw } from 'lucide-react';
import { Link } from 'wouter';
import { usePageTitle } from '../app/title.ts';
import { buttonClass } from '../ui/Button.tsx';
import { cn } from '../ui/cn.ts';
import { Tooltip } from '../ui/Tooltip.tsx';
import { CALLOUTS, FlowScheme, FlowSchemeNarrow, SourcePicker, type Source } from './landing/FlowScheme.tsx';
import { useDrawOnView } from './landing/useDrawOnView.ts';
import { WatcherPlot } from './landing/WatcherPlot.tsx';
import { CU_LIMIT, FIXTURES_URL, PROOF_RUNS, SOLSCAN, SOURCE_CHAINS, TX_BYTES_LIMIT, VERIFIED, WATCHER_URL, type ProofRun, type VerifiedProgram } from './landing/facts.ts';

// The landing page is drawn as a set of five sheets: the route of a run with its callouts, the problem, the steps,
// the proof and the watcher. Each sheet spans the window and keeps its words to the content width.

const grouped = new Intl.NumberFormat('en-US');
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// ui/Address and ui/TxLink would bring connect.ts and the SDK into the first load, so the landing page draws its own
const short = (value: string, chars = 5) => `${value.slice(0, chars)}…${value.slice(-chars)}`;
const SHEETS = 5;

const WIDTH = 'mx-auto w-full max-w-content px-4 sm:px-6';

function External({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn('link inline-flex items-center gap-1', className)}>
      {children}
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The rule a sheet starts with: an ink line and the sheet's number, as the frame of a drawing has it. */
function SheetRule({ n, children }: { n: number; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {children && <p className="label-caps min-w-0 text-muted">{children}</p>}
      <span aria-hidden className="h-px min-w-6 flex-1 bg-text" />
      <span aria-hidden className="label-caps shrink-0 text-muted nums">
        <span className="max-sm:hidden">Sheet </span>
        {n} / {SHEETS}
      </span>
    </div>
  );
}

function Sheet({ n, id, label, title, lead, children, className }: { n: number; id: string; label: string; title: [string, string]; lead?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('border-t border-border bg-surface', className)}>
      <div className={cn(WIDTH, 'flex flex-col pt-10 pb-14 sm:pt-12 sm:pb-20')}>
        <SheetRule n={n}>{label}</SheetRule>
        {/* two lines from 640 px, where a drawing would break them; a phone wraps them as they come */}
        <h2 id={id} className="mt-8 text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.025em] sm:mt-10 sm:text-[2.25rem] lg:text-[2.5rem]">
          {title[0]} <span className="sm:block">{title[1]}</span>
        </h2>
        {lead && <p className="mt-4 max-w-[62ch] text-muted sm:text-base">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

/**
 * Under the drawing: how to pick the chain (its boxes are buttons, see SourcePicker), and Run again, which replays the
 * run more slowly. With reduced motion there is nothing to replay.
 */
function RunControls({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 md:mt-3">
      <p className="text-sm text-muted">Press Base, Arbitrum or Ethereum on the drawing to pay from it.</p>
      <button
        type="button"
        onClick={onAgain}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium text-accent transition-colors duration-120 hover:bg-accent/8 hover:text-accent-hover motion-reduce:hidden"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Run again
      </button>
    </div>
  );
}

function Hero() {
  const [source, setSource] = useState<Source>('Base');
  // each run after the first is a new drawing, which plays from the start
  const [runs, setRuns] = useState(0);
  const key = `${source}-${runs}`;
  const slow = runs > 0;
  const again = () => setRuns(count => count + 1);
  // a chain, even the one it is on, plays the run from it
  const pick = (chain: Source) => {
    setSource(chain);
    again();
  };
  return (
    <section aria-labelledby="hero-title" className="bg-grid">
      <div className={cn(WIDTH, 'flex flex-col pt-6 pb-10 sm:pt-10 md:pb-12')}>
        <SheetRule n={1}>Built on Aurora Intents Connect</SheetRule>
        {/* from 640 px the second sentence has a line of its own, and the size keeps it to one line up to 60 px */}
        <h1 id="hero-title" className="mt-6 text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.03em] sm:mt-8 sm:text-[clamp(2.125rem,calc(6.4vw-0.25rem),3.75rem)] sm:leading-[1.04] lg:mt-7">
          Any Solana program. <span className="sm:block">One signature from any EVM chain.</span>
        </h1>
        {/* before the drawing in the page, so a phone shows both ways in on its first screen; under it from 960 px */}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:order-last md:mt-0 md:items-center md:border-t md:border-border md:pt-6">
          <Link href="/kamino" className={buttonClass({ variant: 'primary', size: 'lg' })}>
            <LifeBuoy className="size-[18px]" aria-hidden />
            Rescue a Kamino position
          </Link>
          <Link href="/build" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
            <Blocks className="size-[18px]" aria-hidden />
            Build a recipe
          </Link>
          <p className="text-sm text-muted md:ml-auto md:max-w-[27rem] md:text-right">
            Turn an Anchor program into a button anyone can press from Base, Arbitrum or Ethereum.
          </p>
        </div>
        <figure className="hero-figure mt-10 flex min-w-0 flex-col md:mt-7 md:mb-6 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-6">
          <div className="relative hidden md:col-span-2 md:block">
            <FlowScheme key={key} source={source} slow={slow} className="block" />
            <SourcePicker layout="across" source={source} onSource={pick} />
          </div>
          <div className="grid items-center gap-x-10 gap-y-8 sm:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:hidden">
            <div className="relative mx-auto w-full max-w-[26rem]">
              <FlowSchemeNarrow key={key} source={source} slow={slow} />
              <SourcePicker layout="narrow" source={source} onSource={pick} />
            </div>
            {/* the callouts, as words: under the narrow drawing, and for screen readers beside the wide one */}
            <ol className="flex flex-col gap-4">
              {CALLOUTS.map((lines, index) => (
                <li key={lines[0]} className="grid grid-cols-[1.375rem_minmax(0,1fr)] items-baseline gap-3 text-[0.9375rem]">
                  <span aria-hidden className="flex size-[1.375rem] items-center justify-center rounded-full bg-text font-mono text-[0.6875rem] font-medium text-white">
                    {index + 1}
                  </span>
                  <span>{lines.join(' ')}</span>
                </li>
              ))}
            </ol>
          </div>
          <ol className="sr-only hidden md:block">
            {CALLOUTS.map(lines => (
              <li key={lines[0]}>{lines.join(' ')}</li>
            ))}
          </ol>
          <RunControls onAgain={again} />
          {/* says the new way when the chain changes */}
          <figcaption aria-live="polite" className="label-caps mt-4 text-muted md:mt-3 md:text-right">
            Fig. 1 — one run, from {source} to Kamino
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

const WITHOUT = ['Your EVM wallet', 'Bridge or exchange', 'New Solana wallet', 'Buy SOL for gas', 'Sign tx by tx', 'Kamino repaid'];

/** One way to the program: its stops on a line, and what it costs on the right. */
function Track({ name, title, tally, note, children, accent = false }: { name: string; title: string; tally: string; note: string; children: ReactNode; accent?: boolean }) {
  return (
    <div className="grid gap-5 border-b border-border py-6 md:grid-cols-[10rem_minmax(0,1fr)_12rem] md:gap-8">
      <h3 id={name} className={cn('label-caps', accent ? 'text-accent' : 'text-muted')}>
        {title}
      </h3>
      {/* without Connect Anything the stops are six equal columns from 960 px, so that the drawing of the line can stop at each */}
      <ol aria-labelledby={name} className={cn('track relative flex flex-col gap-4 md:gap-0', accent ? 'track-on md:flex-row md:justify-between' : 'md:grid md:grid-cols-6')}>
        {children}
      </ol>
      <p className="text-sm leading-snug text-muted">
        <span className={cn('block font-mono text-[1.75rem] leading-tight font-medium nums', accent ? 'text-accent' : 'text-text')}>{tally}</span>
        {note}
      </p>
    </div>
  );
}

const stop = 'relative z-10 grid grid-cols-[0.75rem_minmax(0,1fr)] items-center gap-3 text-[0.8125rem] leading-snug md:flex md:flex-[0_1_6.5rem] md:flex-col md:items-center md:gap-2.5 md:text-center md:first:items-start md:first:text-left md:last:items-end md:last:text-right';

function Problem() {
  const drawing = useDrawOnView<HTMLDivElement>();
  return (
    <Sheet n={2} id="problem-title" label="The problem" title={['The money is on Base.', 'The program is on Solana.']}>
      <div ref={drawing} className="mt-10 border-t border-border">
        <Track name="track-without" title="Without Connect Anything" tally="4 stops" note="several signatures, three apps">
          {WITHOUT.map(item => (
            <li key={item} className={stop}>
              <i aria-hidden className="size-3 border-[1.5px] border-text bg-surface" />
              <span>{item}</span>
            </li>
          ))}
        </Track>
        <Track name="track-with" title="With Connect Anything" tally="1 signature" note="no Solana wallet, no SOL" accent>
          <li className={stop}>
            <i aria-hidden className="size-3 bg-accent" />
            <span>Your EVM wallet</span>
          </li>
          <li className="relative z-10 pl-6 md:flex-1 md:px-6 md:pl-6 md:text-center">
            <span className="bg-surface font-mono text-xs text-accent md:px-2">one signature</span>
            <span className="mt-1 block text-[0.8125rem] leading-snug text-muted md:mt-4">Exact amount and fee before you sign. Retry or Refund if the run fails on Solana.</span>
          </li>
          <li className={stop}>
            <i aria-hidden className="size-3 bg-accent" />
            <span>Kamino repaid</span>
          </li>
        </Track>
      </div>
      <p className="mt-6 text-sm text-muted">Your wallet asks for the signature, then for the deposit.</p>
    </Sheet>
  );
}

const STEPS = [
  { step: 'Program', title: 'Load the IDL', text: 'Paste a program ID and the IDL comes from the chain, or drop the IDL file.', out: 'kamino_lending · 66 instructions' },
  { step: 'Instruction', title: 'Fill in the form and accounts', text: 'Each argument becomes a field. Accounts are found for you: PDAs, token accounts, the intermediary.', out: '2 found · 9 need your input' },
  { step: 'Simulation', title: 'Simulate on a mainnet fork', text: 'See compute units, transaction size and logs before anyone pays.', out: '115,948 CU · 934 bytes · ok' },
  { step: 'Run', title: 'Run through Intents Connect', text: 'Pay from an EVM chain. Connect delivers the token and runs the steps on Solana.', out: '1 signature · ≈150 s' },
];

function HowItWorks() {
  const drawing = useDrawOnView<HTMLOListElement>();
  return (
    <Sheet
      n={3}
      id="how-title"
      label="How it works"
      title={['From an IDL to a run', 'in four steps']}
      lead={<>The builder reads the program&apos;s IDL and walks you through the rest. Nothing is written for a program in particular.</>}
    >
      <ol ref={drawing} className="steps relative mt-10 grid gap-6 pl-6 md:grid-cols-4 md:gap-8 md:pl-0">
        {STEPS.map(({ step, title, text, out }, index) => (
          <li
            key={step}
            className="group relative flex min-w-0 flex-col rounded-xs has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-accent md:pt-12"
          >
            <span aria-hidden className="step-tick absolute top-2 -left-6 h-0.5 w-3 bg-accent md:top-5 md:left-0 md:h-5 md:w-0.5" />
            <span className="label-caps text-muted transition-colors duration-120 group-hover:text-accent md:absolute md:top-0 md:left-0" aria-hidden>
              <span className="nums">0{index + 1}</span> · {step}
            </span>
            <h3 className="mt-2 text-base font-semibold md:mt-0">
              <Link href={`/build?step=${index + 1}`} className="outline-none after:absolute after:inset-0 group-hover:text-accent">
                {title}
              </Link>
            </h3>
            <p className="mt-1.5 grow text-sm text-muted">{text}</p>
            <p className="mt-3.5 flex items-center justify-between gap-2 border-t border-dashed border-border-strong pt-2.5 font-mono text-xs text-accent">
              <span>{out}</span>
              <ArrowRight aria-hidden className="size-3.5 shrink-0 opacity-0 transition-[opacity,translate] duration-120 group-hover:translate-x-0.5 group-hover:opacity-100" />
            </p>
          </li>
        ))}
      </ol>
    </Sheet>
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

/** A figure against its limit: the numbers, and a bar ruled in quarters. */
function Gauge({ value, max, unit }: { value: number; max: number; unit: string }) {
  const drawing = useDrawOnView<HTMLSpanElement>();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[0.8125rem] text-text nums">
        {grouped.format(value)} <span className="text-xs text-muted">/ {grouped.format(max)} {unit}</span>
      </span>
      <span ref={drawing} aria-hidden className="relative h-2 border border-text bg-[linear-gradient(90deg,var(--color-border-strong)_1px,transparent_1px)] bg-size-[25%_100%]">
        <span className="gauge-fill absolute inset-y-0 left-0 bg-accent" style={{ width: `${(Math.min(value / max, 1) * 100).toFixed(1)}%` }} />
      </span>
    </div>
  );
}

const Ok = () => (
  <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap text-success">
    <Check className="size-3.5" aria-hidden />
    ran ok
  </span>
);

const Instructions = ({ program }: { program: VerifiedProgram }) => (
  <ul aria-label="Instructions" className="flex flex-col">
    {program.instructions.map(name => (
      <li key={name}>
        <code className="font-mono text-xs leading-relaxed text-text">{name}</code>
      </li>
    ))}
  </ul>
);

function ProofTable() {
  const head = 'pb-2 pr-4 text-left align-bottom font-normal label-caps text-muted';
  return (
    <table className="mt-10 hidden w-full table-fixed border-collapse text-sm md:table">
      <caption className="sr-only">Four programs, run on a fork of mainnet</caption>
      <colgroup>
        <col className="w-[18%]" />
        <col className="w-[14%]" />
        <col className="w-[22%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[12%]" />
      </colgroup>
      <thead className="border-b-[1.5px] border-text">
        <tr>
          <th scope="col" className={head}>
            Program
          </th>
          <th scope="col" className={head}>
            What it does
          </th>
          <th scope="col" className={head}>
            Instructions
          </th>
          <th scope="col" className={head}>
            Compute units
            <span className="block text-[0.6875rem] tracking-normal normal-case">limit {grouped.format(CU_LIMIT)}</span>
          </th>
          <th scope="col" className={head}>
            Transaction size
            <span className="block text-[0.6875rem] tracking-normal normal-case">limit {grouped.format(TX_BYTES_LIMIT)} bytes</span>
          </th>
          <th scope="col" className={head}>
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        {VERIFIED.map(program => (
          <tr key={program.programId} className="border-b border-border align-top">
            <th scope="row" className="py-3.5 pr-4 text-left font-normal">
              <span className="block font-semibold text-text">{program.name}</span>
              <ExplorerLink href={`${SOLSCAN.account}${program.programId}`} value={program.programId} explorer={SOLSCAN.name} chars={4} />
            </th>
            <td className="py-3.5 pr-4 text-text">{program.what}</td>
            <td className="py-3.5 pr-4">
              <Instructions program={program} />
            </td>
            <td className="py-3.5 pr-6">
              <Gauge value={program.computeUnits} max={CU_LIMIT} unit="CU" />
            </td>
            <td className="py-3.5 pr-6">
              <Gauge value={program.txBytes} max={TX_BYTES_LIMIT} unit="B" />
            </td>
            <td className="py-3.5">
              <Ok />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The same report under 960 px: a program to a block. */
function ProofList() {
  return (
    <ul className="mt-8 flex flex-col border-t-[1.5px] border-text md:hidden">
      {VERIFIED.map(program => (
        <li key={program.programId} className="flex flex-col gap-3 border-b border-border py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold">{program.name}</h3>
              <p className="text-sm text-muted">{program.what}</p>
            </div>
            <Ok />
          </div>
          <p className="flex items-center gap-2 text-sm text-muted">
            Program
            <ExplorerLink href={`${SOLSCAN.account}${program.programId}`} value={program.programId} explorer={SOLSCAN.name} />
          </p>
          <Instructions program={program} />
          <div className="grid grid-cols-2 gap-4">
            <Gauge value={program.computeUnits} max={CU_LIMIT} unit="CU" />
            <Gauge value={program.txBytes} max={TX_BYTES_LIMIT} unit="B" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MainnetRuns({ runs }: { runs: ProofRun[] }) {
  const chainOf = (id: ProofRun['chain']) => SOURCE_CHAINS.find(chain => chain.id === id)!;
  return (
    <div className="mt-10">
      <h3 className="label-caps text-muted">On mainnet, with real money</h3>
      <ul className="mt-3 flex flex-col border-t-[1.5px] border-text">
        {runs.map(run => (
          <li key={run.solanaTx} className="flex flex-col gap-2 border-b border-border py-3 md:flex-row md:items-center md:justify-between md:gap-6">
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
    <Sheet
      n={4}
      id="proof-title"
      label="Proof"
      title={['Four programs, run', 'on a fork of mainnet']}
      lead={
        <>
          Each request was built by this app and run by a simulator on a fork of Solana mainnet. The limits are Connect&apos;s for one transaction: {grouped.format(CU_LIMIT)} compute units and{' '}
          {grouped.format(TX_BYTES_LIMIT)} bytes.
        </>
      }
    >
      <ProofTable />
      <ProofList />
      <div className="mt-5 flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Simulated, so no money moved. In the app, each is paid from Base, Arbitrum or Ethereum.</p>
        <External href={FIXTURES_URL}>How these were measured</External>
      </div>
      {PROOF_RUNS.length > 0 && <MainnetRuns runs={PROOF_RUNS} />}
    </Sheet>
  );
}

const COMMANDS = [
  { command: '/watch <wallet>', what: 'Rings 10 points under the liquidation LTV of each position.' },
  { command: '/watch <wallet> 65', what: 'Rings at 65% instead.' },
  { command: '/unwatch <wallet>', what: 'Stops.' },
];

function Watcher() {
  return (
    <Sheet
      n={5}
      id="watcher-title"
      label="Telegram watcher"
      title={['A warning before liquidation,', 'with the repay in it']}
      lead="A bot reads your Kamino positions every minute. When one comes within 10 points of liquidation, it sends a link that repays the debt from Base, Arbitrum or Ethereum."
    >
      <WatcherPlot className="mt-10" />
      <dl className="mt-8 grid border-t border-text md:grid-cols-3">
        {COMMANDS.map(({ command, what }) => (
          <div key={command} className="flex flex-col gap-1 border-border py-3 not-first:border-t md:pr-5 md:not-first:border-t-0 md:not-first:border-l md:not-first:pl-5">
            <dt>
              <code className="font-mono text-[0.8125rem] text-accent">{command}</code>
            </dt>
            <dd className="text-sm text-muted">{what}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-baseline md:justify-between md:gap-10">
        <p className="max-w-[62ch] text-sm text-muted">
          A repay lands about 3 minutes after the tap, so the line sits well before the edge. A position rings once, and again only after it falls 3 points under its line.
        </p>
        <External href={WATCHER_URL} className="shrink-0 text-sm font-medium">
          Run your own watcher
        </External>
      </div>
    </Sheet>
  );
}

/** `/`: what the product does, the two ways in, how it works, what backs it. */
export function Landing() {
  usePageTitle();
  return (
    <div className="flex flex-col">
      <Hero />
      <Problem />
      <HowItWorks />
      <Proof />
      <Watcher />
    </div>
  );
}
