import type { Idl } from '@connect-anything/core';
import { PublicKey } from '@solana/web3.js';
import modern from './klend.idl.json' with { type: 'json' };

export const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
export const FARMS = 'FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_USDC = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
const REPAY = 'repay_obligation_liquidity_v2';

const seedText = (text: string) => ({ kind: 'const', value: [...Buffer.from(text)] });

// No klend IDL anywhere has seeds or fixed addresses: the on-chain one has none and conversion cannot add them. These
// come from the public klend source (handler_repay_obligation_liquidity.rs, seeds.rs), and the comparisons with real
// transactions in the tests are what prove them. Without them these accounts stay form inputs.
const REPAY_NOTES: Record<string, object> = {
  lending_market_authority: { pda: { seeds: [seedText('lma'), { kind: 'account', path: 'repay_accounts.lending_market' }] } },
  'repay_accounts.instruction_sysvar_account': { address: 'Sysvar1nstructions1111111111111111111111111' },
  'farms_accounts.obligation_farm_user_state': {
    pda: {
      seeds: [seedText('user'), { kind: 'account', path: 'reserve_farm_state' }, { kind: 'account', path: 'repay_accounts.obligation' }],
      program: { kind: 'const', value: [...new PublicKey(FARMS).toBuffer()] },
    },
  },
  farms_program: { address: FARMS },
};

function annotated(idl: Idl, ixName: string, notes: Record<string, object>): Idl {
  const copy = structuredClone(idl);
  const visit = (items: any[], prefix: string) => {
    for (const item of items) {
      if (item.accounts) visit(item.accounts, `${prefix}${item.name}.`);
      else Object.assign(item, notes[`${prefix}${item.name}`]);
    }
  };
  visit(copy.instructions.find(ix => ix.name === ixName)!.accounts, '');
  return copy;
}

/** The modern klend IDL with what a repay needs written into it. */
export const KLEND_IDL = annotated(modern as unknown as Idl, REPAY, REPAY_NOTES);

/** One deposit or borrow of a position, as GET /api/kamino gives it. Unset accounts are null. */
export type ObligationRow = {
  reserve: string;
  mint: string;
  symbol: string;
  decimals: number;
  /** In atomic units, as a decimal string. */
  amount: string;
  usd: number;
  tokenProgram: string;
  supplyVault: string;
  debtFarm: string | null;
  pythOracle: string | null;
  switchboardPriceOracle: string | null;
  switchboardTwapOracle: string | null;
  scopePrices: string | null;
};

/** A position, as GET /api/kamino gives it. */
export type Obligation = {
  address: string;
  market: string;
  deposits: ObligationRow[];
  borrows: ObligationRow[];
  collateralUsd: number;
  debtUsd: number;
  /** The debt LTV counts, with the borrow factors. */
  adjustedDebtUsd: number;
  /** adjustedDebtUsd / collateralUsd, and 0 with no collateral. */
  ltv: number;
  liquidationLtv: number;
  /** What refresh_obligation takes after its two named accounts. */
  refreshRemaining: string[];
  /** What repay takes after its named accounts. */
  repayRemaining: string[];
  /** Debt farms of this position with no user state, which a repay cannot run without. */
  unjoinedDebtFarms: string[];
};

/** x = B - t*C clamped to [0, B]: the dollars that bring debt B over collateral C down to the LTV t. */
export const repayUsd = (debtUsd: number, collateralUsd: number, targetLtv: number) => Math.min(Math.max(debtUsd - targetLtv * collateralUsd, 0), debtUsd);

/**
 * Dollars in atomic units, at the price of this debt's own row because USDC is not always worth exactly $1. It rounds up,
 * since one unit short misses the target, after dropping the floating point noise under a millionth of a unit.
 */
export function usdToAtomic(usd: number, debt: Pick<ObligationRow, 'amount' | 'usd'>): string {
  if (!(usd > 0 && debt.usd > 0)) return '0';
  if (usd >= debt.usd) return debt.amount;
  return BigInt(Math.ceil((usd * Number(debt.amount)) / debt.usd - 1e-6)).toString();
}

/**
 * What to repay of this debt for a target LTV. B is the debt the LTV counts, so that the figure agrees with the LTV on
 * the screen when another debt has a borrow factor. `short` says this debt alone cannot reach the target.
 * Known limit: it takes a dollar of this debt to lower B by a dollar. A borrow factor over 100% on it would over-repay,
 * the safe side, and the USDC reserves read so far are at 100%.
 */
