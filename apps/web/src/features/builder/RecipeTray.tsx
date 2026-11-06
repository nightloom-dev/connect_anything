import { useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, ListOrdered, Trash2 } from 'lucide-react';
import type { Token } from '../../connect.ts';
import { Address, Alert, Button, Card, IconButton, Select, Skeleton, Spinner, TokenIcon, cn, truncateMiddle } from '../../ui/index.ts';
import { breakable } from './breakable.tsx';

/** An account of a step as it resolves now, and where its address came from. */
export type TrayAccount = {
  name: string;
  pubkey: string | null;
  source: 'auto' | 'recipe' | 'input';
  shows: 'missing' | 'left-out' | 'self' | 'follows' | 'address';
};

/** A step of the recipe as the tray shows it. */
export type TrayStep = {
  /** Who the step is, the same when it moves, so that the accounts open in the tray move with it. */
  key: string;
  ixName: string;
  program: string;
  programName: string;
  amountArg?: string;
  /** Its accounts, once the token is known. */
  accounts?: TrayAccount[];
  /** Why they could not be worked out. */
  problem?: string;
};

type TokensState = { loading: boolean; error?: Error; retry: () => void; empty: boolean };

type RecipeTrayProps = {
  tokens: TokensState;
  targets: Token[];
  token?: Token;
  onTarget: (assetId: string) => void;
  steps: TrayStep[];
  onUp: (index: number) => void;
  onDown: (index: number) => void;
  onRemove: (index: number) => void;
  /** The address lookup tables the recipe is sent with, which came with a recipe handed over. */
  lookupTables?: string[];
  /** Why Connect would refuse the recipe as it stands. */
  destination?: string;
  /** Whether "Next: simulate" is off, as the builder decides it. */
  nextDisabled: boolean;
  onNext: () => void;
  /** Why a button is not there yet: a failure of the token list, with its retry. */
  failure?: ReactNode;
  className?: string;
};

const SOURCES: { source: TrayAccount['source']; title: string }[] = [
  { source: 'recipe', title: 'From the recipe' },
  { source: 'auto', title: 'Found automatically' },
  { source: 'input', title: 'Typed in' },
];

function Shown({ account }: { account: TrayAccount }) {
  switch (account.shows) {
    case 'missing':
      return <span className="text-warning">no address</span>;
    case 'left-out':
      return <span className="text-muted italic">left out</span>;
    case 'self':
      return <span className="text-accent-hover">the intermediary</span>;
    case 'follows':
      return <span className="text-accent-hover">from the intermediary</span>;
    default:
      return <Address value={account.pubkey!} />;
  }
}

/**
 * A step's accounts on demand, by where each came from: what a recipe handed over found shows as "from the recipe".
 * `pending`: the tokens are on their way, and the accounts with them, so their line is kept for them.
 */
