import { Component, useEffect, useState, type ReactNode } from 'react';
import { explain } from './connect.ts';
import { followsIntermediary, type Row } from './recipe.ts';

export class FetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init).catch(() => {
    throw new FetchError(0, 'The server could not be reached. Check your connection and try again.');
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new FetchError(response.status, body?.error ?? `The server answered ${response.status}.`);
  return body;
}

/** Loads while `load` is set, again whenever deps change. */
export function useAsync<T>(load: (() => Promise<T>) | null, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error }>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setState({});
    if (!load) return;
    let live = true;
    load().then(
      data => live && setState({ data }),
      error => live && setState({ error }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  return { ...state, loading: !!load && state.data === undefined && !state.error, retry: () => setTick(value => value + 1) };
}

export const useJson = <T,>(url: string | null) => useAsync<T>(url ? () => fetchJson<T>(url) : null, [url]);

/** One thing at a time, with its error kept for the screen. */
export function useAct() {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const act = (work: () => Promise<unknown>) => async () => {
    setWorking(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(explain(failure));
    } finally {
      setWorking(false);
    }
  };
  return { working, error, act };
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Failure({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Notice kind="error">
      {error.message} {retry && <button onClick={retry}>Try again</button>}
    </Notice>
  );
}

/** An IDL is someone else's file: whatever one breaks shows as a message here, not as a blank page. */
export class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <Failure error={this.state.error} /> : this.props.children;
  }
}

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(text).then(
      () => setDone(true),
      () => {}, // the text is on the page and can be selected by hand
    );
  return <button onClick={copy}>{done ? 'Copied' : 'Copy'}</button>;
}

export const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;

const SOURCE = { auto: 'found automatically', recipe: 'from the recipe', input: 'input' };

type ListProps = {
  accounts: Row[];
  program: string;
  /** The key the accounts were resolved with. */
  intermediary: string;
  /** Whether that key is the viewer's own, or a stand-in for whoever runs the recipe. */
  real?: boolean;
  /** Who typed the inputs, when it is not the viewer. */
  inputLabel?: string;
  edit?: (row: Row) => ReactNode;
};

export function AccountList({ accounts, program, intermediary, real = false, inputLabel = SOURCE.input, edit }: ListProps) {
  const who = real ? 'your intermediary' : 'the intermediary of whoever runs this';
  const address = (row: Row) => {
    if (!row.pubkey) return <em>needs an address</em>;
    if (row.optional && row.pubkey === program && !row.isSigner && !row.isWritable) return <em>left out</em>;
    const self = row.pubkey === intermediary;
    const follows = followsIntermediary(row, intermediary);
    return (
      <>
        {(real || !(self || follows)) && <code>{row.pubkey}</code>} {self && <em>{who}</em>}
        {follows && <em>derived from {who}</em>}
      </>
    );
  };
  return (
    <ul className="accounts">
      {accounts.map((row, index) => (
        <li key={index}>
          <div>
            <strong>{row.name}</strong> {row.isSigner && <span className="tag strong">signs</span>} {row.isWritable && <span className="tag">writable</span>}{' '}
            {row.optional && <span className="tag">optional</span>} <span className={`tag ${row.source}`}>{row.source === 'input' ? inputLabel : SOURCE[row.source]}</span>
          </div>
          <div>{address(row)}</div>
          {edit?.(row)}
        </li>
      ))}
    </ul>
  );
}