export function rescueAmount(obligation: Obligation, debt: ObligationRow, targetLtv: number) {
  const usd = repayUsd(obligation.adjustedDebtUsd, obligation.collateralUsd, targetLtv);
  return { usd: Math.min(usd, debt.usd), atomic: usdToAtomic(usd, debt), short: usd > debt.usd };
}

/** The LTV after this many atomic units reach this debt, at the prices of the read. null with no collateral, where an LTV means nothing. */
export function ltvAfter(obligation: Obligation, debt: ObligationRow, atomic: string): number | null {
  if (!(obligation.collateralUsd > 0)) return null;
  const share = Number(debt.amount) > 0 ? Math.min(Number(atomic) / Number(debt.amount), 1) : 0;
  return Math.max(obligation.adjustedDebtUsd - share * debt.usd, 0) / obligation.collateralUsd;
}

/** The USDC debt to repay, or why nothing can run for this position. By mint, because a symbol is only a name. */
export function rescuable(obligation: Obligation): { debt: ObligationRow; why?: undefined } | { debt?: undefined; why: string } {
  const { borrows, unjoinedDebtFarms } = obligation;
  if (!borrows.length) return { why: 'This position has no debt to repay.' };
  // a market can list one mint in several reserves, and the largest is the one that moves the LTV
  const [debt] = borrows.filter(row => row.mint === USDC).sort((a, b) => b.usd - a.usd);
  if (!debt) return { why: `This position owes ${[...new Set(borrows.map(row => row.symbol))].join(' and ')}. Only a USDC debt can be repaid here for now, so this one is not supported yet.` };
  // joining takes rent, and the intermediary holds only the USDC that was bridged to it
  if (debt.debtFarm && unjoinedDebtFarms.includes(debt.debtFarm)) return { why: 'This USDC debt has a rewards farm that the position never joined, so a repay would fail on Solana. Repaying it is not supported yet.' };
  return { debt };
}

const reservesOf = ({ deposits, borrows }: Obligation) => [...new Map([...deposits, ...borrows].map(row => [row.reserve, row])).values()];

/** About what Connect allows a recipe. */
export const CU_LIMIT = 200_000;

/** The largest figures of the real repays in packages/core/test/fixtures. An estimate, because only a simulation can measure it. */
export const estimateCu = (obligation: Obligation, debt: ObligationRow) => reservesOf(obligation).length * 24_000 + 32_000 + (debt.debtFarm ? 67_000 : 37_000);

const writable = (pubkey: string) => ({ pubkey, isWritable: true, source: 'recipe' as const });

type Step = { program: string; ixName: string; args: Record<string, unknown>; inputs: Record<string, string>; hints: Record<string, string | null>; remaining?: ReturnType<typeof writable>[]; amountArg?: string };

/** refresh_reserve for every reserve, deposits first as the real repays do, then refresh_obligation, then repay v2 of the amount delivered. */
export function rescueSteps(obligation: Obligation, debt: ObligationRow): Step[] {
  const { address, market } = obligation;
  const step = { program: KLEND, inputs: {} };
  return [
    ...reservesOf(obligation).map(row => ({
      ...step,
      ixName: 'refresh_reserve',
      args: {},
      hints: {
        reserve: row.reserve,
        lending_market: market,
        pyth_oracle: row.pythOracle,
        switchboard_price_oracle: row.switchboardPriceOracle,
        switchboard_twap_oracle: row.switchboardTwapOracle,
        scope_prices: row.scopePrices,
      },
    })),
    {
      ...step,
      ixName: 'refresh_obligation',
      args: {},
      hints: { lending_market: market, obligation: address },
      remaining: obligation.refreshRemaining.map(writable),
    },
    {
      ...step,
      ixName: REPAY,
      args: { liquidity_amount: '' },
      amountArg: 'liquidity_amount',
      hints: {
        'repay_accounts.obligation': address,
        'repay_accounts.lending_market': market,
        'repay_accounts.repay_reserve': debt.reserve,
        'repay_accounts.reserve_liquidity_mint': debt.mint,
        'repay_accounts.reserve_destination_liquidity': debt.supplyVault,
        'repay_accounts.token_program': debt.tokenProgram,
        'farms_accounts.reserve_farm_state': debt.debtFarm,
        ...(debt.debtFarm ? {} : { 'farms_accounts.obligation_farm_user_state': null }),
      },
      remaining: obligation.repayRemaining.map(writable),
    },
  ];
}

export const rescueRecipe = (obligation: Obligation, debt: ObligationRow) => ({
  version: 1 as const,
  destination: { chain: 'sol' as const, assetId: SOLANA_USDC, tokenAddress: USDC },
  idls: { [KLEND]: KLEND_IDL },
  steps: rescueSteps(obligation, debt),
});
