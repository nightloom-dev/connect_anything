import { Fragment, useState, type ReactNode } from 'react';
import { CircleCheck, CircleDashed, CircleMinus, Pencil, RotateCcw } from 'lucide-react';
import { Address, Badge, Button, cn } from '../../ui/index.ts';
import { AddressField } from './AddressField.tsx';
import type { QuickPick } from './known.ts';

/** Where an account's address comes from when nothing has been typed: what the person has to do about it. */
export type AccountGroup = 'input' | 'optional' | 'recipe' | 'auto';

/** One account of the instruction, worked out by the form: this only draws it. */
export type AccountView = {
  /** The path in the IDL, as repay_accounts.obligation. */
  name: string;
  /** The groups it sits in, as ['repay_accounts']. */
  scope: string[];
  /** The name without its groups. */
  short: string;
  group: AccountGroup;
  /** What to show for the address. */
  shows: 'missing' | 'left-out' | 'self' | 'follows' | 'address';
  pubkey: string | null;
  isSigner: boolean;
  isWritable: boolean;
  optional: boolean;
  /** Whether a typed address counts, so the field is there. */
  editable: boolean;
  /** What was typed. */
  value: string;
  placeholder: string;
  docs?: string;
  suggestions: QuickPick[];
};

type AccountsPanelProps = {
  accounts: AccountView[];
  /** How the intermediary is named: "the intermediary of whoever runs this". */
  who: string;
  intermediary: string;
  known: QuickPick[];
  onInput: (name: string, value: string) => void;
};

const SUMMARY: { group: AccountGroup; text: string; tone: string }[] = [
  { group: 'auto', text: 'found automatically', tone: 'text-success' },
  { group: 'recipe', text: 'from the recipe', tone: 'text-accent-hover' },
  { group: 'input', text: 'need your input', tone: 'text-warning' },
  { group: 'optional', text: 'optional', tone: 'text-text' },
];

const anchorOf = (name: string) => `account-${name}`;

function Flags({ account }: { account: AccountView }) {
  return (
    <>
      {account.isSigner && <Badge variant="signs">signs</Badge>}
      {account.isWritable && <Badge variant="writable">writable</Badge>}
    </>
  );
}

/** The address as the old list said it: whose it is when it is the intermediary's, or the key. */
function Shown({ account, who }: { account: AccountView; who: string }) {
  switch (account.shows) {
    case 'missing':
      return <span className="text-sm text-warning">needs an address</span>;
    case 'left-out':
      return <span className="text-sm text-muted italic">left out</span>;
    case 'self':
      return <span className="text-sm text-accent-hover">{who}</span>;
    case 'follows':
      return <span className="text-sm text-accent-hover">derived from {who}</span>;
    default:
      return <Address value={account.pubkey!} />;
  }
}

/** Runs of accounts in the same group get one header with the group's name, so `repay_accounts.` is said once. */
function byScope(accounts: AccountView[]) {
  const runs: { scope: string; accounts: AccountView[] }[] = [];
  for (const account of accounts) {
    const scope = account.scope.join('.');
    const last = runs[runs.length - 1];
    if (last && last.scope === scope) last.accounts.push(account);
    else runs.push({ scope, accounts: [account] });
  }
  return runs;
}

