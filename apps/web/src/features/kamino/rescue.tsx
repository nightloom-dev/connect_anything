import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { CU_LIMIT, estimateCu, ltvAfter, rescuable, rescueAmount, rescueRecipe, targetFrom, type Obligation } from '@connect-anything/kamino-rescue';
import { fromAtomic, legs } from '../../connect.ts';
import { Execute } from '../run/execute.tsx';
import { FigureRow } from '../run/parts.tsx';
import { toSolanaRecipe, type StoredRecipe } from '../../recipe.ts';
import { Failure, FetchError, useJson } from '../../ui.tsx';
import { AddressInput, Button, Card, ChainIcon, cn } from '../../ui/index.ts';
import { BeforeAfter, ReadingAgain, RepayMore } from './BeforeAfter.tsx';
import { BeforeYouPay } from './BeforeYouPay.tsx';
import { ForkCheckCard } from './ForkCheck.tsx';
import { besideRetry, dollars, listed, ltvOf, percent, risk, targetPercent } from './format.ts';
import { COLUMNS, HowItWorks, LEFT, NoPositions, ReadingPositions, RunColumn, RunPlaceholder, WatcherBanner } from './layout.tsx';
import { OpenInBuilder } from './OpenInBuilder.tsx';
import { PayBar, type Bar } from './PayBar.tsx';
import { PositionCard } from './PositionCard.tsx';
import { PositionList } from './PositionList.tsx';
import { targetPresets } from './presets.ts';
import { useForkCheck } from './simulate.ts';
import { RepaySummary, TargetLtv } from './TargetLtv.tsx';
import { AtLiquidation, NoCollateral, NotRepayable, NothingToRepay, OtherDebts, OverComputeLimit, ShortOfTarget, TargetPastLiquidation } from './warnings.tsx';

type Positions = { obligations: Obligation[] };

/** Renders nothing: it hands the position the amount a quote delivers, so that the HealthBar shows where the LTV lands. */
function Quoted({ spendable, onQuote }: { spendable: string; onQuote: (spendable: string | undefined) => void }) {
  useEffect(() => {
    onQuote(spendable);
    return () => onQuote(undefined);
  }, [spendable]);
  return null;
}

type PositionProps = {
  obligation: Obligation;
  url: string;
  /** The id of the payment card, for the pay bar to lead to. */
  payment: string;
  onBusy: (busy: boolean) => void;
  /** What the pay bar under the page says, or undefined while it has nothing to lead to. */
  onBar: (bar: Bar | undefined) => void;
};

