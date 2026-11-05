import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { CU_LIMIT, estimateCu, ltvAfter, rescuable, rescueAmount, rescueRecipe, targetFrom, type Obligation } from '@connect-anything/kamino-rescue';
import { fromAtomic } from '../../connect.ts';
import { Execute } from '../run/execute.tsx';
import { toSolanaRecipe, type StoredRecipe } from '../../recipe.ts';
import { Failure, FetchError, useJson } from '../../ui.tsx';
import { AddressInput, Button, Card, ChainIcon, cn } from '../../ui/index.ts';
import { BeforeAfter, ReadingAgain } from './BeforeAfter.tsx';
import { BeforeYouPay } from './BeforeYouPay.tsx';
import { ForkCheckCard } from './ForkCheck.tsx';
import { dollars, listed, ltvOf, percent, risk } from './format.ts';
import { COLUMNS, HowItWorks, LEFT, NoPositions, ReadingPositions, RunColumn, RunPlaceholder, WatcherBanner } from './layout.tsx';
import { OpenInBuilder } from './OpenInBuilder.tsx';
import { PositionCard } from './PositionCard.tsx';
import { PositionList } from './PositionList.tsx';
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

function Position({ obligation, url, onBusy }: { obligation: Obligation; url: string; onBusy: (busy: boolean) => void }) {
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
  const presets = [
    { label: 'Safe (−10 pts)', value: String(Math.max(Math.floor(position.ltv * 100) - 10, 0)) },
    { label: '−20 pts', value: String(Math.max(Math.floor(position.ltv * 100) - 20, 0)) },
    { label: 'Repay all', value: '0' },
  ];

  const outcome =
    debt &&
    ((spendable: string) => {
      const after = ltvAfter(position, debt, spendable);
      const surplus = BigInt(spendable) - BigInt(debt.amount);
      return (
        <>
          <Quoted spendable={spendable} onQuote={setQuoted} />
          <dt>It repays</dt>
          <dd>
            {fromAtomic(surplus > 0n ? debt.amount : spendable, debt.decimals)} {debt.symbol}
          </dd>
          {after !== null && (
            <>
              <dt>LTV after, at today's prices</dt>
              <dd>
                {percent(after)}
                {t !== null && after > t && !amount?.short && ', over the target. The fee comes out of what is delivered, so reaching it takes a little more than the amount worked out above.'}
              </dd>
            </>
          )}
          {surplus > 0n && (
            <>
              <dt>Surplus</dt>
              <dd>
                {fromAtomic(surplus.toString(), debt.decimals)} {debt.symbol} stays with your intermediary, and Refund takes it back
              </dd>
            </>
          )}
        </>
      );
    });

  return (
    <>
      <div className={cn(LEFT, 'flex flex-col gap-6')}>
        {reread.loading && <ReadingAgain compact={!!latest} />}
        {reread.error && <Failure error={reread.error} retry={reread.retry} />}
        {latest && <BeforeAfter before={obligation} after={latest} reading={reread.loading} onReadAgain={reread.retry} />}

        <PositionCard position={position} target={debt ? t : null} after={landing}>
          {why && !ready.current && <NotRepayable why={why} />}

          {debt && (
            <div className="flex flex-col gap-5 border-t border-border pt-6">
              <TargetLtv
                value={target}
                onChange={setTarget}
                fraction={t}
                now={position.collateralUsd > 0 ? position.ltv : undefined}
                liquidation={position.collateralUsd > 0 ? position.liquidationLtv : undefined}
                presets={presets}
                disabled={exec.isBusy}
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
              <BeforeYouPay atLiquidation={position.collateralUsd > 0 && position.ltv >= position.liquidationLtv} />
            </div>
          )}
        </PositionCard>
      </div>

      <RunColumn>
        {ready.current ? (
          <Execute exec={exec} recipe={ready.current.recipe} stored={ready.current.stored} suggested={suggested} outcome={outcome} closed={why} />
        ) : (
          <RunPlaceholder kind="closed" />
        )}
      </RunColumn>

      {/* under the position on a wide screen, after the payment on a phone */}
      {debt && ready.current && (
        <div className={LEFT}>
          <ForkCheckCard
            check={fork.check}
            amount={fork.amount && `${fromAtomic(fork.amount, debt.decimals)} ${debt.symbol}`}
            steps={ready.current.stored.steps.map(step => step.ixName)}
            onRetry={fork.retry}
            action={<OpenInBuilder stored={ready.current.stored} />}
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
      {found.error && !badAddress && <Failure error={found.error} retry={found.retry} />}
      {obligations?.length === 0 && <NoPositions />}
      {ranked && ranked.length > 0 && (
        <div className={COLUMNS}>
          {ranked.length > 1 && (
            <div className={LEFT}>
              <PositionList positions={ranked} chosen={position?.address} disabled={busy} onChoose={setChosen} />
            </div>
          )}
          {position && url ? (
            <Position key={position.address} obligation={position} url={url} onBusy={setBusy} />
          ) : (
            <RunColumn>
              <RunPlaceholder kind="choose" />
            </RunColumn>
          )}
        </div>
      )}
    </div>
  );
}