function InputList(props: Omit<AccountsPanelProps, 'accounts'> & { accounts: AccountView[] }) {
  return (
    <div className="flex flex-col gap-3">
      {byScope(props.accounts).map(run =>
        run.scope ? (
          <div key={run.scope + run.accounts[0].name} className="min-w-0 rounded-lg border border-border">
            <p className="border-b border-border bg-surface-2/50 px-3 py-1.5 font-mono text-xs text-muted">{run.scope}</p>
            <div className="flex flex-col divide-y divide-border/60 px-3">
              {run.accounts.map(account => (
                <AccountInputRow key={account.name} account={account} {...props} />
              ))}
            </div>
          </div>
        ) : (
          <div key={run.accounts[0].name} className="flex flex-col divide-y divide-border/60">
            {run.accounts.map(account => (
              <AccountInputRow key={account.name} account={account} {...props} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function AccountInputRow({ account, who, intermediary, known, onInput }: { account: AccountView } & Omit<AccountsPanelProps, 'accounts'>) {
  const filled = account.shows !== 'missing';
  return (
    <div id={anchorOf(account.name)} className="flex min-w-0 scroll-mt-24 flex-col gap-2 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {account.shows === 'left-out' ? (
          <CircleMinus className="size-4 shrink-0 text-muted" aria-label="Left out" role="img" />
        ) : filled ? (
          <CircleCheck className="size-4 shrink-0 text-success" aria-label="Filled" role="img" />
        ) : (
          <CircleDashed className="size-4 shrink-0 text-warning" aria-label="Needs an address" role="img" />
        )}
        <span className="min-w-0 font-mono text-[13px] font-medium break-all text-text">{account.short}</span>
        <Flags account={account} />
        {(account.shows === 'self' || account.shows === 'follows' || account.shows === 'left-out') && (
          <span className="ml-auto text-xs">
            <Shown account={account} who={who} />
          </span>
        )}
      </div>
      {account.docs && <p className="text-xs leading-5 text-muted">{account.docs}</p>}
      {account.editable ? (
        <AddressField
          label={`Address of ${account.name}`}
          value={account.value}
          onChange={value => onInput(account.name, value)}
          placeholder={account.placeholder}
          intermediary={intermediary}
          suggestions={account.suggestions}
          known={known}
        />
      ) : (
        account.pubkey && account.shows === 'address' && <Address value={account.pubkey} />
      )}
    </div>
  );
}

function Section({ title, aside, description, children }: { title: string; aside?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-text">{title}</p>
          {aside && <span className="text-xs text-muted nums">{aside}</span>}
        </div>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** A found account in one line. One the IDL could only guess can still be changed. */
function CompactRow({ account, who, intermediary, known, onInput }: { account: AccountView } & Omit<AccountsPanelProps, 'accounts'>) {
  const [editing, setEditing] = useState(false);
  const open = editing || !!account.value;
  return (
    <li id={anchorOf(account.name)} className="flex min-w-0 scroll-mt-24 flex-col gap-2 px-3 py-2">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
        <span className="min-w-0 truncate font-mono text-[13px] text-text" title={account.name}>
          {account.short}
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 items-center sm:col-span-1 sm:row-start-auto">
          <Shown account={account} who={who} />
        </span>
        <span className="flex shrink-0 items-center justify-end gap-1.5">
          <Flags account={account} />
          {account.editable && !open && (
            <Button size="xs" variant="ghost" icon={<Pencil />} onClick={() => setEditing(true)} aria-label={`Change ${account.name}`}>
              Change
            </Button>
          )}
          {account.editable && open && (
            <Button
              size="xs"
              variant="ghost"
              icon={<RotateCcw />}
              aria-label={`Use the found address of ${account.name}`}
              onClick={() => {
                onInput(account.name, '');
                setEditing(false);
              }}
            >
              Reset
            </Button>
          )}
        </span>
      </div>
      {account.editable && open && (
        <AddressField label={`Address of ${account.name}`} value={account.value} onChange={value => onInput(account.name, value)} placeholder={account.placeholder} intermediary={intermediary} suggestions={account.suggestions} known={known} />
      )}
    </li>
  );
}

function CompactTable({ title, accounts, ...props }: Omit<AccountsPanelProps, 'accounts'> & { title: string; accounts: AccountView[] }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-3 py-2">
        <p className="text-xs font-medium text-text">{title}</p>
        <span className="text-xs text-muted nums">{accounts.length}</span>
      </div>
      {byScope(accounts).map(run => (
        <div key={run.scope + run.accounts[0].name}>
          {run.scope && <p className="border-b border-border/60 px-3 pt-2 pb-1 font-mono text-xs text-muted">{run.scope}</p>}
          <ul className="flex flex-col divide-y divide-border/60">
            {run.accounts.map(account => (
              <CompactRow key={account.name} account={account} {...props} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The accounts of an instruction, by what they need: those nothing found come first as fields, those found by the IDL
 * or the recipe fold into compact tables. A group prefix becomes a header.
 */
export function AccountsPanel({ accounts, ...props }: AccountsPanelProps) {
  const of = (group: AccountGroup) => accounts.filter(account => account.group === group);
  const needs = of('input');
  const filled = needs.filter(account => account.shows !== 'missing').length;
  const optional = of('optional');
  const counts = SUMMARY.map(item => ({ ...item, count: of(item.group).length })).filter(item => item.count > 0);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <p className="text-sm leading-6 text-muted">
        {counts.map(({ group, text, tone, count }, index) => (
          <Fragment key={group}>
            {index > 0 && (
              <>
                <span aria-hidden className="px-1.5 text-faint">
                  ·
                </span>
                <span className="sr-only">, </span>
              </>
            )}
            <span className="whitespace-nowrap">
              <span className={cn('font-semibold nums', tone)}>{count}</span> {text}
            </span>
          </Fragment>
        ))}
      </p>
      {needs.length > 0 && (
        <Section title="Needs your input" aside={`${filled} of ${needs.length} filled`}>
          <InputList accounts={needs} {...props} />
        </Section>
      )}
      {optional.length > 0 && (
        <Section title="Optional" description="A blank one is left out, as the program allows.">
          <InputList accounts={optional} {...props} />
        </Section>
      )}
      {of('recipe').length > 0 && <CompactTable title="From the recipe" accounts={of('recipe')} {...props} />}
      {of('auto').length > 0 && <CompactTable title="Found automatically" accounts={of('auto')} {...props} />}
    </div>
  );
}