function Position({ obligation, url, payment, onBusy, onBar }: PositionProps) {
  const exec = useExecution();
  useEffect(() => onBusy(exec.isBusy), [exec.isBusy]);

  const [target, setTarget] = useState(() => String(Math.max(Math.floor(obligation.ltv * 100) - 10, 0)));
  const reread = useJson<Positions>(exec.status === 'SUCCESS' ? url : null);
  const [latest, setLatest] = useState<Obligation>();
  useEffect(() => {
    // an obligation with nothing left in it is no longer listed
    if (reread.data) setLatest(reread.data.obligations.find(({ address }) => address === obligation.address) ?? { ...obligation, deposits: [], borrows: [], collateralUsd: 0, debtUsd: 0, adjustedDebtUsd: 0, ltv: 0 });
  }, [reread.data]);
  const position = latest ?? obligation;

  const { debt, why } = rescuable(position);
  const t = targetFrom(target);
  const amount = debt && t !== null ? rescueAmount(position, debt, t) : undefined;
  const suggested = debt && amount && amount.atomic !== '0' ? fromAtomic(amount.atomic, debt.decimals) : undefined;
  const others = position.borrows.filter(row => row !== debt);
  const lowest = debt && ltvAfter(position, debt, debt.amount);

  // A new recipe drops the quote and the failure on the screen, so there is one only when the accounts change. The last
  // one stays once the debt is gone, because the screen still has to offer the Refund of a surplus.
  const ready = useRef<{ stored: StoredRecipe; recipe: SolanaRecipe }>(undefined);
  if (debt) {
    const stored = rescueRecipe(position, debt);
    if (JSON.stringify(stored.steps) !== JSON.stringify(ready.current?.stored.steps)) {
      ready.current = { stored, recipe: { ...toSolanaRecipe(stored), id: 'kamino-rescue', intent: 'kamino_rescue', title: `Repay Kamino debt of ${position.address}` } };
    }
  }

  // For the screen only, none of it reaches the run: where the LTV lands with the amount the run card's quote delivers,
  // the repay simulated on a fork, and the presets of the target, which type a target in as the field does.
  const [quoted, setQuoted] = useState<string>();
  const landing = debt && quoted ? ltvAfter(position, debt, quoted) : null;
  const fork = useForkCheck(debt ? ready.current?.stored : undefined, amount && amount.atomic !== '0' ? amount.atomic : undefined);
  const presets = targetPresets(position);

  // For the screen only as well: once a repay succeeded, the page shows what it did, and the target folds away behind
  // Repay more, so that nothing on it reads as a second payment to make. With no target on the screen the run card is
  // suggested no amount either. Repay more opens the target for this run; the next repay that succeeds folds it again.
  // A Refund that went through repaid nothing, so the target stays open after one.
  const [reopened, setReopened] = useState<string>();
  const done = exec.status === 'SUCCESS' && !legs(exec.execution?.quote).isRefund && reopened !== exec.executionId;
  const field = useRef<HTMLInputElement>(null);
  const repayMore = () => {
    setReopened(exec.executionId);
    // a target the run reached asks for nothing more, so the field opens at Safe for the position as it is now, as a
    // press of Safe would type it in; a target not reached yet stays
    if (!amount || amount.atomic === '0') setTarget(presets[0].value);
  };
  useEffect(() => {
    if (reopened) field.current?.focus();
  }, [reopened]);

  // On a phone the payment is a long way down, and Rescue draws a bar at the bottom of the screen that leads to it.
  const bar: Bar | undefined = debt && ready.current && !done && suggested ? { amount: suggested, symbol: debt.symbol, busy: exec.isBusy } : undefined;
  useEffect(() => onBar(bar), [bar?.amount, bar?.symbol, bar?.busy]);
  useEffect(() => () => onBar(undefined), []);

  const outcome =
    debt &&
    ((spendable: string) => {
      const after = ltvAfter(position, debt, spendable);
      const surplus = BigInt(spendable) - BigInt(debt.amount);
      return (
        <>
          <Quoted spendable={spendable} onQuote={setQuoted} />
          <FigureRow term="It repays">
            {fromAtomic(surplus > 0n ? debt.amount : spendable, debt.decimals)} {debt.symbol}
          </FigureRow>
          {after !== null && (
            <FigureRow term="LTV after, at today's prices" note={t !== null && after > t && !amount?.short && 'The fee comes out of what is delivered.'}>
              {percent(after)}
              {t !== null && after > t && !amount?.short && ` (target ${targetPercent(t)})`}
            </FigureRow>
          )}
          {surplus > 0n && (
            <FigureRow term="Surplus" note="It stays with your intermediary, and Refund takes it back.">
              {fromAtomic(surplus.toString(), debt.decimals)} {debt.symbol}
            </FigureRow>
          )}
        </>
      );
    });

  return (
    <>
      <div className={cn(LEFT, 'flex flex-col gap-6')}>
        {reread.loading && <ReadingAgain compact={!!latest} />}
        {reread.error && <Failure error={new Error(besideRetry(reread.error.message))} retry={reread.retry} />}
        {latest && <BeforeAfter before={obligation} after={latest} reading={reread.loading} onReadAgain={reread.retry} />}

        {/* once folded away, the target leaves the LTV bar too */}
        <PositionCard position={position} target={debt && !done ? t : null} after={done ? null : landing}>
          {why && !ready.current && <NotRepayable why={why} />}

          {debt && done && <RepayMore onRepayMore={repayMore} disabled={reread.loading} />}
          {debt && !done && (
            <div className="flex flex-col gap-5 border-t border-border pt-6">
              <TargetLtv
                value={target}
                onChange={setTarget}
                fraction={t}
                now={position.collateralUsd > 0 ? position.ltv : undefined}
                liquidation={position.collateralUsd > 0 ? position.liquidationLtv : undefined}
                presets={presets}
                disabled={exec.isBusy}
                fieldRef={field}
              />
              {amount && amount.atomic !== '0' && <RepaySummary usd={dollars(amount.usd)} amount={suggested!} symbol={debt.symbol} />}
              <div className="flex flex-col gap-3 empty:hidden">
                {position.collateralUsd > 0 && position.ltv >= position.liquidationLtv && <AtLiquidation />}
                {position.collateralUsd === 0 && <NoCollateral />}
                {amount && amount.atomic === '0' && <NothingToRepay ltv={ltvOf(position)} />}
                {amount?.short && <ShortOfTarget symbol={debt.symbol} owed={dollars(debt.usd)} lowest={lowest != null ? percent(lowest) : undefined} />}
                {others.length > 0 && !amount?.short && <OtherDebts owed={listed(others)} />}
                {t !== null && position.collateralUsd > 0 && t >= position.liquidationLtv && <TargetPastLiquidation liquidation={percent(position.liquidationLtv)} />}
                {estimateCu(position, debt) > CU_LIMIT && <OverComputeLimit estimate={estimateCu(position, debt).toLocaleString('en-US')} limit={CU_LIMIT.toLocaleString('en-US')} />}
              </div>
              <BeforeYouPay />
            </div>
          )}
        </PositionCard>
      </div>

      <RunColumn id={payment}>
        {ready.current ? (
          <Execute exec={exec} recipe={ready.current.recipe} stored={ready.current.stored} suggested={done ? undefined : suggested} outcome={outcome} closed={why} />
        ) : (
          <RunPlaceholder kind="closed" />
        )}
      </RunColumn>

      {/* under the position on a wide screen, after the payment on a phone; it checks the next payment, so not after a run */}
      {debt && ready.current && !done && (
        <div className={LEFT}>
          <ForkCheckCard
            check={fork.check}
            amount={fork.amount && `${fromAtomic(fork.amount, debt.decimals)} ${debt.symbol}`}
            steps={ready.current.stored.steps.map(step => step.ixName)}
            onRetry={fork.retry}
            action={<OpenInBuilder stored={ready.current.stored} disabled={exec.isBusy} />}
          />
        </div>
      )}
    </>
  );
}

