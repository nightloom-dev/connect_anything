import type { TransactionInstruction } from '@solana/web3.js';

// The /simulate contract, kept in step with crates/sim/src/types.rs. fixtures/*.sim.json are the source of truth.
export type SimRequest = {
  /** Base58. In simulation any key stands in for {INTERMEDIARY}. */
  intermediary: string;
  /** Amount in minimal units, as a string. */
  fund: { mint: string; amount: string };
  instructions: {
    programId: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    /** Base64. */
    data: string;
  }[];
  lookupTables?: string[];
  /** Program id to IDL, used to name errors. */
  idls?: Record<string, unknown>;
};

export type SimResult = {
  verdict: 'ok' | 'warn' | 'fail';
  computeUnits: number;
  txBytes: number;
  logs: string[];
  warnings: string[];
  error?: {
    instructionIndex?: number;
    programId?: string;
    code?: number;
    name?: string;
    message: string;
  };
};

export const toSimRequest = (instructions: readonly TransactionInstruction[], ctx: Omit<SimRequest, 'instructions'>): SimRequest => ({
  intermediary: ctx.intermediary,
  fund: ctx.fund,
  instructions: instructions.map(ix => ({
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map(({ pubkey, isSigner, isWritable }) => ({ pubkey: pubkey.toBase58(), isSigner, isWritable })),
    data: ix.data.toString('base64'),
  })),
  lookupTables: ctx.lookupTables,
  idls: ctx.idls,
});
