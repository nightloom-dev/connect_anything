import type { ReactNode } from 'react';
import { CircleCheck, CircleX, CloudOff, TriangleAlert } from 'lucide-react';
import type { SimResult } from '@connect-anything/core';
import { Alert, LogViewer, Meter, Skeleton, Spinner, cn } from '../../ui/index.ts';

/** What one transaction may use: the compute budget Connect asks for, and the packet size of Solana. */
export const CU_LIMIT = 200_000;
export const BYTES_LIMIT = 1232;

const grouped = (value: number) => new Intl.NumberFormat('en-US').format(value);

const VERDICT = {
  ok: { text: 'The recipe passed simulation.', Icon: CircleCheck, box: 'border-success/30 bg-success/8', badge: 'bg-success/15 text-success' },
  warn: { text: 'The recipe passed simulation with warnings.', Icon: TriangleAlert, box: 'border-warning/30 bg-warning/8', badge: 'bg-warning/15 text-warning' },
  fail: { text: 'The recipe failed in simulation, and would most likely fail for real.', Icon: CircleX, box: 'border-danger/35 bg-danger/8', badge: 'bg-danger/15 text-danger' },
} as const;

/** The verdict, large: a failure is announced at once, the rest politely. */
export function Verdict({ verdict, children }: { verdict: SimResult['verdict']; children?: ReactNode }) {
  const { text, Icon, box, badge } = VERDICT[verdict];
  return (
    <div role={verdict === 'fail' ? 'alert' : 'status'} data-verdict={verdict} className={cn('flex items-start gap-4 rounded-xl border p-4 sm:p-5', box)}>
      <span aria-hidden className={cn('flex size-11 shrink-0 items-center justify-center rounded-full sm:size-12', badge)}>
        <Icon className="size-6" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-lg leading-snug font-semibold text-balance text-text sm:text-xl">{text}</p>
        {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      </div>
    </div>
  );
}

type SimError = NonNullable<SimResult['error']>;

/** Where it failed: the error's name and code, the instruction and the program. */
export function SimulationError({ error }: { error: SimError }) {
  const name = error.name ?? `Error${error.code === undefined ? '' : ` ${error.code}`}`;
  const rows: [string, ReactNode][] = [
    ...(error.code !== undefined ? ([['Code', <span className="font-mono nums">{error.code}</span>]] as [string, ReactNode][]) : []),
    ...(error.instructionIndex !== undefined ? ([['Instruction', <span className="nums">index {error.instructionIndex}</span>]] as [string, ReactNode][]) : []),
    ...(error.programId ? ([['Program', <span className="font-mono break-all">{error.programId}</span>]] as [string, ReactNode][]) : []),
  ];
  return (
    <Alert kind="danger" title={<span className="font-mono">{name}</span>}>
      <p>{error.message}</p>
      {rows.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text/70">{label}</dt>
              <dd className="min-w-0 text-text">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Alert>
  );
}

/** The two limits of one transaction: compute units and bytes. */
export function Meters({ computeUnits, txBytes }: { computeUnits: number; txBytes: number }) {
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <Meter label="Compute units" value={computeUnits} max={CU_LIMIT} unit="CU" format={grouped} />
      <Meter label="Transaction size" value={txBytes} max={BYTES_LIMIT} unit="bytes" format={grouped} />
    </div>
  );
}

/** Everything the simulator said: verdict, the two limits, warnings, the error and the logs. */
export function SimulationReport({ result, tested }: { result: SimResult; tested?: ReactNode }) {
  const { verdict, computeUnits, txBytes, warnings, error, logs } = result;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Verdict verdict={verdict}>{tested}</Verdict>
      <Meters computeUnits={computeUnits} txBytes={txBytes} />
      {warnings.length > 0 && (
        <Alert kind="warning" title={warnings.length === 1 ? 'A warning' : `${warnings.length} warnings`}>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <SimulationError error={error} />}
      <LogViewer logs={logs} maxHeight={verdict === 'ok' ? 220 : 380} />
    </div>
  );
}

/** While the simulator works: the shape of a report, and the words for a screen reader. */
export function SimulationPending() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-2/40 p-4 sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent sm:size-12">
          <Spinner />
        </span>
        <p role="status" className="text-md font-medium text-text">
          Simulating against a mainnet fork…
        </p>
      </div>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2" aria-hidden>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

/** A 503: nothing was checked, and nothing stops the export or the run. */
export function SimulatorOffline({ reason }: { reason: string }) {
  return (
    <Alert kind="warning" icon={<CloudOff strokeWidth={2.1} />} title={<>Not simulated: simulator offline. </>}>
      You can still export and run.
      <span className="mt-1 block text-xs text-text/70">{reason}</span>
    </Alert>
  );
}
