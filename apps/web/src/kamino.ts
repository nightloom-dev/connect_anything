import { EVM_CHAIN_IDS, type ExecutionPlan, type SolanaRecipe } from '@aurora-is-near/intents-connect';
import { prepareSolanaSteps } from '@aurora-is-near/intents-connect-wallet/solana';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const KLEND = new PublicKey('KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD');
const MARKET = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');
const MARKET_AUTHORITY = new PublicKey('9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo');
const RESERVE = new PublicKey('D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const LIQUIDITY_SUPPLY = new PublicKey('Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6');
const CUSDC_MINT = new PublicKey('B8V6WVjPxW1UGwVDfxH2d2r8SyT4cqn7dQRK6XneVa7D');
const SCOPE_ORACLE = new PublicKey('3t4JZcueEzTbVP6kLxXrL3VpWx45jDer4eqysweBchNH');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

export const SOLANA_USDC = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
export const BASE_USDC = {
  assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
};

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map(b => parseInt(b, 16)));
const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isSigner, isWritable });

export function supplySteps(intermediary: string, amount: string) {
  const owner = new PublicKey(intermediary);
  const refresh = new TransactionInstruction({
    programId: KLEND,
    data: Buffer.from(hex('02da8aeb4fc91966')),
    keys: [meta(RESERVE, true), meta(MARKET), meta(KLEND), meta(KLEND), meta(KLEND), meta(SCOPE_ORACLE)],
  });
  const data = Buffer.alloc(16);
  data.set(hex('a9c91e7e06cd6644'));
  data.writeBigUInt64LE(BigInt(amount), 8);
  const deposit = new TransactionInstruction({
    programId: KLEND,
    data,
    keys: [
      meta(owner, false, true), meta(RESERVE, true), meta(MARKET), meta(MARKET_AUTHORITY), meta(USDC_MINT),
      meta(LIQUIDITY_SUPPLY, true), meta(CUSDC_MINT, true),
      meta(getAssociatedTokenAddressSync(USDC_MINT, owner, true), true),
      meta(getAssociatedTokenAddressSync(CUSDC_MINT, owner, true), true),
      meta(TOKEN_PROGRAM), meta(TOKEN_PROGRAM), meta(SYSVAR_INSTRUCTIONS),
    ],
  });
  return prepareSolanaSteps([refresh, deposit], { intermediary });
}

const recipe: SolanaRecipe = {
  id: 'kamino-supply-usdc',
  intent: 'kamino_supply',
  title: 'Supply USDC to Kamino',
  type: 'solana',
  flow: 'bridge-in',
  destination: { chain: 'sol', assetId: SOLANA_USDC, tokenAddress: USDC_MINT.toBase58() },
  buildSteps: ({ intermediary, amount }) => supplySteps(intermediary, amount),
};

export const supplyPlan = (amountAtomic: string): ExecutionPlan => ({
  recipe,
  params: undefined,
  feeStrategy: { kind: 'threeRound', amountReserveBps: 25 },
  quote: {
    originAsset: BASE_USDC.assetId,
    destinationAsset: SOLANA_USDC,
    amount: amountAtomic,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    deadline: new Date(Date.now() + 15 * 60_000).toISOString(),
  },
  originChain: 'base',
  originToken: { contractAddress: BASE_USDC.contractAddress, decimals: BASE_USDC.decimals },
  originChainId: EVM_CHAIN_IDS.base ?? null,
  depositViaWallet: true,
});
