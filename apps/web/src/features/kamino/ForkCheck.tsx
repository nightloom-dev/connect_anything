import { useId, type ReactNode } from 'react';
import { FlaskConical, RotateCw } from 'lucide-react';
import type { SimResult } from '@connect-anything/core';
import { Badge, Button, Card, Meter, Skeleton, Spinner, cn } from '../../ui/index.ts';
import type { ForkCheck } from './simulate.ts';

/** What Connect allows a transaction: about 200k compute units, and Solana's 1232 bytes. */
export const CU_MAX = 200_000;
export const BYTES_MAX = 1232;

const VERDICT = {
  ok: { variant: 'ok', text: 'Passed' },
  warn: { variant: 'warn', text: 'Passed with warnings' },
  fail: { variant: 'bad', text: 'Failed' },
} as const;

function Meters({ result, dim = false }: { result: SimResult; dim?: boolean }) {
  return (
    <div className={cn('grid gap-x-6 gap-y-4 transition-opacity duration-200 sm:grid-cols-2', dim && 'opacity-50')}>
      <Meter label="Compute units" value={result.computeUnits} max={CU_MAX} unit="CU" />
      <Meter label="Transaction size" value={result.txBytes} max={BYTES_MAX} unit="bytes" />
    </div>
  );
}

function MetersSkeleton() {
  return (
    <div aria-hidden className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {[0, 1].map(key => (
        <div key={key} className="flex flex-col gap-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** The simulator's error in one line. Its message names the error already, mostly: "Step 4 of 4 (…) failed: ConstraintHasOne: …". */
function errorLine({ name, code, message }: NonNullable<SimResult['error']>) {
  const label = name ?? (code === undefined ? undefined : `Error ${code}`);
  return label && !message.includes(label) ? `${label}: ${message}` : message;
}

/** Runs of one instruction, as refresh_reserve ×2. */
function Instructions({ steps }: { steps: string[] }) {
  const runs = steps.reduce<{ name: string; count: number }[]>((all, name) => {
    const tail = all[all.length - 1];
    if (tail?.name === name) tail.count += 1;
    else all.push({ name, count: 1 });
    return all;
  }, []);
  return (
    <ol aria-label="Instructions, in order" className="flex min-w-0 flex-wrap items-center gap-1.5">
      {runs.map(({ name, count }, index) => (
        <li key={`${name}-${index}`} className="flex min-w-0 items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden className="text-faint">
              →
            </span>
          )}
          <span className="min-w-0 truncate rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text/90">
            {name}
            {count > 1 && <span className="ml-1 text-muted">×{count}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

type ForkCheckCardProps = {
  check: ForkCheck;
  /** What the simulation delivers to the stand-in intermediary, as "800 USDC". */
  amount?: string;
  /** The recipe's instructions, in order. */
  steps: string[];
  onRetry?: () => void;
  /** In the footer: Open in builder. */
  action?: ReactNode;
};

/** The repay run on a fork of mainnet before anyone pays: its verdict, compute units and size. It holds nothing up. */
export function ForkCheckCard({ check, amount, steps, onRetry, action }: ForkCheckCardProps) {
  const id = useId();
  const result = check.kind === 'done' ? check.result : undefined;
  const verdict = result && VERDICT[result.verdict];
  const title =
    check.kind === 'offline'
      ? 'Not simulated: simulator offline'
      : check.kind === 'failed' || check.kind === 'idle'
        ? 'Not simulated'
        : check.kind === 'checking' && !check.last
          ? 'Checking on a fork…'
          : 'Checked on a fork';

  return (
    <Card as="section" aria-labelledby={id} padding="lg" className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-2 text-muted" aria-hidden>
          <FlaskConical className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={id} className="text-base leading-6 font-semibold text-text">
            {title}
          </h3>
          <p role="status" className="mt-0.5 text-sm text-muted">
            {check.kind === 'idle' && 'Nothing to simulate: the target asks for no repay.'}
            {check.kind === 'checking' && `Running the repay${amount ? ` of ${amount}` : ''} on a fork of mainnet…`}
            {result?.verdict === 'ok' && `The repay${amount ? ` of ${amount}` : ''} ran on a fork of mainnet.`}
            {result?.verdict === 'warn' && `The repay${amount ? ` of ${amount}` : ''} ran on a fork of mainnet, with warnings.`}
            {result?.verdict === 'fail' && `The repay${amount ? ` of ${amount}` : ''} failed on a fork of mainnet, and would most likely fail for real.`}
            {check.kind === 'offline' && 'This repay has not been checked. Paying does not depend on it.'}
            {check.kind === 'failed' && `The simulator gave no answer: ${check.message}`}
          </p>
        </div>
        {verdict && (
          <Badge variant={verdict.variant} dot size="md">
            {verdict.text}
          </Badge>
        )}
        {check.kind === 'checking' && <Spinner className="mt-1.5 text-muted" />}
      </header>

      {result && <Meters result={result} />}
      {check.kind === 'checking' && (check.last ? <Meters result={check.last} dim /> : <MetersSkeleton />)}

      {result && result.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-warning">
          {result.warnings.map(warning => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {result?.error && (
        <p className="rounded-md border border-danger/32 bg-danger/12 px-3 py-2 font-mono text-xs leading-5 break-words text-danger-text">
          {errorLine(result.error)}
        </p>
      )}
      {check.kind === 'failed' && onRetry && (
        <div>
          <Button size="sm" icon={<RotateCw />} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      <footer className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Instructions steps={steps} />
        {action && <div className="shrink-0">{action}</div>}
      </footer>
    </Card>
  );
}
