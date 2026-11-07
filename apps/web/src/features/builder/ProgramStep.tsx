import { useRef, useState, type DragEvent, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ArrowRight, Clock, FileUp, X } from 'lucide-react';
import { AddressInput, Alert, Button, Card, IconButton, Spinner, cn, truncateMiddle } from '../../ui/index.ts';

type DropZoneProps = {
  onFile: (file: File) => void;
  disabled?: boolean;
  /** The file input, for a button elsewhere that opens the picker. */
  inputRef?: RefObject<HTMLInputElement>;
  /** Shows the look of a file held over it, for the gallery. */
  over?: boolean;
};

/**
 * A file dropped anywhere on it, or picked: the whole zone is the label of a real file input, which the keyboard reaches
 * and a screen reader names "IDL file".
 */
export function DropZone({ onFile, disabled = false, inputRef, over: forced = false }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const over = (dragging || forced) && !disabled;
  const accept = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) setDragging(true);
  };
  return (
    <label
      data-state={over ? 'over' : disabled ? 'disabled' : 'idle'}
      onDragEnter={accept}
      onDragOver={accept}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file && !disabled) onFile(file);
      }}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-5 py-7 text-center transition-[border-color,background-color] duration-120 ease-out',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent',
        disabled
          ? 'cursor-not-allowed border-border bg-surface opacity-60'
          : over
            ? 'cursor-copy border-accent bg-accent/10'
            : 'cursor-pointer border-border-control bg-surface-2/40 hover:border-accent/60 hover:bg-accent/5',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 items-center justify-center rounded-lg border transition-colors duration-120 [&>svg]:size-5',
          over ? 'border-accent/50 bg-accent/20 text-accent-hover' : 'border-border-strong bg-surface-2 text-muted group-hover:text-text',
        )}
      >
        <FileUp />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm text-text">
          {over ? (
            'Drop it to read the IDL'
          ) : (
            <>
              <span className="font-medium text-accent-hover">Choose an IDL file</span> or drop it here
            </>
          )}
        </span>
        <span className="text-xs leading-5 text-muted">Anchor 0.30 or newer, as JSON. With a program ID above, the file is read as that program's.</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        aria-label="IDL file"
        accept=".json,application/json"
        disabled={disabled}
        className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = ''; // so that the same file can be picked again after fixing it
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

type ProgramFormProps = {
  programId: string;
  onProgramId: (value: string) => void;
  /** Why the ID is not one, once the person tried it. */
  idError?: string;
  onSubmit: () => void;
  onFile: (file: File) => void;
  working: boolean;
  /** An example being read, which has its own spinner. */
  exampleWorking?: boolean;
  error?: string;
};

/** A program ID to read the IDL of from chain, or an IDL file. */
export function ProgramForm({ programId, onProgramId, idError, onSubmit, onFile, working, exampleWorking = false, error }: ProgramFormProps) {
  const file = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <Card padding="lg" className="flex flex-col gap-5 max-sm:[--card-p:1rem]">
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <label htmlFor="program-id" className="text-sm font-medium text-text">
          Program ID
        </label>
        <div className="flex gap-3 max-sm:flex-col">
          <AddressInput
            id="program-id"
            size="lg"
            value={programId}
            onChange={onProgramId}
            error={idError}
            placeholder="Base58 address"
            containerClassName="min-w-0 flex-1"
            aria-describedby={idError ? undefined : 'program-id-hint'}
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            icon={<ArrowRight />}
            loading={working && !exampleWorking}
            disabled={exampleWorking || (!working && !programId.trim())}
            className="sm:min-w-28"
          >
            Load
          </Button>
        </div>
        {!idError && (
          <p id="program-id-hint" className="text-xs leading-5 text-muted">
            Its IDL is read from chain, so the program has to publish one.
          </p>
        )}
      </form>
      <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted uppercase" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <DropZone onFile={onFile} disabled={working} inputRef={file} />
      {working && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          Reading the IDL…
        </p>
      )}
      {error && (
        <Alert
          kind="danger"
          actions={
            <Button size="sm" icon={<FileUp />} onClick={() => file.current?.click()}>
              Upload the IDL file instead
            </Button>
          }
        >
          {error}
        </Alert>
      )}
    </Card>
  );
}

export type ExampleView = { name: string; kind: string; program: string };

