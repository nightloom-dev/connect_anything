import { useState } from 'react';
import { Blocks } from 'lucide-react';
import type { SimResult } from '@connect-anything/core';
import { targetFrom, type Obligation, type ObligationRow } from '@connect-anything/kamino-rescue';
import { BeforeAfter, ReadingAgain } from '../../features/kamino/BeforeAfter.tsx';
import { BeforeYouPay } from '../../features/kamino/BeforeYouPay.tsx';
import { ForkCheckCard } from '../../features/kamino/ForkCheck.tsx';
import { HowItWorks, NoPositions, ReadingPositions, RunPlaceholder, WatcherBanner } from '../../features/kamino/layout.tsx';
import { PositionCard } from '../../features/kamino/PositionCard.tsx';
import { PositionList } from '../../features/kamino/PositionList.tsx';
import type { ForkCheck } from '../../features/kamino/simulate.ts';
import { RepaySummary, TargetLtv } from '../../features/kamino/TargetLtv.tsx';
import { AtLiquidation, NoCollateral, NotRepayable, NothingToRepay, OtherDebts, OverComputeLimit, ShortOfTarget, TargetPastLiquidation } from '../../features/kamino/warnings.tsx';
import { Failure } from '../../ui.tsx';
import { AddressInput, Button, toast } from '../../ui/index.ts';
import { Demo, DemoGrid } from './kit.tsx';
import type { DevSection } from './types.ts';

// /kamino on fake positions: the parts of the page in each of their states. Nothing here is read from Solana.

const row = (symbol: string, decimals: number, usd: number, price: number): ObligationRow => ({
  reserve: `fake-reserve-${symbol}`,
  mint: `fake-mint-${symbol}`,
  symbol,
  decimals,
  amount: String(Math.round((usd / price) * 10 ** decimals)),
  usd,
  tokenProgram: 'fake-token-program',
  supplyVault: `fake-vault-${symbol}`,
  debtFarm: null,
  pythOracle: null,
  switchboardPriceOracle: null,
  switchboardTwapOracle: null,
  scopePrices: null,
});

function position(address: string, deposits: ObligationRow[], borrows: ObligationRow[], liquidationLtv = 0.8): Obligation {
  const collateralUsd = deposits.reduce((sum, { usd }) => sum + usd, 0);
  const debtUsd = borrows.reduce((sum, { usd }) => sum + usd, 0);
  return {
    address,
    market: 'fake-market',
    deposits,
    borrows,
    collateralUsd,
    debtUsd,
    adjustedDebtUsd: debtUsd,
    ltv: collateralUsd > 0 ? debtUsd / collateralUsd : 0,
    liquidationLtv,
    refreshRemaining: [],
    repayRemaining: [],
    unjoinedDebtFarms: [],
  };
}

const SAFE = position('DemoSafePosition111111111111111111111111111', [row('cbBTC', 8, 8000, 84_000)], [row('USDC', 6, 4400, 1)]);
const WARNING = position('DemoWarnPosition111111111111111111111111111', [row('SOL', 9, 10_000, 160)], [row('USDC', 6, 7600, 1)]);
const DANGER = position('DemoPastPosition111111111111111111111111111', [row('SOL', 9, 6000, 160), row('JitoSOL', 9, 2000, 190)], [row('USDC', 6, 6800, 1)]);
const NO_COLLATERAL = position('DemoNoCollateral111111111111111111111111111', [], [row('USDC', 6, 50, 1)]);
const REPAID = position(SAFE.address, SAFE.deposits, [row('USDC', 6, 3600, 1)]);

const STEPS = ['refresh_reserve', 'refresh_reserve', 'refresh_obligation', 'repay_obligation_liquidity_v2'];
const OK: SimResult = { verdict: 'ok', computeUnits: 115_948, txBytes: 934, logs: [], warnings: [] };
const WARN: SimResult = { verdict: 'warn', computeUnits: 250_028, txBytes: 1134, logs: [], warnings: ['CU 250.0k > 200k'] };
const FAIL: SimResult = {
  verdict: 'fail',
  computeUnits: 70_330,
  txBytes: 966,
  logs: [],
  warnings: [],
  error: { instructionIndex: 3, code: 2001, name: 'ConstraintHasOne', message: 'Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation)' },
};

const nowhere = () => toast('In the gallery this goes nowhere.');

/** Looks like Open in builder, which would hand a recipe to the builder; here there is none. */
const OpenInBuilderLookalike = () => (
  <Button size="sm" icon={<Blocks />} onClick={nowhere}>
    Open in builder
  </Button>
);

