import { useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn.ts';
import { CopyButton } from './CopyButton.tsx';
import { Switch } from './Switch.tsx';

type Kind = 'invoke' | 'log' | 'consumed' | 'success' | 'error' | 'data' | 'other';

type LogViewerProps = {
  logs: readonly string[];
  title?: ReactNode;
  /** Start with only the failures shown. */
  errorsOnly?: boolean;
  maxHeight?: number | string;
  className?: string;
};

const INVOKE = /^Program (\S+) invoke \[(\d+)\]$/;
const LOG = /^Program log: /;
const CONSUMED = /^Program \S+ consumed \d+ of \d+ compute units$/;
const SUCCESS = /^Program \S+ success$/;
const DATA = /^Program (data|return): /;
const FAILURE = /\bfailed\b|\berror\b/i;

type Line = { text: string; kind: Kind; depth: number; number: number };

/** Each line with its kind, and its depth in the CPI tree so the nested calls indent. */
function read(logs: readonly string[]): Line[] {
  let depth = 0;
  return logs.map((text, index) => {
    const invoke = INVOKE.exec(text);
    if (invoke) {
      depth = Number(invoke[2]);
      return { text, kind: 'invoke', depth, number: index + 1 };
    }
    const kind: Kind = FAILURE.test(text) && !SUCCESS.test(text) ? 'error' : LOG.test(text) ? 'log' : CONSUMED.test(text) ? 'consumed' : SUCCESS.test(text) ? 'success' : DATA.test(text) ? 'data' : 'other';
    const line = { text, kind, depth: Math.max(depth, 1), number: index + 1 };
    // a program's last line closes its level
    if (kind === 'success' || (kind === 'error' && /^Program \S+ failed/.test(text))) depth = Math.max(depth - 1, 0);
    return line;
  });
}

function Text({ line }: { line: Line }) {
  if (line.kind === 'invoke') {
    const [, program, level] = INVOKE.exec(line.text)!;
    return (
      <>
        <span className="text-muted">Program </span>
        <span className="text-accent">{program}</span>
        <span className="text-muted"> invoke [{level}]</span>
      </>
    );
  }
  if (line.kind === 'log') {
    return (
      <>
        <span className="text-muted">Program log: </span>
        <span className="text-text">{line.text.replace(LOG, '')}</span>
      </>
    );
  }
  return <>{line.text}</>;
}

const TONE: Record<Kind, string> = {
  invoke: '',
  log: '',
  consumed: 'text-muted',
  success: 'text-success',
  error: 'bg-danger/10 text-danger-text',
  data: 'text-muted',
  other: 'text-text/85',
};

/** Solana program logs: calls in accent, logs bright, compute in grey, failures in red, nested calls indented. */
export function LogViewer({ logs, title = 'Program logs', errorsOnly = false, maxHeight = 360, className }: LogViewerProps) {
  const [onlyErrors, setOnlyErrors] = useState(errorsOnly);
  const lines = useMemo(() => read(logs), [logs]);
  const errors = lines.filter(line => line.kind === 'error').length;
  const shown = onlyErrors ? lines.filter(line => line.kind === 'error') : lines;
  return (
    <div data-ui="log-viewer" className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-[#0d1016]', className)}>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-surface/70 py-1.5 pr-1.5 pl-3.5">
        <span className="flex items-baseline gap-2 text-xs">
          <span className="font-medium text-text">{title}</span>
          <span className="text-muted nums">
            {logs.length} {logs.length === 1 ? 'line' : 'lines'}
            {errors > 0 && <span className="text-danger-text"> · {errors} failed</span>}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <Switch size="sm" label={<span className="text-xs font-normal text-muted">Errors only</span>} checked={onlyErrors} onChange={setOnlyErrors} disabled={logs.length === 0} />
          <CopyButton value={logs.join('\n')} label="Copy logs" message="Logs copied" />
        </div>
      </div>
      <div role="region" aria-label={typeof title === 'string' ? title : 'Program logs'} tabIndex={0} className="overflow-auto py-2.5 font-mono text-xs leading-[1.75] focus-visible:outline-offset-[-2px]" style={{ maxHeight }}>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center font-sans text-sm text-muted">{logs.length === 0 ? 'No logs.' : 'No errors in these logs.'}</p>
        ) : (
          <ol className="w-max min-w-full">
            {shown.map(line => (
              <li key={line.number} className={cn('flex pr-4', TONE[line.kind])}>
                <span className="w-11 shrink-0 pr-3 text-right text-muted select-none nums" aria-hidden>
                  {line.number}
                </span>
                <span className="whitespace-pre" style={{ paddingLeft: `${(line.depth - 1) * 14}px` }}>
                  <Text line={line} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
