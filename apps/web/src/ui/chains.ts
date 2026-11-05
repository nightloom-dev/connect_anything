import { CHAINS } from '../connect.ts';

/** `abcd…wxyz`, keeping the 0x of an EVM value in front of the part that differs. */
export function truncateMiddle(value: string, chars = 4) {
  const head = value.startsWith('0x') ? chars + 2 : chars;
  return value.length <= head + chars + 1 ? value : `${value.slice(0, head)}…${value.slice(-chars)}`;
}

type ChainMeta = { id: string; name: string; icon: string; explorer: string; tx: string; address: string; token: string };

const SOLANA: ChainMeta = {
  id: 'sol',
  name: 'Solana',
  icon: '/icons/solana.svg',
  explorer: 'Solscan',
  tx: 'https://solscan.io/tx/',
  address: 'https://solscan.io/account/',
  token: 'https://solscan.io/token/',
};

const ICONS: Record<string, string> = { base: '/icons/base.svg', arb: '/icons/arbitrum.svg', eth: '/icons/ethereum.svg' };

// the EVM chains a recipe is paid from, with the explorers connect.ts already links transactions to
const EVM: ChainMeta[] = CHAINS.map(({ id, name, tx }) => {
  const host = new URL(tx).hostname.split('.')[0];
  return {
    id,
    name,
    icon: ICONS[id],
    explorer: host[0].toUpperCase() + host.slice(1),
    tx,
    address: tx.replace(/tx\/$/, 'address/'),
    token: tx.replace(/tx\/$/, 'token/'),
  };
});

/** What the app knows of a chain by its id in Intents Connect: base, arb, eth, and sol (or solana). */
export function chainMeta(chain: string): ChainMeta | undefined {
  if (chain === 'sol' || chain === 'solana') return SOLANA;
  return EVM.find(({ id }) => id === chain);
}

const EVM_IDS: Record<number, string> = { 8453: 'base', 42161: 'arb', 1: 'eth' };

/** The chain of a CAIP-10 account (`eip155:8453:0x…`, `solana:…:…`), as an id chainMeta knows, or its numeric id otherwise. */
export function chainOfCaip(caip?: string): { chain?: string; reference?: string } {
  if (!caip) return {};
  const [namespace, reference] = caip.split(':');
  if (namespace === 'solana') return { chain: 'sol', reference };
  if (namespace === 'eip155') return { chain: EVM_IDS[Number(reference)], reference };
  return { reference };
}
