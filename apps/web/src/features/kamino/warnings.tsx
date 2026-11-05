import { Alert } from '../../ui/index.ts';

// What can stop or spoil a repay, one Alert each, with a short title over the exact words. The rescue decides which to
// show, under the same conditions as before the redesign; these only say it.

export function NotRepayable({ why }: { why: string }) {
  return <Alert>{why}</Alert>;
}

export function NoCollateral() {
  return (
    <Alert kind="warning" title="No collateral left">
      This position has no collateral left, so an LTV means nothing here and the amount is the whole debt.
    </Alert>
  );
}

/** `ltv`: the position's LTV as the page writes it. */
export function NothingToRepay({ ltv }: { ltv: string }) {
  return (
    <Alert title="Already at the target">
      At {ltv} this position is already at or under that target, so there is nothing to repay. You can still enter an amount of your own.
    </Alert>
  );
}

/** `owed`: what the debt the recipe repays comes to, in dollars. `lowest`: the LTV once all of it is repaid, if there is one. */
export function ShortOfTarget({ symbol, owed, lowest }: { symbol: string; owed: string; lowest?: string }) {
  return (
    <Alert kind="warning" title={`${symbol} alone cannot reach the target`}>
      {symbol} is only {owed} of what this position owes, and this recipe repays nothing else, so the target is out of reach{lowest && `: repaying all of it brings the LTV to ${lowest}`}.
    </Alert>
  );
}

/** `owed`: the other debts, as "USDT $1,400.00". */
export function OtherDebts({ owed }: { owed: string }) {
  return <Alert title="Other debts stay">This position also owes {owed}, which this recipe does not repay.</Alert>;
}

export function TargetPastLiquidation({ liquidation }: { liquidation: string }) {
  return (
    <Alert kind="warning" title="Target at or past liquidation">
      That target is at or past the liquidation LTV of {liquidation}, so the position could be liquidated even after it gets there.
    </Alert>
  );
}

/** `estimate` and `limit`: compute units, written out. */
export function OverComputeLimit({ estimate, limit }: { estimate: string; limit: string }) {
  return (
    <Alert kind="warning" title="Likely over the compute limit">
      This repay would take about {estimate} compute units by estimate, over the roughly {limit} Connect allows, so it is likely to fail on Solana. The money would then stay with your intermediary.
    </Alert>
  );
}

export function AtLiquidation() {
  return (
    <Alert kind="warning" title="Liquidation can happen at any moment">
      This position is at or past its liquidation LTV, so it can be liquidated before the repay lands.
    </Alert>
  );
}