function StepAccounts({ step, number, pending }: { step: TrayStep; number: number; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (!step.accounts && !step.problem)
    return pending ? (
      <span aria-hidden className="ml-9 flex h-4 items-center">
        <Skeleton className="h-2.5 w-36" />
      </span>
    ) : null;
  const accounts = step.accounts ?? [];
  const fromRecipe = accounts.filter(account => account.source === 'recipe').length;
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
        className="ml-9 inline-flex items-center gap-1 self-start rounded-sm text-xs font-medium text-muted transition-colors duration-120 hover:text-text"
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-120 motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
        <span className="nums">
          {step.problem ? 'Accounts' : `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
          {fromRecipe > 0 && `, ${fromRecipe} from the recipe`}
        </span>
        <span className="sr-only"> of step {number}</span>
      </button>
      {open && (
        <div id={panel} className="mt-2 flex min-w-0 flex-col gap-2.5 sm:ml-9">
          {step.problem && <p className="text-xs text-danger-text">{step.problem}</p>}
          {SOURCES.map(({ source, title }) => {
            const group = accounts.filter(account => account.source === source);
            return (
              group.length > 0 && (
                <div key={source} className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-medium text-text">
                    {title} <span className="font-normal text-muted nums">{group.length}</span>
                  </p>
                  <ul className="flex min-w-0 flex-col divide-y divide-border/60 rounded-md border border-border/80 bg-surface/60">
                    {group.map(account => (
                      <li key={account.name} className="flex min-w-0 items-center justify-between gap-3 px-2.5 py-1 text-xs">
                        <span className="min-w-0 font-mono [overflow-wrap:anywhere] text-text">{breakable(account.name)}</span>
                        <span className="shrink-0">
                          <Shown account={account} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The recipe so far, beside the form: the token it receives, its steps in order, and the way on to the simulation. */
export function RecipeTray({ tokens, targets, token, onTarget, steps, onUp, onDown, onRemove, lookupTables, destination, nextDisabled, onNext, failure, className }: RecipeTrayProps) {
  return (
    <Card as="aside" aria-labelledby="recipe-title" padding="none" className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <h3 id="recipe-title" className="flex items-center gap-2 text-base font-semibold text-text">
          <ListOrdered className="size-[18px] text-muted" aria-hidden />
          Recipe
        </h3>
        <span className="text-xs text-muted nums">{steps.length === 1 ? '1 step' : `${steps.length} steps`}</span>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2">
          {tokens.loading && (
            // as tall as the field that takes its place, so that the steps under it stay where they are
            <div className="flex flex-col gap-1.5">
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <Spinner size="sm" />
                Loading the tokens Intents Connect can deliver…
              </p>
              <Skeleton className="h-10" />
              <span className="flex h-5 items-center">
                <Skeleton className="h-3 w-3/4" />
              </span>
            </div>
          )}
          {failure}
          {tokens.empty && <Alert kind="danger">Intents Connect lists no Solana token to deliver right now, so no recipe can be built.</Alert>}
          {token && (
            <Select
              label="Token the recipe receives"
              hint="Connect delivers it on Solana. The accounts depend on it."
              value={token.assetId}
              onChange={onTarget}
              options={targets.map(target => ({
                value: target.assetId,
                label: target.symbol,
                icon: <TokenIcon symbol={target.symbol} size={18} />,
                aside: <span className="font-mono text-xs">{truncateMiddle(target.contractAddress!)}</span>,
              }))}
            />
          )}
        </div>

        {steps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-control px-4 py-5 text-sm leading-relaxed text-muted">
            Nothing yet. Instructions run in the order added, so add whatever must run first (a refresh, say) before the main one.
          </p>
        ) : (
          <ol aria-label="Steps of the recipe" className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li key={step.key} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2/50 py-2.5 pr-2 pl-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-xs font-semibold text-muted nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-medium [overflow-wrap:anywhere] text-text">{breakable(step.ixName)}</p>
                    <p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted">
                      {breakable(step.programName)}
                      <span aria-hidden> · </span>
                      <span className="sr-only">, </span>
                      <span className="font-mono whitespace-nowrap">{truncateMiddle(step.program)}</span>
                    </p>
                    {step.amountArg && (
                      <p className="mt-1 text-xs break-words text-accent-hover">
                        Takes the amount delivered as <span className="font-mono">{step.amountArg}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <IconButton label={`Move ${step.ixName} up`} icon={<ArrowUp />} disabled={index === 0} onClick={() => onUp(index)} />
                    <IconButton label={`Move ${step.ixName} down`} icon={<ArrowDown />} disabled={index === steps.length - 1} onClick={() => onDown(index)} />
                    <IconButton label={`Remove ${step.ixName}`} icon={<Trash2 />} onClick={() => onRemove(index)} />
                  </div>
                </div>
                <StepAccounts step={step} number={index + 1} pending={tokens.loading} />
              </li>
            ))}
          </ol>
        )}

        {steps.length > 0 && !!lookupTables?.length && (
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-medium text-text">
              {lookupTables.length === 1 ? 'Address lookup table' : 'Address lookup tables'} <span className="font-normal text-muted">from the recipe</span>
            </p>
            <ul aria-label="Address lookup tables" className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
              {lookupTables.map(table => (
                <li key={table} className="min-w-0">
                  <Address value={table} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {destination && (
          <Alert kind="danger" title="Connect would refuse this recipe">
            {destination}
          </Alert>
        )}

        <Button variant="primary" size="lg" block iconRight={<ArrowRight />} disabled={nextDisabled} onClick={onNext}>
          Next: simulate
        </Button>
      </div>
    </Card>
  );
}
