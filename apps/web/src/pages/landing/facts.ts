// What the landing page claims, kept apart from how it looks so every figure has its source next to it.
import { REPO_URL } from '../../app/brand.tsx';

/** Connect's limits for one Solana transaction, as the Meter of the builder shows them. */
export const CU_LIMIT = 200_000;
export const TX_BYTES_LIMIT = 1232;

export type VerifiedProgram = {
  name: string;
  programId: string;
  /** What the recipe does, in a few words. */
  what: string;
  /** The instructions of the simulated request, in order. */
  instructions: string[];
  computeUnits: number;
  txBytes: number;
  /** The fixture in /fixtures the figures come from. */
  fixture: string;
};

// fixtures/<fixture>.result.json and the tables of fixtures/README.md: each request ran on a fork of mainnet and
// came back "ok". The figures include the 16.5k of opening the intermediary's wSOL account on the three swaps.
export const VERIFIED: VerifiedProgram[] = [
  {
    name: 'Kamino Lend',
    programId: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
    what: 'Repay a USDC debt',
    instructions: ['refresh_reserve ×2', 'refresh_obligation', 'repay_obligation_liquidity_v2'],
    computeUnits: 115_948,
    txBytes: 934,
    fixture: 'klend-repay',
  },
  {
    name: 'Orca Whirlpools',
    programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    what: 'Swap USDC to SOL',
    instructions: ['swap_v2'],
    computeUnits: 46_712,
    txBytes: 989,
    fixture: 'orca-whirlpool-swap',
  },
  {
    name: 'Meteora DLMM',
    programId: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    what: 'Swap USDC to SOL',
    instructions: ['swap'],
    computeUnits: 57_247,
    txBytes: 1038,
    fixture: 'meteora-dlmm-swap',
  },
  {
    name: 'Meteora DAMM v2',
    programId: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',
    what: 'Swap USDC to SOL',
    instructions: ['swap'],
    computeUnits: 31_163,
    txBytes: 872,
    fixture: 'meteora-damm-v2-swap',
  },
];

// The landing page draws before the wallet code loads, so it keeps its own copy of these instead of importing
// connect.ts and the SDK with it.

/** The EVM chains a recipe is paid from, as `CHAINS` in connect.ts, with the icons in public/icons. */
export const SOURCE_CHAINS = [
  { id: 'base', name: 'Base', icon: '/icons/base.svg', explorer: 'Basescan', tx: 'https://basescan.org/tx/' },
  { id: 'arb', name: 'Arbitrum', icon: '/icons/arbitrum.svg', explorer: 'Arbiscan', tx: 'https://arbiscan.io/tx/' },
  { id: 'eth', name: 'Ethereum', icon: '/icons/ethereum.svg', explorer: 'Etherscan', tx: 'https://etherscan.io/tx/' },
] as const;

/** Solana's explorer, as in ui/chains.ts. */
export const SOLSCAN = { name: 'Solscan', tx: 'https://solscan.io/tx/', account: 'https://solscan.io/account/' };

export type ProofRun = {
  /** ISO date of the run, as 2026-11-03. */
  date: string;
  /** What ran, as "Repay of a Kamino debt from Base". */
  what: string;
  /** What was paid and what arrived, as "0.786044 USDC paid, 0.514635 USDC repaid". */
  amounts: string;
  /** The source chain, an id of SOURCE_CHAINS. */
  chain: (typeof SOURCE_CHAINS)[number]['id'];
  /** The deposit on the source chain. */
  evmTx: string;
  /** The transaction that ran the steps on Solana. */
  solanaTx: string;
};

/**
 * Runs on mainnet with real money, with links to their transactions. The block that lists them shows only when this
 * has an entry, and the repository has no transaction links yet: whoever ran them adds them here.
 */
export const PROOF_RUNS: ProofRun[] = [];

export const FIXTURES_URL = `${REPO_URL}/blob/main/fixtures/README.md`;
export const WATCHER_URL = `${REPO_URL}#telegram-watcher`;
