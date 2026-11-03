import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { CU_LIMIT, estimateCu, ltvAfter, rescuable, rescueAmount, rescueRecipe, targetFrom, type Obligation, type ObligationRow } from '@connect-anything/kamino-rescue';
import { fromAtomic } from './connect.ts';
import { Execute } from './execute.tsx';
import { toSolanaRecipe, type StoredRecipe } from './recipe.ts';
import { Failure, FetchError, Notice, short, useJson } from './ui.tsx';

type Positions = { obligations: Obligation[] };

const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;
const dollars = (usd: number) => usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const listed = (rows: ObligationRow[]) => rows.map(row => `${row.symbol} ${dollars(row.usd)}`).join(', ') || 'nothing';
const ltvOf = (position: Obligation) => (position.collateralUsd > 0 ? percent(position.ltv) : 'no collateral');

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

  const outcome =
    debt &&
    ((spendable: string) => {
      const after = ltvAfter(position, debt, spendable);
      const surplus = BigInt(spendable) - BigInt(debt.amount);
      return (
        <>
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
      <h3>The position</h3>
      <dl className="figures">
        <dt>Obligation</dt>
        <dd>
          <code>{position.address}</code>
        </dd>
        <dt>LTV</dt>
        <dd>
          {ltvOf(position)}
          {position.collateralUsd > 0 && `, liquidated at ${percent(position.liquidationLtv)}`}
        </dd>
        <dt>Collateral</dt>
        <dd>
          {dollars(position.collateralUsd)}: {listed(position.deposits)}
        </dd>
        <dt>Debt</dt>
        <dd>
          {dollars(position.debtUsd)}: {listed(position.borrows)}
        </dd>
      </dl>
      {reread.loading && <Notice>Reading the position again…</Notice>}
      {reread.error && <Failure error={reread.error} retry={reread.retry} />}
      {latest && (
        <Notice kind="ok">
          After the run the debt is {dollars(latest.debtUsd)}, from {dollars(obligation.debtUsd)}
          {latest.collateralUsd > 0 && obligation.collateralUsd > 0 && `, and the LTV is ${percent(latest.ltv)}, from ${percent(obligation.ltv)}`}. <button onClick={reread.retry}>Read again</button>
        </Notice>
      )}
      {why && !ready.current && <Notice>{why}</Notice>}

      {debt && (
        <>
          <h3>Target LTV</h3>
          <label className="inline">
            Target LTV, % <input inputMode="decimal" value={target} disabled={exec.isBusy} onChange={event => setTarget(event.target.value)} />
          </label>
          {t === null && <p className="hint">Enter a target from 0 to 100.</p>}
          {position.collateralUsd === 0 && <Notice kind="warn">This position has no collateral left, so an LTV means nothing here and the amount is the whole debt.</Notice>}
          {amount && amount.atomic === '0' && (
            <Notice>
              At {ltvOf(position)} this position is already at or under that target, so there is nothing to repay. You can still enter an amount below.
            </Notice>
          )}
          {amount && amount.atomic !== '0' && (
            <p>
              Repay <strong>{dollars(amount.usd)}</strong>, which is{' '}
              <strong>
                {suggested} {debt.symbol}
              </strong>
              .
            </p>
          )}
          {amount?.short && (
            <Notice kind="warn">
              {debt.symbol} is only {dollars(debt.usd)} of what this position owes, and this recipe repays nothing else, so the target is out of reach{lowest != null && `: repaying all of it brings the LTV to ${percent(lowest)}`}.
            </Notice>
          )}
          {others.length > 0 && !amount?.short && <Notice>This position also owes {listed(others)}, which this recipe does not repay.</Notice>}
          {t !== null && position.collateralUsd > 0 && t >= position.liquidationLtv && <Notice kind="warn">That target is at or past the liquidation LTV of {percent(position.liquidationLtv)}, so the position could be liquidated even after it gets there.</Notice>}
          {estimateCu(position, debt) > CU_LIMIT && (
            <Notice kind="warn">
              This repay would take about {estimateCu(position, debt).toLocaleString('en-US')} compute units by estimate, over the roughly {CU_LIMIT.toLocaleString('en-US')} Connect allows, so it is likely to fail on Solana. The money would then stay with your intermediary.
            </Notice>
          )}
          <Notice kind="warn">
            <strong>The position can move before this runs.</strong> After the deposit, execution takes about 150 seconds plus the MPC signature, and the amount is fixed when you sign. In that time prices change, interest accrues, and the position can be liquidated or repaid by someone else, so the LTV you end up with can differ from the target.
            {position.collateralUsd > 0 && position.ltv >= position.liquidationLtv && ' This position is already at its liquidation LTV, so that can happen at any moment.'} If less is owed by then, only what is owed gets repaid, and if nothing is, the run fails. Either way what is not spent stays with your intermediary until Refund takes it back. A repay pays
            off debt and nothing else: the collateral stays with the wallet that owns the position, even if that is not you.
          </Notice>
        </>
      )}

      {ready.current && <Execute exec={exec} recipe={ready.current.recipe} stored={ready.current.stored} suggested={suggested} outcome={outcome} closed={why} />}
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

  return (
    <section>
      <h2>Repay a Kamino debt</h2>
      <p className="hint">Enter the Solana wallet that owns the position. It does not have to be yours: anyone can repay a debt on Kamino, and you pay from an EVM chain with one signature.</p>
      <form className="row" onSubmit={read}>
        <input aria-label="Wallet address" placeholder="Solana wallet address" spellCheck={false} disabled={busy} value={typed} onChange={event => setTyped(event.target.value)} />
        <button className="primary" disabled={busy || !typed.trim()}>
          Read positions
        </button>
      </form>

      {found.loading && <Notice>Reading the positions of this wallet…</Notice>}
      {badAddress && <Notice kind="error">That is not a Solana address.</Notice>}
      {found.error && !badAddress && <Failure error={found.error} retry={found.retry} />}
      {obligations?.length === 0 && <Notice>This wallet has no open positions on Kamino.</Notice>}
      {obligations && obligations.length > 1 && (
        <>
          <p>This wallet has {obligations.length} positions. Choose one.</p>
          <ul className="instructions">
            {obligations.map(item => (
              <li key={item.address}>
                <button className={item.address === position?.address ? 'chosen' : ''} aria-pressed={item.address === position?.address} disabled={busy} onClick={() => setChosen(item.address)}>
                  <strong>LTV {ltvOf(item)}</strong> owes {listed(item.borrows)} against {dollars(item.collateralUsd)} <span className="hint">{short(item.address)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {position && url && <Position key={position.address} obligation={position} url={url} onBusy={setBusy} />}
    </section>
  );
}
