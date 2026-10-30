import { EVM_CHAIN_IDS, ExecutionCancelledError, isUserRejection, type CreateExecutionBody, type ExecutionPlan, type ExecutionStatus, type FetchLike, type SolanaRecipe, type StepsPlan } from '@aurora-is-near/intents-connect';

export type Token = { assetId: string; symbol: string; blockchain: string; contractAddress?: string; decimals: number };
export type TokenList = { tokens: Token[]; sources: Token[] };
export type Balance = { account: string | null; tokenProgram: string | null; amount: string };

export const bySymbol = (a: Token, b: Token) => a.symbol.localeCompare(b.symbol);

export const CHAINS = [
  { id: 'base', name: 'Base', tx: 'https://basescan.org/tx/' },
  { id: 'arb', name: 'Arbitrum', tx: 'https://arbiscan.io/tx/' },
  { id: 'eth', name: 'Ethereum', tx: 'https://etherscan.io/tx/' },
];

// The figures of Aurora's own Kamino example.
const RESERVE_BPS = 25;
const SLIPPAGE_BPS = 100;
const quoteDeadline = () => new Date(Date.now() + 15 * 60_000).toISOString();

const RETRY_DELAY = 2500;
const RETRIES = 3;

/**
 * Connect answers a create with 503 when it has no durable nonce free. The SDK does not retry and nothing was created,
 * so this does. Only a create goes through the key proxy, and only a create is retried.
 */
export const retry503 =
  (fetchImpl: FetchLike, wait = (ms: number) => new Promise(done => setTimeout(done, ms))): FetchLike =>
  async (input, init) => {
    const isCreate = init?.method === 'POST' && input.includes('/api/intents-connect/');
    for (let left = RETRIES; ; left--) {
      const response = await fetchImpl(input, init);
      if (response.status !== 503 || !isCreate || left === 0) return response;
      await wait(RETRY_DELAY);
    }
  };

/** threeRound is the only fee strategy Connect takes for Solana, and the one that gives an exact figure before the signature. */
export const bridgePlan = (recipe: SolanaRecipe, source: Token, amountAtomic: string): ExecutionPlan => ({
  recipe,
  params: undefined,
  feeStrategy: { kind: 'threeRound', amountReserveBps: RESERVE_BPS },
  quote: {
    originAsset: source.assetId,
    destinationAsset: recipe.destination.assetId,
    amount: amountAtomic,
    swapType: 'EXACT_INPUT',
    slippageTolerance: SLIPPAGE_BPS,
    deadline: quoteDeadline(),
  },
  originChain: source.blockchain,
  originToken: { contractAddress: source.contractAddress || undefined, decimals: source.decimals },
  originChainId: EVM_CHAIN_IDS[source.blockchain] ?? null,
  depositViaWallet: true,
});

/** Spends what the intermediary was left with, so there is no deposit and the fee comes out of the amount. */
export const retryPlan = (recipe: SolanaRecipe, amount: string): StepsPlan => ({
  recipe: { ...recipe, flow: 'steps-only' },
  params: undefined,
  amount,
  feeFromAmount: { amountReserveBps: RESERVE_BPS },
  previewTtlMs: 120_000,
});

type Refund = {
  /** The intermediary's token account, from /api/balance. */
  account: string;
  tokenProgram: string;
  token: Token;
  amount: string;
  /** Where the money goes: the asset it came in as and the wallet that paid it. */
  backTo: string;
  recipient: string;
  dry: boolean;
};

/** Bridges the intermediary's balance back. The runner has no flow for an out-operation, so this is the wire format of Aurora's Kamino withdraw scenario. */
export const refundBody = ({ account, tokenProgram, token, amount, backTo, recipient, dry }: Refund): CreateExecutionBody => ({
  version: '1.0',
  type: 'solana',
  outOperation: true,
  dry,
  quote: {
    originAsset: token.assetId,
    destinationAsset: backTo,
    amount,
    recipient,
    swapType: 'EXACT_INPUT',
    slippageTolerance: SLIPPAGE_BPS,
    deadline: quoteDeadline(),
  },
  steps: [
    {
      metadata: { name: 'Transfer to deposit address', description: 'Send the balance to the 1Click bridge' },
      programId: tokenProgram,
      discriminator: '0c', // TransferChecked
      args: [
        { name: 'amount', type: 'u64', value: amount }, // the service overwrites it with quote.amount minus the fee
        { name: 'decimals', type: 'u8', value: token.decimals },
      ],
      accounts: [
        { pubkey: account, isSigner: false, isWritable: true },
        { pubkey: token.contractAddress!, isSigner: false, isWritable: false },
        { pubkey: '{DEPOSIT_ADDRESS}', isSigner: false, isWritable: true },
        { pubkey: '{INTERMEDIARY}', isSigner: true, isWritable: false },
      ],
    },
  ],
  metadata: { title: `Refund ${token.symbol}`, intent: 'connect_anything_refund' },
});

/** A typed amount in atomic units, or null if it is not a positive amount of this token. */
export function toAtomic(amount: string, decimals: number): string | null {
  const parts = /^(\d*)(?:\.(\d*))?$/.exec(amount.trim());
  if (!parts || !(parts[1] || parts[2]) || (parts[2] ?? '').length > decimals) return null;
  const atomic = BigInt(parts[1] + (parts[2] ?? '').padEnd(decimals, '0'));
  return atomic > 0n ? atomic.toString() : null;
}

export function fromAtomic(atomic: string, decimals: number): string {
  const digits = atomic.padStart(decimals + 1, '0');
  const point = digits.length - decimals;
  const fraction = digits.slice(point).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, point)}.${fraction}` : digits.slice(0, point);
}

export const STAGES = ['Signature', 'Deposit', 'Bridge', 'Execution', 'Result'];
export const STAGE_OF: Record<ExecutionStatus, number> = {
  CREATED: 0,
  DEPOSIT_PENDING: 1,
  EXPIRED: 1,
  DEPOSIT_PROCESSING: 2,
  OPERATION_PENDING: 3,
  OPERATION_PROCESSING: 3,
  SUCCESS: 4,
  DEPOSIT_FAILED: 4,
  OPERATION_FAILED: 4,
};

const code = (error: unknown) => (error as { code?: unknown } | null | undefined)?.code;

export const isQuoteMoved = (error: unknown) => code(error) === 'QUOTE_MOVED';

/** What to tell the person, empty when there is nothing to tell. */
export function explain(error: unknown): string {
  if (error instanceof ExecutionCancelledError) return '';
  if (isUserRejection(error)) return 'The request was rejected in the wallet.';
  if (code(error) === 'NO_INTERMEDIARY') return 'Solana is not enabled for this Connect key yet.';
  if (code(error) === 'FEE_EXCEEDS_AMOUNT') return 'The amount does not cover the network fee.';
  if ((error as { status?: unknown } | null | undefined)?.status === 503) return 'Connect has no durable nonce free right now, even after a few tries. Nothing was created, so try again in a minute.';
  const message = error instanceof Error ? error.message : String(error);
  // the status panel says this already, along with what to do next
  return /^execution (DEPOSIT|OPERATION)_FAILED$/.test(message) ? '' : message;
}