export function Rescue() {
  // the watcher's alert links here with both, so one tap opens the position it rang about
  const linked = new URLSearchParams(location.search);
  const [typed, setTyped] = useState(linked.get('wallet') ?? '');
  const [wallet, setWallet] = useState(linked.get('wallet') ?? '');
  const [chosen, setChosen] = useState(linked.get('obligation') ?? '');
  const [busy, setBusy] = useState(false);
  const [bar, setBar] = useState<Bar>();
  const payment = useId();
  const url = wallet ? `/api/kamino/${encodeURIComponent(wallet)}` : null;
  const found = useJson<Positions>(url);
  const obligations = found.data?.obligations;
  const position = obligations?.length === 1 ? obligations[0] : obligations?.find(({ address }) => address === chosen);
  const badAddress = found.error instanceof FetchError && found.error.status === 400;

  const read = (event: FormEvent) => {
    event.preventDefault();
    if (typed.trim() === wallet) found.retry();
    setWallet(typed.trim());
    setChosen('');
  };

  // For the screen only: the position a watcher alert named, while it is the one asked for, and the riskiest position first.
  const field = useId();
  const alerted = linked.get('obligation') && linked.get('wallet') === wallet && linked.get('obligation') === chosen ? chosen : undefined;
  const ranked = obligations && [...obligations].sort((one, other) => risk(other) - risk(one));

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <ChainIcon chain="sol" size={16} />
          Kamino Lend on Solana
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">Repay a Kamino debt</h2>
        <p className="max-w-2xl text-muted">
          Enter the Solana wallet that owns the position. It does not have to be yours: anyone can repay a debt on Kamino, and you pay from an EVM chain with one signature.
        </p>
      </header>

      {alerted && <WatcherBanner obligation={alerted} missing={!!obligations && !obligations.some(({ address }) => address === alerted)} />}

      <Card padding="md">
        <form onSubmit={read} className="flex flex-col gap-2">
          <label htmlFor={field} className="text-sm font-medium text-text">
            Wallet address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <AddressInput
                id={field}
                size="lg"
                placeholder="Solana wallet address"
                value={typed}
                onChange={setTyped}
                disabled={busy}
                error={badAddress ? <span role="alert">That is not a Solana address.</span> : undefined}
              />
            </div>
            <Button type="submit" variant={obligations?.length ? 'secondary' : 'primary'} size="lg" disabled={busy || !typed.trim()}>
              Read positions
            </Button>
          </div>
        </form>
      </Card>

      {(!url || badAddress) && <HowItWorks />}
      {found.loading && <ReadingPositions />}
      {found.error && !badAddress && <Failure error={new Error(besideRetry(found.error.message))} retry={found.retry} />}
      {obligations?.length === 0 && <NoPositions field={field} />}
      {ranked && ranked.length > 0 && (
        <div className={COLUMNS}>
          {ranked.length > 1 && (
            <div className={LEFT}>
              <PositionList positions={ranked} chosen={position?.address} disabled={busy} onChoose={setChosen} />
            </div>
          )}
          {position && url ? (
            <Position key={position.address} obligation={position} url={url} payment={payment} onBusy={setBusy} onBar={setBar} />
          ) : (
            <RunColumn>
              <RunPlaceholder kind="choose" />
            </RunColumn>
          )}
        </div>
      )}
      {/* after the columns, so that it can stick to the bottom of the screen all the way down them */}
      {bar && position && <PayBar to={payment} {...bar} />}
    </div>
  );
}