type ExamplesProps = {
  examples: ExampleView[];
  onPick: (program: string) => void;
  /** The example being read. */
  loading?: string;
  disabled?: boolean;
};


/** Programs whose IDL ships with the page: one click and the instructions are on screen, with no request. */
export function Examples({ examples, onPick, loading, disabled = false }: ExamplesProps) {
  return (
    <section aria-labelledby="examples-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="examples-title" className="text-sm font-medium text-text">
          Start from an example
        </h2>
        <p className="text-xs text-muted">The IDL ships with this page, so nothing is fetched.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {examples.map(({ name, kind, program }) => (
          <li key={program} className="min-w-0">
            <button
              type="button"
              // the one that loads keeps the focus, and takes no second click
              disabled={disabled && loading !== program}
              aria-busy={loading === program || undefined}
              aria-disabled={loading === program || undefined}
              onClick={loading === program ? undefined : () => onPick(program)}
              className="group flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-[border-color,background-color] duration-120 ease-out enabled:hover:border-border-control enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress"
            >
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/8 font-mono text-sm font-semibold text-accent">
                {loading === program ? <Spinner size="sm" /> : name[0].toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-text">{name}</span>
                <span className="truncate text-xs text-muted">
                  {kind}
                  <span className="sr-only">, </span>
                  <span aria-hidden> · </span>
                  <span className="font-mono">{truncateMiddle(program)}</span>
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-faint transition-[color,translate] duration-120 group-enabled:group-hover:translate-x-0.5 group-enabled:group-hover:text-text" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type RecentProps = {
  recent: { address: string; name?: string }[];
  onPick: (address: string) => void;
  onClear: () => void;
  disabled?: boolean;
  /** The program being read again, whose chip keeps the focus meanwhile. */
  loading?: string;
};

/** Programs this browser loaded before, read again from chain on a click. */
export function RecentPrograms({ recent, onPick, onClear, disabled = false, loading }: RecentProps) {
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-title" className="flex items-center gap-2 text-sm font-medium text-text">
          <Clock className="size-4 text-muted" aria-hidden />
          Recent programs
        </h2>
        <IconButton label="Forget recent programs" icon={<X />} size="xs" onClick={onClear} />
      </div>
      <ul className="flex flex-wrap gap-2">
        {recent.map(({ address, name }) => (
          <li key={address} className="min-w-0 max-w-full">
            <button
              type="button"
              // the one that loads keeps the focus, and takes no second click
              disabled={disabled && loading !== address}
              aria-busy={loading === address || undefined}
              aria-disabled={loading === address || undefined}
              onClick={loading === address ? undefined : () => onPick(address)}
              className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-3 text-sm text-text transition-colors duration-120 enabled:hover:border-border-control enabled:hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress"
            >
              {name && <span className="truncate font-medium">{name}</span>}
              <span className="font-mono text-xs text-muted">{truncateMiddle(address)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FLOW: { title: string; text: ReactNode }[] = [
  { title: 'Program', text: 'Its IDL lists the instructions and the accounts each one takes.' },
  { title: 'Instruction', text: 'Pick one and fill in its arguments. Accounts the IDL can derive are filled in for you.' },
  { title: 'Simulation', text: 'A run on a fork of mainnet: compute units, size and logs. Then share a link or export TypeScript.' },
  { title: 'Run', text: 'Pay from Base, Arbitrum or Ethereum with one signature. Intents Connect runs the recipe on Solana.' },
];

/** What the four steps do, beside step 1 while the recipe is empty. */
export function HowItWorks() {
  return (
    <Card as="aside" aria-labelledby="flow-title" padding="lg" className="flex flex-col gap-5 max-sm:[--card-p:1rem]">
      <div>
        <h2 id="flow-title" className="text-base font-semibold text-text">
          From an IDL to a run
        </h2>
        <p className="mt-1 text-sm text-muted">Any Anchor program, with no code written for it.</p>
      </div>
      <ol className="flex flex-col">
        {FLOW.map(({ title, text }, index) => (
          <li key={title} className="relative flex gap-3.5 pb-5 last:pb-0">
            {index < FLOW.length - 1 && <span aria-hidden className="absolute top-8 bottom-1 left-[13px] w-px bg-border-strong" />}
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-xs font-semibold text-muted nums">
              {index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium text-text">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