/** The target LTV with its own state, as the rescue keeps it. */
function TargetDemo({ of, initial, disabled = false }: { of: Obligation; initial: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  const points = (gap: number) => String(Math.max(Math.floor(of.ltv * 100) - gap, 0));
  return (
    <TargetLtv
      value={value}
      onChange={setValue}
      fraction={targetFrom(value)}
      now={of.collateralUsd > 0 ? of.ltv : undefined}
      liquidation={of.collateralUsd > 0 ? of.liquidationLtv : undefined}
      presets={[
        { label: 'Safe (−10 pts)', value: points(10) },
        { label: '−20 pts', value: points(20) },
        { label: 'Repay all', value: '0' },
      ]}
      disabled={disabled}
    />
  );
}

function Positions() {
  return (
    <DemoGrid>
      <Demo title="Safe: 25 points from liquidation, with a target">
        <PositionCard position={SAFE} target={0.45} />
      </Demo>
      <Demo title="Warning: under 10 points from liquidation">
        <PositionCard position={WARNING} target={0.66} />
      </Demo>
      <Demo title="Danger: past liquidation">
        <PositionCard position={DANGER} target={0.75} />
      </Demo>
      <Demo title="No collateral left: no bar">
        <PositionCard position={NO_COLLATERAL} target={0} />
      </Demo>
      <Demo title="With a quote: the bar moves to where the LTV lands" wide>
        <PositionCard position={SAFE} target={0.45} after={0.4532} />
      </Demo>
      <Demo title="The whole card, as /kamino shows it" wide>
        <PositionCard position={SAFE} target={0.45}>
          <div className="flex flex-col gap-5 border-t border-border pt-6">
            <TargetDemo of={SAFE} initial="45" />
            <RepaySummary usd="$800.00" amount="800" symbol="USDC" />
            <BeforeYouPay atLiquidation={false} />
          </div>
        </PositionCard>
      </Demo>
    </DemoGrid>
  );
}

function List() {
  return (
    <DemoGrid>
      <Demo title="Three positions, riskiest first, one chosen">
        <PositionList positions={[WARNING, DANGER, SAFE].sort((a, b) => b.ltv / b.liquidationLtv - a.ltv / a.liquidationLtv)} chosen={WARNING.address} onChoose={nowhere} />
      </Demo>
      <Demo title="While a run is busy">
        <PositionList positions={[DANGER, SAFE]} chosen={SAFE.address} disabled onChoose={nowhere} />
      </Demo>
    </DemoGrid>
  );
}

function Target() {
  return (
    <DemoGrid>
      <Demo title="A preset chosen">
        <TargetDemo of={SAFE} initial="45" />
      </Demo>
      <Demo title="A target typed in">
        <TargetDemo of={SAFE} initial="50" />
      </Demo>
      <Demo title="Not a target">
        <TargetDemo of={SAFE} initial="abc" />
      </Demo>
      <Demo title="Near liquidation: the slider turns amber, then red">
        <TargetDemo of={WARNING} initial="74" />
      </Demo>
      <Demo title="While a run is busy">
        <TargetDemo of={SAFE} initial="45" disabled />
      </Demo>
      <Demo title="No collateral: Repay all is the only preset">
        <TargetDemo of={NO_COLLATERAL} initial="0" />
      </Demo>
      <Demo title="The amount" wide>
        <RepaySummary usd="$800.00" amount="800" symbol="USDC" />
      </Demo>
    </DemoGrid>
  );
}

function Warnings() {
  return (
    <DemoGrid>
      <Demo title="Not repayable here">
        <NotRepayable why="This position owes USDT. Only a USDC debt can be repaid here for now, so this one is not supported yet." />
      </Demo>
      <Demo title="Already at the target">
        <NothingToRepay ltv="55.00%" />
      </Demo>
      <Demo title="Short of the target">
        <ShortOfTarget symbol="USDC" owed="$500.00" lowest="48.75%" />
      </Demo>
      <Demo title="Debt not in USDC alongside">
        <OtherDebts owed="USDT $1,400.00" />
      </Demo>
      <Demo title="No collateral">
        <NoCollateral />
      </Demo>
      <Demo title="Target past liquidation">
        <TargetPastLiquidation liquidation="80.00%" />
      </Demo>
      <Demo title="Over the compute limit">
        <OverComputeLimit estimate="213,000" limit="200,000" />
      </Demo>
      <Demo title="At liquidation already">
        <AtLiquidation />
      </Demo>
      <Demo title="Before you pay">
        <BeforeYouPay atLiquidation={false} />
      </Demo>
      <Demo title="Before you pay, at liquidation: Why? says so too">
        <BeforeYouPay atLiquidation />
      </Demo>
    </DemoGrid>
  );
}

function DeepLink() {
  return (
    <DemoGrid>
      <Demo title="The position is open below">
        <WatcherBanner obligation={WARNING.address} />
      </Demo>
      <Demo title="The wallet no longer has it">
        <WatcherBanner obligation={WARNING.address} missing />
      </Demo>
    </DemoGrid>
  );
}

function Fork() {
  const card = (check: ForkCheck, amount = '800 USDC') => (
    <ForkCheckCard check={check} amount={amount} steps={STEPS} onRetry={nowhere} action={<OpenInBuilderLookalike />} />
  );
  return (
    <DemoGrid>
      <Demo title="Passed">{card({ kind: 'done', result: OK })}</Demo>
      <Demo title="Passed with warnings">{card({ kind: 'done', result: WARN })}</Demo>
      <Demo title="Failed">{card({ kind: 'done', result: FAIL })}</Demo>
      <Demo title="Simulator offline (503)">{card({ kind: 'offline', message: 'The simulator is offline: SIM_URL is not set' })}</Demo>
      <Demo title="Checking, the first time">{card({ kind: 'checking' })}</Demo>
      <Demo title="Checking a new amount, the last answer dimmed">{card({ kind: 'checking', last: OK }, '400 USDC')}</Demo>
      <Demo title="No answer">{card({ kind: 'failed', message: 'The server could not be reached. Check your connection and try again.' })}</Demo>
      <Demo title="Nothing to simulate">{card({ kind: 'idle' })}</Demo>
    </DemoGrid>
  );
}

function After() {
  return (
    <DemoGrid>
      <Demo title="Before → after: 800 USDC repaid">
        <BeforeAfter before={SAFE} after={REPAID} onReadAgain={nowhere} />
      </Demo>
      <Demo title="Reading again">
        <div className="flex flex-col gap-6">
          <ReadingAgain compact />
          <BeforeAfter before={SAFE} after={REPAID} reading onReadAgain={nowhere} />
        </div>
      </Demo>
      <Demo title="Read again after the run, before any answer">
        <ReadingAgain />
      </Demo>
      <Demo title="Nothing changed yet">
        <BeforeAfter before={SAFE} after={SAFE} onReadAgain={nowhere} />
      </Demo>
    </DemoGrid>
  );
}

function Empty() {
  return (
    <DemoGrid>
      <Demo title="No wallet read yet" wide>
        <HowItWorks />
      </Demo>
      <Demo title="Several positions, none chosen">
        <RunPlaceholder kind="choose" />
      </Demo>
      <Demo title="A position this page cannot repay">
        <RunPlaceholder kind="closed" />
      </Demo>
      <Demo title="No open positions" wide>
        <NoPositions />
      </Demo>
      <Demo title="Reading the positions of a wallet" wide>
        <ReadingPositions />
      </Demo>
    </DemoGrid>
  );
}

function Errors() {
  return (
    <DemoGrid>
      <Demo title="Not a Solana address, as the server answers it">
        <AddressInput aria-label="Wallet address (gallery)" size="lg" value="0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" onChange={() => {}} error={<span>That is not a Solana address.</span>} />
      </Demo>
      <Demo title="The read failed">
        <Failure error={new Error('Could not read the position from Solana, try again')} retry={nowhere} />
      </Demo>
    </DemoGrid>
  );
}

export const order = 40;

export const sections: DevSection[] = [
  { id: 'kamino-positions', title: 'Kamino: positions', description: 'Safe, warning and danger, no collateral, a quote that moves the bar.', render: () => <Positions /> },
  { id: 'kamino-list', title: 'Kamino: choosing a position', render: () => <List /> },
  { id: 'kamino-target', title: 'Kamino: target LTV', description: 'The field, the slider and the presets set one target. Try them.', render: () => <Target /> },
  { id: 'kamino-warnings', title: 'Kamino: warnings', description: 'One alert each, a short title over the exact words.', render: () => <Warnings /> },
  { id: 'kamino-deeplink', title: 'Kamino: watcher deep link', description: '/kamino?wallet=…&obligation=… from a Telegram alert.', render: () => <DeepLink /> },
  { id: 'kamino-fork', title: 'Kamino: checked on a fork', description: 'POST /api/simulate of the repay. It never holds up the payment.', render: () => <Fork /> },
  { id: 'kamino-after', title: 'Kamino: after the run', render: () => <After /> },
  { id: 'kamino-empty', title: 'Kamino: empty and loading', render: () => <Empty /> },
  { id: 'kamino-errors', title: 'Kamino: errors', render: () => <Errors /> },
];
