import type { Obligation, ObligationRow } from '@connect-anything/kamino-rescue';
import { KAMINO_RECORDED } from './fixtures.ts';

// GET /api/kamino/:wallet. The recorded answer has two real positions, and neither owes USDC, which is all the rescue
// repays. So the other variants take the recorded position on the main market and change what it holds and owes, with
// real main-market accounts: the USDC reserve and its vault, and the obligations of the klend-repay fixtures.

export const RECORDED_WALLET: string = KAMINO_RECORDED.wallet;
const recorded: Obligation[] = KAMINO_RECORDED.obligations;
/** cbBTC against USDT on the main market. */
export const RECORDED_USDT = recorded.find(({ address }) => address === 'GoD6qy7kDpJQgkV5cZqdXtJmmjGhNvLzmdJNofjMCCN8')!;
/** PRIME against CASH (Token-2022, with a debt farm) on another market. */
export const RECORDED_CASH = recorded.find(({ address }) => address === 'PfqP2R8NB8gNjegeNrsjTVv4epj3WqcH8S58QQL5UwH')!;

const MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const cbBTC = RECORDED_USDT.deposits[0];

const row = (reserve: string, mint: string, symbol: string, decimals: number, usd: number, price: number, extra: Partial<ObligationRow> = {}): ObligationRow => ({
  ...cbBTC,
  reserve,
  mint,
  symbol,
  decimals,
  amount: String(Math.round((usd / price) * 10 ** decimals)),
  usd,
  ...extra,
});

/** A USDC debt on the main market's USDC reserve. */
const usdc = (usd: number, extra: Partial<ObligationRow> = {}) =>
  row('D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 6, usd, 1, { supplyVault: 'Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6', ...extra });
const usdt = (usd: number): ObligationRow => ({ ...RECORDED_USDT.borrows[0], amount: String(Math.round(usd * 1e6)), usd });
const btc = (usd: number): ObligationRow => ({ ...cbBTC, usd });
const sol = (usd: number) => row('d4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q', 'So11111111111111111111111111111111111111112', 'SOL', 9, usd, 160);

function position(address: string, deposits: ObligationRow[], borrows: ObligationRow[], liquidationLtv = 0.8): Obligation {
  const collateralUsd = deposits.reduce((sum, { usd }) => sum + usd, 0);
  const debtUsd = borrows.reduce((sum, { usd }) => sum + usd, 0);
  return {
    address,
    market: MAIN_MARKET,
    deposits,
    borrows,
    collateralUsd,
    debtUsd,
    adjustedDebtUsd: debtUsd,
    ltv: collateralUsd > 0 ? debtUsd / collateralUsd : 0,
    liquidationLtv,
    refreshRemaining: [...new Set([...deposits, ...borrows].map(({ reserve }) => reserve))],
    repayRemaining: [],
    unjoinedDebtFarms: [],
  };
}

/** LTV 55% against a liquidation LTV of 80%: the default target is 45%, which repays exactly 800 USDC. */
export const HEALTHY = position(RECORDED_USDT.address, [btc(8000)], [usdc(4400)]);
/** The obligation of the klend-repay fixtures: SOL against USDC at 78%, 2 points from liquidation. */
export const NEAR_LIQUIDATION = position('2WAWpMP739iZuLPAwGqx9mwPCAbDurYMPHuaDj28qnMt', [sol(10_000)], [usdc(7800)]);
/** 85%, past the liquidation LTV of 80%. */
export const PAST_LIQUIDATION = position(RECORDED_USDT.address, [btc(8000)], [usdc(6800)]);
/** Liquidated down to nothing on the collateral side: only the USDC debt is left. */
export const NO_COLLATERAL = position(RECORDED_USDT.address, [], [usdc(50)]);
/** Mostly USDT, and the USDC part alone cannot reach the target. */
export const SHORT_OF_USDC = position(RECORDED_USDT.address, [btc(8000)], [usdc(500), usdt(3900)]);
/** USDC and USDT, where USDC alone reaches the target. */
export const ALSO_OWES = position(RECORDED_USDT.address, [btc(8000)], [usdc(3000), usdt(1400)]);
/** The obligation of the six-reserves fixture: six reserves are over Connect's compute budget by the estimate. */
export const SIX_RESERVES = position(
  'GuRKvaiCXP6PK9WZdoPGDBhsUDTWVvLpu8jC8vebz77o',
  [
    btc(2000),
    row('EVbyPKrHG6WBfm4dLxLMJpUDY43cCAcHSpV3KYjKsktW', 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', 'JitoSOL', 9, 2000, 190),
    sol(2000),
    row('4Hyrqb9Mq7y1wkq4YoqHkPdPx3VQyFY3mxMj67naC1Cb', 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', 'mSOL', 9, 1000, 200),
    row('2gc9Dm1eB6UgVYFBUN9bWks6Kes9PbWSaPaa9DqyvEiN', 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', 'bSOL', 9, 1000, 195),
  ],
  [usdc(4400)],
);
const farm = RECORDED_CASH.borrows[0].debtFarm!;
/** A USDC debt with a rewards farm the position never joined. */
export const UNJOINED_FARM: Obligation = { ...position(RECORDED_USDT.address, [btc(8000)], [usdc(4400, { debtFarm: farm })]), unjoinedDebtFarms: [farm] };
/** A position with collateral and nothing owed. */
export const NO_DEBT = position(RECORDED_USDT.address, [btc(8000)], []);
/** HEALTHY after a run that repaid 800 USDC. */
export const REPAID = position(RECORDED_USDT.address, [btc(8000)], [usdc(3600)]);

export const KAMINO = {
  /** The recorded answer as it is: two positions, a CASH and a USDT debt. */
  recorded,
  healthy: [HEALTHY],
  near: [NEAR_LIQUIDATION],
  past: [PAST_LIQUIDATION],
  'no-collateral': [NO_COLLATERAL],
  'not-usdc': [RECORDED_USDT],
  short: [SHORT_OF_USDC],
  'also-owes': [ALSO_OWES],
  'six-reserves': [SIX_RESERVES],
  'unjoined-farm': [UNJOINED_FARM],
  'no-debt': [NO_DEBT],
  repaid: [REPAID],
  three: [HEALTHY, NEAR_LIQUIDATION, RECORDED_CASH],
  none: [],
} satisfies Record<string, Obligation[]>;

export type KaminoVariant = keyof typeof KAMINO | 'error';
