/** What `GET /api/kamino/:wallet` gives of a position, as far as the watcher reads it. */
export type Position = { address: string; ltv: number; liquidationLtv: number; debtUsd: number; collateralUsd: number };

export type Watch = {
  chat: number;
  wallet: string;
  /** The LTV that rings, null for 10 points under the position's own liquidation LTV. */
  line: number | null;
  /** Positions that rang and have not fallen back under their line since. */
  alerted: string[];
};

export type Command =
  | { kind: 'watch'; wallet: string; line: number | null }
  | { kind: 'unwatch'; wallet: string }
  | { kind: 'list' }
  | { kind: 'help' }
  | { kind: 'error'; text: string };

// A repay lands about 150 s plus the MPC signature after the tap, so the alert has to come well before the edge.
const MARGIN = 0.1;
// A position sitting on its line would otherwise ring at every check.
const REARM = 0.03;

export const lineOf = (watch: Watch, position: Position) => watch.line ?? Math.max(position.liquidationLtv - MARGIN, 0);

export function decide(watch: Watch, position: Position): 'alert' | 'rearm' | null {
  const line = lineOf(watch, position);
  const alerted = watch.alerted.includes(position.address);
  if (!alerted && position.ltv >= line) return 'alert';
  if (alerted && position.ltv < line - REARM) return 'rearm';
  return null;
}

export function parseCommand(text: string): Command | null {
  const [head = '', wallet, line] = text.trim().split(/\s+/);
  const name = head.replace(/@\w+$/, '');
  if (name === '/start' || name === '/help') return { kind: 'help' };
  if (name === '/list') return { kind: 'list' };
  if (name !== '/watch' && name !== '/unwatch') return null;
  if (!wallet || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return { kind: 'error', text: 'Send a Solana wallet address after the command.' };
  if (name === '/unwatch') return { kind: 'unwatch', wallet };
  if (line === undefined) return { kind: 'watch', wallet, line: null };
  const value = Number(line.replace(/%$/, ''));
  if (!(value >= 1 && value <= 99)) return { kind: 'error', text: 'The line is an LTV in percent, from 1 to 99.' };
  return { kind: 'watch', wallet, line: value / 100 };
}

export const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

export function alertText(position: Position, line: number, app: string, wallet: string): string {
  return [
    `Your Kamino position ${position.address.slice(0, 4)}…${position.address.slice(-4)} is at LTV ${percent(position.ltv)}, over the line of ${percent(line)}. It is liquidated at ${percent(position.liquidationLtv)}.`,
    `It owes $${position.debtUsd.toFixed(2)} against $${position.collateralUsd.toFixed(2)}.`,
    `Repay it from Base, Arbitrum or Ethereum with one signature, about 3 minutes to land: ${app}/kamino?wallet=${wallet}&obligation=${position.address}`,
  ].join('\n');
}
