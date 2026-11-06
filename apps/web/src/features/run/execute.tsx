import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Calculator, Clock, Copy, PenLine, RefreshCw, RotateCcw, Undo2, Wallet } from 'lucide-react';
import { TERMINAL_STATUSES, guards, parseOriginAsset, signIntentsConnectPayload, type Execution, type ExecutionPreview, type ExecutionStep, type SolanaRecipe, type StepsPreview } from '@aurora-is-near/intents-connect';
import { useIntentsConnect, type UseExecutionResult } from '@aurora-is-near/intents-connect/react';
import { useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import type { Idl } from '@connect-anything/core';
import { checkCompat, issueText } from '../../compat.ts';
import { CHAINS, STAGE_OF, bridgeKeeps, bridgePlan, bySymbol, existingOffer, explain, fromAtomic, isQuoteMoved, legs, refundBody, retryPlan, stoppedFollowing, toAtomic, type Balance, type Token, type TokenList } from '../../connect.ts';
import { STAND_IN, buildRecipe, destinationIssue, matchesPublished, runsRecipe, signsOnlyRecipe, takesAmount, type StoredRecipe } from '../../recipe.ts';
import { Failure, Notice, short, useAct, useAsync, useJson } from '../../ui.tsx';
import { Address, Alert, Button, ChainIcon, Checkbox, Skeleton, Spinner, Timeline, TokenIcon, TxLink, chainMeta, copyText, type StageState } from '../../ui/index.ts';
import {
  AMOUNT_INPUT,
  Actions,
  Arrives,
  Block,
  Caption,
  ChainTag,
  ConsentBox,
  DeletedLine,
  DepositBox,
  Details,
  ExecutionSteps,
  ExistingFrame,
  ExplorerLink,
  Facts,
  Figure,
  FigureRow,
  Figures,
  Held,
  IntermediaryLine,
  LONG_LABEL,
  NewPayment,
  NoFigure,
  OptionTile,
  OtherToken,
  PaidFrom,
  Panel,
  PanelArrow,
  PayColumn,
  PhaseCallout,
  QuoteBox,
  Reason,
  RunCard,
  SHARED_COLUMNS,
  SHARED_LEFT,
  SelectPill,
  SpendsRow,
  StatusLine,
  StatusName,
  Swap,
  TokenTag,
  WALLET_PHASES,
  WorkingLine,
} from './parts.tsx';
import { boxFigures, quoteFigures } from './figures.ts';
import { usePublishRunBusy } from './busy.ts';
import { enter, flowOf, progressStages, type Entered } from './progress.ts';
import { IdlCheck, Summary, TrustPanel } from './summary.tsx';
import { BLOCKS_WALLET, BROKE_NOTE, CANCEL_NOTE, DOING, LATE_NOTE, PHASE_TEXT, QUOTING, REFUND_DOING, REFUSED_RESUME, STATUS_WORDS, TIME_NOTE } from './words.ts';

const SOLSCAN = 'https://solscan.io';
// Known limit: these live in this browser, so another browser finds an execution only through the 409 of a second run.
const recentKey = (address: string) => `executions:${address}`;

function recent(address: string): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(recentKey(address)) ?? '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function saveRecent(address: string, ids: string[]) {
  try {
    localStorage.setItem(recentKey(address), JSON.stringify(ids.slice(0, 5)));
  } catch {
    // storage can be off, and then a reload loses only the offer to resume
  }
}

function PublishedCheck({ stored, program }: { stored: StoredRecipe; program: string }) {
  const published = useJson<{ idl: Idl }>(`/api/idl/${program}`);
  if (published.loading) return <IdlCheck state="checking" />;
  if (!published.data) return <IdlCheck state="unknown" />;
  return matchesPublished(stored, program, published.data.idl) ? <IdlCheck state="match" /> : <IdlCheck state="differs" />;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const timeOf = (iso?: string) => {
  const at = iso ? new Date(iso) : undefined;
  return at && Number.isFinite(at.getTime()) ? <time dateTime={at.toISOString()}>{clock.format(at)}</time> : undefined;
};

function Progress({ exec, chain, resumed, unfinished }: { exec: UseExecutionResult; chain: string; resumed: boolean; unfinished: boolean }) {
  const { status, phase, execution, executionId, depositTxHash } = exec;
  // a resume asks the wallet for the deposit only while the execution is CREATED: after that the address is shown instead
  const text = exec.error || (resumed && phase === 'awaiting-deposit' && status !== 'CREATED') ? undefined : PHASE_TEXT[phase];
  const stage = status ? STAGE_OF[status] : -1;
  const flow = flowOf(execution);
  // the EVM side of the execution, for its links: where a bridge-in comes from, and where a Refund goes
  const evmAsset = flow === 'refund' ? execution?.quote?.destinationAsset : execution?.quote?.originAsset;
  const evmChain = (evmAsset && parseOriginAsset(evmAsset)?.chain) || chain;
  const evmTx = CHAINS.find(({ id }) => id === evmChain)?.tx ?? CHAINS[0].tx;
  const { evmTxHash, solanaTxHash } = execution?.transaction ?? {};
  const failed = status === 'DEPOSIT_FAILED' || status === 'OPERATION_FAILED';

  // Display only, from here. The page reads the execution again only after the deposit, so a CREATED it holds once the
  // signature is in is stale: the stages show the deposit, and the line under them leaves that status out.
  const stale = status === 'CREATED' && exec.hasSubmittedSignature;
  const at = stale ? STAGE_OF.DEPOSIT_PENDING : stage;
  // a cancel wipes the status, so the stages stop where this page last saw the execution
  const [seen, setSeen] = useState<{ id?: string; at: number }>({ at: -1 });
  if (at >= 0 && (seen.at !== at || seen.id !== executionId)) setSeen({ id: executionId, at });
  const where = at < 0 && phase === 'cancelled' && seen.id === executionId ? seen.at : at;
  // when this page saw the run move into each stage: none where it found it, as after a resume. The Signature has the execution's own.
  const [entered, setEntered] = useState<Entered>({ last: -1, times: [] });
  if (executionId && at >= 0) {
    const next = enter(entered, executionId, at, flow, () => new Date().toISOString());
    if (next !== entered) setEntered(next);
  }
  // Past its window the runner still polls for a late deposit, so it stays busy: that wait is on the person (paused), and
  // so is what stopped otherwise. What did not go through is failed.
  const now: StageState =
    failed ? 'failed' : status === 'SUCCESS' ? 'success' : phase === 'cancelled' ? 'cancelled' : phase === 'expired' ? 'paused' : exec.isBusy ? 'active' : unfinished ? 'paused' : 'failed';
  const note =
    status === 'OPERATION_FAILED'
      ? BROKE_NOTE[flow === 'refund' ? 'refund' : 'instructions']
      : status === 'DEPOSIT_FAILED'
        ? BROKE_NOTE.deposit
        : exec.recovery?.kind === 'retry-transfer'
          ? 'The transfer did not go through'
          : phase === 'expired'
            ? LATE_NOTE
            : unfinished
              ? 'This page stopped following it'
              : now === 'failed' && at === 0
                ? 'Not signed'
                : now === 'active'
                  ? (flow === 'refund' ? REFUND_DOING : DOING)[at]
                  : undefined;
  const explorer = (chainMeta(evmChain) ?? chainMeta(CHAINS[0].id))!.explorer;
  const links: (ReactNode | undefined)[] = [
    undefined,
    (depositTxHash || (evmTxHash && evmTxHash !== depositTxHash)) && (
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {depositTxHash && <ExplorerLink href={`${evmTx}${depositTxHash}`} label={short(depositTxHash)} explorer={explorer} />}
        {evmTxHash && evmTxHash !== depositTxHash && <ExplorerLink href={`${evmTx}${evmTxHash}`} label={`EVM transaction ${short(evmTxHash)}`} explorer={explorer} />}
      </span>
    ),
    undefined,
    solanaTxHash && <ExplorerLink href={`${SOLSCAN}/tx/${solanaTxHash}`} label={short(solanaTxHash)} explorer="Solscan" />,
    undefined,
  ];
  const stages = progressStages({ at: where, now, status, phase, flow, note, time: timeOf(execution?.createdAt), times: entered.id === executionId ? entered.times.map(timeOf) : [], links });

  // When the wallet asks for something, what to do and the stages come into view: they sit under the button that started
  // the run, which can be at the foot of the screen. Only as far as it takes, and at once for whoever asks for less motion.
  // The focus, if it dropped to the page as the form folded away after the signature, waits there too.
  const prompt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!WALLET_PHASES.includes(phase)) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (document.activeElement === document.body) prompt.current?.focus({ preventScroll: true });
    prompt.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [phase]);

  return (
    <Block>
      {/* the wallet's prompt and the stages under it, kept in view together, clear of the sticky header and of a bar at the foot */}
      <div ref={prompt} tabIndex={-1} className="flex scroll-my-20 flex-col gap-4 outline-none empty:hidden">
        {text && <PhaseCallout phase={phase} text={text} since={execution?.createdAt} />}
        {/* the callout says each phase as it changes, so the stages stay quiet. A cancel this page did not see has no stage to stop at. */}
        {(where >= 0 || phase !== 'cancelled') && <Timeline stages={stages} label="Progress" announce="" />}
      </div>
      {(status || executionId) && <StatusLine status={status} stale={stale} id={executionId} />}
    </Block>
  );
}

const Spends = ({ stored, figure }: { stored: StoredRecipe; figure: string }) => <SpendsRow figure={takesAmount(stored) ? figure : undefined} />;

type RecoverProps = {
  exec: UseExecutionResult;
  /** Kept by the parent, since a new attempt wipes it from `exec` before anything is signed. Without one nothing failed, and this only offers to send back what a run left. */
  execution?: Execution;
  /** An attempt that was created and never signed, which a new one has to delete first. */
  unsigned?: string;
  act: ReturnType<typeof useAct>['act'];
  locked: boolean;
  recipe: SolanaRecipe;
  stored: StoredRecipe;
  /** Why this page asks the wallet for nothing that runs the recipe now. Refund sends the money back to the wallet, so it does not wait for this. */
  gate: string;
  list: TokenList;
  intermediary?: string | null;
  source?: Token;
};

/**
 * OPERATION_FAILED is terminal and the money stays with the intermediary. In SDK 7.28.0 deriveExecutionRecovery has no
 * kind for it, so this follows the status, and the runner has no flow for an out-operation, so Refund goes to the API.
 * A surplus stays there too, and the balance is what shows it, so that it is still offered after a reload.
 */
function Recover({ exec, execution, unsigned, act, locked, recipe, stored, gate, list, intermediary, source }: RecoverProps) {
  const { api, wallet } = useIntentsConnect();
  const [retry, setRetry] = useState<StepsPreview>();
  const [refund, setRefund] = useState<Execution>();
  const [moved, setMoved] = useState(false);
  const { isRefund, held: heldAsset, back } = legs(execution?.quote);
  const assetId = heldAsset ?? recipe.destination.assetId;
  const token = list.tokens.find(candidate => candidate.assetId === assetId);
  const balance = useJson<Balance>(intermediary && token?.contractAddress ? `/api/balance/${intermediary}/${token.contractAddress}` : null);
  const held = balance.data;
  const backTo = list.sources.find(candidate => candidate.assetId === back) ?? source;
  // a retry runs the recipe on this page, which must be the one that failed
  const sameRecipe = useMemo(() => !!execution && !!intermediary && runsRecipe(stored, execution, intermediary), [execution, stored, intermediary]);
  const address = wallet?.getAddress();
  // the figures were asked for this target and this wallet, and the card would read them in the decimals of another
  useEffect(() => setRefund(undefined), [backTo?.assetId, address]);

  const retryQuote = () => exec.previewSteps(retryPlan(recipe, held!.amount));
  const askRetry = act(async () => {
    setRefund(undefined);
    setMoved(false);
    setRetry(await retryQuote());
  });
  const signRetry = act(async () => {
    try {
      if (unsigned) await exec.cancel(unsigned);
      await exec.runSteps(retry!.plan);
    } catch (error) {
      if (!isQuoteMoved(error) && (error as { code?: string }).code !== 'FEE_EXCEEDS_AMOUNT') throw error;
      setMoved(true);
      setRetry(undefined);
      setRetry(await retryQuote());
    }
  });

  const body = (dry: boolean) => refundBody({ account: held!.account!, tokenProgram: held!.tokenProgram!, token: token!, amount: held!.amount, backTo: backTo!.assetId, recipient: address!, dry });
  const askRefund = act(async () => {
    setRetry(undefined);
    setRefund(await api.createExecution(address!, body(true)));
  });
  const signRefund = act(async () => {
    if (unsigned) await exec.cancel(unsigned);
    const created = await api.createExecution(address!, body(false));
    try {
      const { payload, standard } = guards.mustHaveSigningPayload(created);
      const envelope = await signIntentsConnectPayload({ payload, standard, address: address!, providers: wallet!.getProviders(), decodePublicKey: wallet!.decodePublicKey?.bind(wallet) });
      await api.submitSignature(address!, { ...envelope, executionId: created.id });
    } catch (error) {
      // unsigned, it would hold the one in-flight slot of this wallet for nothing
      await exec.cancel(created.id).catch(() => {});
      throw error;
    }
    await exec.resume(created.id);
  });

  const symbol = token?.symbol ?? 'tokens';
  const amount = (atomic?: string) => (atomic && token ? `${fromAtomic(atomic, token.decimals)} ${symbol}` : '–');

  // each box at the one precision its figures need, as the payment's quote
  const [retryFee, retrySpends] = boxFigures([{ atomic: retry?.networkFee, token }, { atomic: retry?.spendable, token }]);
  const [refundGets, refundFee] = boxFigures([{ atomic: refund?.quote.minAmountOut, token: backTo }, { atomic: refund?.details.networkFee, token }]);

  if (!execution && (!held || held.amount === '0')) return null;

  return (
    <Block tight>
      {execution ? (
        <Notice kind="error">{isRefund ? 'The Refund failed, so the money is still with your intermediary. You can send it back again.' : 'The instructions failed on Solana, so the money stayed with your intermediary. You can run them again with it, or send it back.'}</Notice>
      ) : (
        <p role="status" className="text-sm leading-5 text-muted">
          Whatever a run does not spend stays with your intermediary until you send it back.
        </p>
      )}
      {!token && <Notice kind="error">Intents Connect no longer lists the token of this execution, so its balance cannot be read here.</Notice>}
      {balance.loading && <Notice>Reading what your intermediary holds…</Notice>}
      {balance.error && <Failure error={balance.error} retry={balance.retry} />}
      {held?.amount === '0' && <Notice>Your intermediary holds no {symbol} now, so there is nothing to retry with or send back.</Notice>}
      {held && held.amount !== '0' && (
        <>
          <Held>{amount(held.amount)}</Held>
          {execution && !isRefund && !sameRecipe && <Caption>Retry is offered on the page of the recipe that failed.</Caption>}
          {sameRecipe && gate && <Caption>{gate}</Caption>}
          <div className="flex flex-col gap-2">
            {sameRecipe && (
              <OptionTile
                icon={<RotateCcw />}
                title="Run it again"
                action={
                  <Button size="sm" disabled={locked || !!gate} onClick={askRetry}>
                    Retry
                  </Button>
                }
              >
                The instructions run again on what your intermediary holds, so nothing is deposited.
              </OptionTile>
            )}
            <OptionTile
              icon={<Undo2 />}
              title="Send it back"
              action={
                <Button size="sm" disabled={locked || !backTo} onClick={askRefund}>
                  Refund
                </Button>
              }
            >
              {backTo ? `As ${backTo.symbol} on ${CHAINS.find(({ id }) => id === backTo.blockchain)?.name}, to the wallet connected here.` : 'To the wallet connected here.'}
            </OptionTile>
          </div>
          {retry && (
            <QuoteBox title="Retry">
              <Figures>
                <FigureRow term="Fee">{retryFee}</FigureRow>
                <Spends stored={stored} figure={retrySpends} />
              </Figures>
              {moved && <Notice kind="warn">The fee moved before you signed. These are the new numbers, and nothing was charged.</Notice>}
              {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
              <Button variant="primary" size="lg" block icon={<PenLine />} disabled={locked || !!gate} onClick={signRetry}>
                Sign and retry
              </Button>
            </QuoteBox>
          )}
          {refund && backTo && (
            <QuoteBox title="Refund">
              <Figures>
                <FigureRow term="You get at least">
                  {refundGets} on {CHAINS.find(({ id }) => id === backTo.blockchain)?.name}
                </FigureRow>
                <FigureRow term="Sent to">{address && <Address value={address} chain={backTo.blockchain} full />}</FigureRow>
                <FigureRow term="Fee">{refundFee}</FigureRow>
              </Figures>
              <Caption>Figures from a test run: the real one can differ by what the price does in the seconds before you sign.</Caption>
              {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
              <Button variant="primary" size="lg" block icon={<PenLine />} disabled={locked} onClick={signRefund}>
                Sign and refund
              </Button>
            </QuoteBox>
          )}
        </>
      )}
    </Block>
  );
}

type ExistingProps = {
  id: string;
  /** How this execution came up. */
  head: string;
  address: string;
  intermediary?: string | null;
  stored: StoredRecipe;
  list?: TokenList;
  /** Why this page asks the wallet for nothing now. */
  gate: string;
  locked: boolean;
  act: ReturnType<typeof useAct>['act'];
  resume: (id: string) => () => void;
  drop: (id: string) => Promise<void>;
  /** Only for the list of this browser: a 409 cannot be put aside. */
  onHide?: () => void;
};

/**
 * An execution this page did not just create. Anyone with an API key can create one for any wallet, so it is read and
 * listed before the wallet is asked anything, and only the recipe on this page is signed or funded from here.
 */
function Existing({ id, head, address, intermediary, stored, list, gate, locked, act, resume, drop, onHide }: ExistingProps) {
  const { api } = useIntentsConnect();
  const read = async () => (await api.listExecutions(address, { id }))[0] ?? null;
  const found = useAsync<Execution | null>(read, [address, id]);
  const execution = found.data;
  const same = useMemo(() => (execution && intermediary ? signsOnlyRecipe(stored, execution, intermediary) : undefined), [execution, stored, intermediary]);

  const title = (
    <p>
      {head} <code>{id}</code>
    </p>
  );
  const hide = onHide && (
    <Button size="sm" variant="ghost" onClick={onHide}>
      Hide
    </Button>
  );
  // a 409 stays on the screen until a new flow starts, and once the execution is over a reload is the way to one
  const reload = !onHide && (
    <Button size="sm" icon={<RefreshCw />} onClick={() => location.reload()}>
      Reload this page
    </Button>
  );

  if (!execution) {
    return (
      <ExistingFrame title={title}>
        {found.loading && <Notice>Reading it…</Notice>}
        {found.error && <Failure error={new Error(`Could not read it, so nothing is offered for it yet: ${explain(found.error)}`)} retry={found.retry} />}
        {execution === null && <p className="text-sm text-muted">Connect no longer has it.</p>}
        <Actions>
          {hide}
          {execution === null && reload}
        </Actions>
      </ExistingFrame>
    );
  }

  const { status, quote, details, transaction } = execution;
  const steps: ExecutionStep[] = Array.isArray(execution.steps) ? execution.steps : [];
  const other = same === false;
  const { needsSignature, asksWallet, terminal, over, resumable, open, deletable } = existingOffer(execution, { same, gate, listed: !!onHide });

  const remove = act(async () => {
    const now = await read();
    // it can have moved on since it was read, in another tab or because a deposit arrived
    if (now?.status === status && now.details?.messageSigned === details?.messageSigned) await drop(id);
    else found.retry();
  });

  const paid = quote?.swapType === 'EXACT_OUTPUT' ? quote.amountIn : quote?.amount;
  const token = [...(list?.sources ?? []), ...(list?.tokens ?? [])].find(({ assetId }) => assetId === quote?.originAsset);
  const chain = CHAINS.find(({ id: known }) => known === token?.blockchain);
  // where an address of the quote lives, for its explorer: the deposit on the side paid from, the recipient on the other
  const on = (asset?: string) => (asset && parseOriginAsset(asset)?.chain) || undefined;

  return (
    <ExistingFrame title={title}>
      <Facts>
        <dt>Status</dt>
        <dd>
          <span>
            {status === 'CREATED' ? 'Created' : (STATUS_WORDS[status] ?? status)}, {needsSignature ? 'and it still needs your signature' : 'signed'}
          </span>{' '}
          <StatusName status={status} />
        </dd>
        {quote?.depositAddress && (
          <>
            <dt>Deposit</dt>
            <dd>
              {token && paid ? `${fromAtomic(paid, token.decimals)} ${token.symbol}${chain ? ` on ${chain.name}` : ''}` : `${paid} atomic units of ${quote.originAsset}`} to <Address value={quote.depositAddress} chain={on(quote.originAsset)} explorer={!!on(quote.originAsset)} full />
            </dd>
          </>
        )}
        {quote?.recipient && (
          <>
            <dt>Delivered to</dt>
            <dd>
              <Address value={quote.recipient} chain={on(quote.destinationAsset)} explorer={!!on(quote.destinationAsset)} full />
            </dd>
          </>
        )}
        <dt>Deposit hash</dt>
        <dd>{!transaction?.evmTxHash ? 'none seen yet' : on(quote?.originAsset) ? <TxLink hash={transaction.evmTxHash} chain={on(quote?.originAsset)!} /> : <code>{transaction.evmTxHash}</code>}</dd>
      </Facts>
      <Details
        open={asksWallet || other}
        summary={
          <>
            What it runs: {steps.length} {steps.length === 1 ? 'instruction' : 'instructions'}
          </>
        }
      >
        <ExecutionSteps steps={steps} intermediary={intermediary} />
      </Details>
      {other && asksWallet && <Notice kind="error">This is not the recipe on this page, so this page will not sign or fund it. Anyone who knows your wallet address can create an execution for it, so if you did not start this one, delete it.</Notice>}
      {other && !asksWallet && <Caption>This is not the recipe on this page.</Caption>}
      {over && <p className="text-sm text-text">It is no longer in flight, so a new run can start.</p>}
      {!asksWallet && !over && !terminal && <Caption>It is already signed, so resuming only follows it here and asks your wallet for nothing.</Caption>}
      {asksWallet && !deletable && <Notice kind="warn">{CANCEL_NOTE}</Notice>}
      {resumable && !open && gate && <Caption>{gate}</Caption>}
      <Actions>
        {resumable && (
          <Button variant="primary" size="sm" icon={<RotateCcw />} disabled={locked || !open} onClick={resume(id)}>
            Resume it
          </Button>
        )}
        {asksWallet && (
          <Button size="sm" variant={!resumable && deletable ? 'primary' : 'secondary'} disabled={locked} onClick={remove} className={LONG_LABEL}>
            {deletable ? 'Delete it (a signature that moves no money)' : 'Cancel it'}
          </Button>
        )}
        {hide}
        {over && reload}
      </Actions>
    </ExistingFrame>
  );
}

type ExecuteProps = {
  /** Held by the parent, so that its state outlives this screen. */
  exec: UseExecutionResult;
  recipe: SolanaRecipe;
  stored: StoredRecipe;
  /** Opened through a link: someone else's recipe that spends the visitor's money. */
  shared?: boolean;
  /** An amount of the token the recipe receives, filled in until the person types their own. */
  suggested?: string;
  /** What the amount the recipe spends will do, shown with the quote. */
  outcome?: (spendable: string) => ReactNode;
  /** Why nothing can run now. What this page offers for money already sent stays open. */
  closed?: string;
};

export function Execute({ exec, recipe, stored, shared = false, suggested, outcome, closed }: ExecuteProps) {
  const { api, wallet } = useIntentsConnect();
  const { connect, disconnect, isConnecting } = useIntentsConnectWallet();
  const address = wallet?.getAddress() ?? undefined;
  const isEvm = wallet?.signingStandard === 'erc191';
  const list = useJson<TokenList>('/api/tokens');
  const lookup = useAsync(address && isEvm ? () => api.getIntermediary(address) : null, [address, isEvm]);
  const intermediary = lookup.data?.solana;
  const { working, error, act } = useAct();
  // the wallet menu in the header keeps the wallet connected while a run is in flight
  usePublishRunBusy(exec.isBusy);

  const [chain, setChain] = useState(CHAINS[0].id);
  const [pick, setPick] = useState('');
  const [typed, setTyped] = useState<string>();
  const [understood, setUnderstood] = useState(false);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [moved, setMoved] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string>();
  const [failed, setFailed] = useState<Execution>();
  // Display only: a new payment opened while the card shows how the last run ended, because the person asked for one, or
  // because the page gave the card a new amount, as Repay more does on /kamino. Only the first takes the focus: the page
  // that gave the amount keeps it.
  const [opened, setOpened] = useState<'asked' | 'amount'>();
  const [given, setGiven] = useState(suggested);
  if (given !== suggested) {
    setGiven(suggested);
    if (suggested !== undefined) setOpened(now => now ?? 'amount');
  }
  const amountField = useRef<HTMLInputElement>(null);
  // display only: what the last click in the card asked for, so that the line under the quote button says what it waits for
  const [asked, setAsked] = useState<string>();
  // The card's main button (connect, quote, sign: one element that changes its label) and the quote's own Get exact
  // amount and fee, for the focus while a quote is worked out.
  const main = useRef<HTMLButtonElement>(null);
  const refresh = useRef<HTMLButtonElement>(null);

  const sources = useMemo(() => (list.data?.sources ?? []).filter(token => token.blockchain === chain).sort(bySymbol), [list.data, chain]);
  const source = sources.find(token => token.assetId === pick) ?? sources.find(token => token.symbol === 'USDC') ?? sources[0];
  // the link's author writes both ids, and only together do they name a token Connect delivers
  const target = list.data?.tokens.find(token => token.assetId === recipe.destination.assetId && token.contractAddress === recipe.destination.tokenAddress);
  // a share across two tokens would be a price, not a loss
  const kept = preview && source && target && source.symbol === target.symbol ? bridgeKeeps(preview.execution.quote.amount, source.decimals, preview.execution.quote.minAmountOut, target.decimals) : null;
  // a figure in the token the recipe receives says nothing about an amount of another
  const amount = typed ?? (source && source.symbol === target?.symbol ? suggested ?? '' : '');
  const atomic = source ? toAtomic(amount, source.decimals) : null;

  // The same function runs in buildSteps, so with the real intermediary and the quoted amount this is what Connect receives.
  const built = useMemo(() => {
    try {
      return { steps: buildRecipe(stored, intermediary ?? STAND_IN, preview?.spendable ?? '0') };
    } catch (failure) {
      return { problem: (failure as Error).message };
    }
  }, [stored, intermediary, preview]);
  const issues = useMemo(() => {
    const untouched = destinationIssue(stored, intermediary ?? STAND_IN);
    return [...stored.steps.flatMap(step => checkCompat(stored.idls[step.program], step.ixName)), ...(untouched ? [{ reason: untouched }] : [])];
  }, [stored, intermediary]);

  // A signature cannot rest on a quote for other inputs or another wallet.
  useEffect(() => {
    setPreview(null);
    setFailed(undefined);
  }, [recipe, address]);
  // A new figure takes the place of what was typed for the old one, and of its quote.
  useEffect(() => {
    setTyped(undefined);
    setPreview(null);
    setMoved(false);
  }, [suggested]);
  // and one quote is good for one signature
  useEffect(() => {
    if (exec.hasSubmittedSignature) setPreview(null);
  }, [exec.hasSubmittedSignature]);
  const clearing =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPreview(null);
      setMoved(false);
    };

  useEffect(() => {
    if (!address || !exec.executionId || !exec.status) return;
    const others = recent(address).filter(id => id !== exec.executionId);
    const settled = exec.status === 'SUCCESS' || exec.status === 'DEPOSIT_FAILED'; // nothing is left to do with these
    saveRecent(address, settled ? others : [exec.executionId, ...others]);
  }, [address, exec.executionId, exec.status]);

  // A new attempt wipes the failed execution from `exec` before it has signed anything, and that attempt can still fail.
  useEffect(() => {
    if (exec.status === 'OPERATION_FAILED') setFailed(exec.execution as Execution);
    else if (exec.hasSubmittedSignature) setFailed(undefined);
  }, [exec.status, exec.hasSubmittedSignature, exec.execution]);
  const last = address ? recent(address).find(id => !hidden.includes(id)) : undefined;

  const locked = exec.isBusy || working;
  // a balance read while a run is in flight is about to change, and a second execution would meet the 409
  const atRest = !exec.isBusy && (!exec.status || TERMINAL_STATUSES.includes(exec.status));
  // A flow that fails after the real create, on a moved quote or a declined signature, leaves an execution holding this wallet's one in-flight slot.
  const unsigned = exec.phase === 'failed' && !exec.recovery && !exec.hasSubmittedSignature && exec.status === 'CREATED' ? exec.executionId : undefined;
  const unfinished = !unsigned && stoppedFollowing(exec);
  // Display only: a resume the SDK refused for an execution it cannot check, as one made outside this app. Resuming again
  // cannot fix that, so deleting it is the way on.
  const refusal = resumed && unsigned && isQuoteMoved(exec.error) ? (typeof exec.execution?.metadata?.intentsConnectSpendable === 'string' ? 'moved' : 'elsewhere') : undefined;

  // What keeps this recipe from running at all, so nothing on this page asks the wallet to sign for it.
  const refused =
    closed ??
    (!wallet
      ? 'Connect an EVM wallet to continue.'
      : !isEvm
        ? 'This is not an EVM wallet. Recipes are paid from Base, Arbitrum or Ethereum, so connect an EVM wallet.'
        : lookup.loading
          ? 'Looking up your intermediary…'
          : lookup.error
            ? ''
            : intermediary === null
              ? 'Payments to Solana are not switched on for this site yet.'
              : !list.data
                ? 'Waiting for the token list.'
                : !target
                  ? "Intents Connect does not deliver this recipe's token right now, so it cannot run."
                  : built.problem || issues.length
                    ? 'This recipe cannot run, see above.'
                    : shared && !understood
                      ? 'Tick the box above first.'
                      : '');
  const missing = lookup.error ? '' : !source ? 'Intents Connect takes no token from this chain right now.' : !atomic ? `Enter an amount of ${source.symbol}.` : '';
  const blocked = refused || missing;
  const canQuote = !blocked && !lookup.error && !locked && !exec.recovery && !unfinished;

  const quote = async () => {
    for (let tries = 1; ; tries++) {
      try {
        return await exec.preview(bridgePlan(recipe, source!, atomic!));
      } catch (failure) {
        if (!isQuoteMoved(failure) || tries === 3) throw failure;
      }
    }
  };
  const askQuote = act(async () => {
    setDeleted(undefined);
    setMoved(false);
    setPreview(null);
    setPreview(await quote());
  });
  const drop = async (id: string) => {
    await exec.cancel(id);
    if (address) saveRecent(address, recent(address).filter(other => other !== id));
  };
  const sign = act(async () => {
    setDeleted(undefined);
    setResumed(false);
    try {
      if (unsigned) await drop(unsigned);
      await exec.run(preview!.plan);
    } catch (failure) {
      if (!isQuoteMoved(failure)) throw failure;
      setMoved(true);
      setPreview(null);
      setPreview(await quote());
    }
  });
  const resume = (id: string) =>
    act(async () => {
      setDeleted(undefined);
      setResumed(true);
      await exec.resume(id, {
        // the SDK calls this just before a signature, so an execution that changed since it was listed stops here
        validateExecution: execution => {
          if (!intermediary || !signsOnlyRecipe(stored, execution, intermediary)) throw new Error('This execution is not the recipe on this page, so nothing was signed.');
        },
      });
    });
  const dropAndSay = async (id: string) => {
    await drop(id);
    setDeleted(id);
  };
  const cancel = (id: string) => act(() => dropAndSay(id));

  const deposit = exec.execution?.quote;
  const depositToken = list.data?.sources.find(token => token.assetId === deposit?.originAsset);
  // the network a deposit has to be sent on: the same address on another one never reaches Connect
  const depositChain = CHAINS.find(({ id }) => id === depositToken?.blockchain);
  const depositWhat = depositToken && `${depositToken.symbol}${depositChain ? ` on ${depositChain.name}` : ''}`;
  // what has to arrive at the deposit address, as the card of an execution offered again reads it
  const depositSent = (deposit?.swapType === 'EXACT_OUTPUT' ? deposit.amountIn : undefined) ?? deposit?.amount;
  const existing = { address: address!, intermediary, stored, list: list.data, gate: refused, locked, act, resume, drop: dropAndSay };

  // the person reads what will run before they consent to it on a shared link, and finds it under the card elsewhere
  const summary = built.steps && <Summary stored={stored} steps={built.steps} intermediary={intermediary ?? STAND_IN} real={!!intermediary} amountKnown={!!preview} shared={shared} />;
  const quoted = preview && source && target;
  // display only: the quote's figures at one precision, with what the SDK holds back named, so that they add up
  const figures = quoted
    ? quoteFigures({
        paid: { atomic: preview.execution.quote.amount, decimals: source.decimals },
        samePaid: source.symbol === target.symbol,
        delivered: preview.execution.quote.minAmountOut,
        fee: preview.execution.details.networkFee,
        spendable: takesAmount(stored) ? preview.spendable : undefined,
        decimals: target.decimals,
      })
    : undefined;

  // Display only, from here. Once a run has something to read or to resolve, that leads the card and a new payment waits
  // behind a quiet button. What has to be resolved first leads even then, and the run leads again once it is signed.
  const resolveFirst = !!exec.recovery || unfinished || exec.phase === 'expired' || (exec.isBusy && (exec.hasSubmittedSignature || resumed));
  const ended = exec.status === 'SUCCESS' || exec.status === 'DEPOSIT_FAILED' || !!failed || (!!address && !exec.executionId && !exec.recovery && !!last) || (resumed && !!unsigned);
  const leads = resolveFirst || (ended && !opened);
  const restart = leads && !resolveFirst && !locked;
  useEffect(() => {
    if (exec.hasSubmittedSignature) setOpened(undefined);
  }, [exec.hasSubmittedSignature]);
  useEffect(() => setOpened(undefined), [address]);
  useEffect(() => {
    if (opened === 'asked') amountField.current?.focus();
  }, [opened]);
  // A quote asked from the keyboard: the main button kept the focus while it worked and is now Sign and run. The focus
  // goes up to the quote's own Get exact amount and fee, over the figures, so that the next Tab reaches Sign and run.
  // Once for each quote, when the buttons are free again; never from anywhere else.
  const handed = useRef<unknown>(null);
  useLayoutEffect(() => {
    if (!preview || locked || handed.current === preview) return;
    handed.current = preview;
    if (main.current && document.activeElement === main.current) refresh.current?.focus();
  }, [preview, locked]);
  // on a shared link, the payment stands beside what will run
  const Pay = shared ? PayColumn : Fragment;

  return (
    <div
      data-ui="run"
      className={shared ? SHARED_COLUMNS : 'mx-auto flex w-full max-w-run min-w-0 flex-col gap-4'}
      onClickCapture={event => {
        const asker = (event.target as Element).closest<HTMLElement>('[data-asks]');
        setAsked(asker?.dataset.asks);
        // the quote's own button goes away with its figures, so the main button, busy meanwhile, holds the focus
        if (asker && asker === refresh.current && document.activeElement === asker) main.current?.focus();
      }}
    >
      {shared && (
        <div className={SHARED_LEFT}>
          <TrustPanel stored={stored} instructions={stored.steps.length} check={program => <PublishedCheck stored={stored} program={program} />} />
          {summary}
        </div>
      )}
      <Pay>
        {built.problem && <Notice kind="error">This recipe cannot be built: {built.problem}</Notice>}
        {issues.length > 0 && (
          <Notice kind="error">
            Connect cannot run this recipe:
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
              {issues.map(issue => (
                <li key={issueText(issue)}>{issueText(issue)}</li>
              ))}
            </ul>
          </Notice>
        )}

        <RunCard>
          {!leads && (
            <>
              <Swap>
                <Panel
                  label="You pay"
                  idle={!wallet}
                  aside={
                    list.data && (
                      <SelectPill
                        label="Chain"
                        compact
                        value={chain}
                        disabled={locked}
                        onChange={event => clearing(setChain)(event.target.value)}
                        display={
                          <>
                            <ChainIcon chain={chain} size={18} />
                            {CHAINS.find(({ id }) => id === chain)?.name}
                          </>
                        }
                      >
                        {CHAINS.map(({ id, name }) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </SelectPill>
                    )
                  }
                  footer={
                    wallet ? (
                      <PaidFrom address={address}>
                        <Button variant="ghost" size="xs" disabled={locked} onClick={() => disconnect()}>
                          Disconnect
                        </Button>
                      </PaidFrom>
                    ) : (
                      <span>No wallet connected yet.</span>
                    )
                  }
                >
                  {list.loading && (
                    <span role="status" className="flex flex-1 items-center gap-2 text-sm text-muted">
                      <Spinner size="sm" />
                      Loading tokens…
                    </span>
                  )}
                  {list.loading && <Skeleton className="h-9 w-28 rounded-full" />}
                  {list.data && (
                    <>
                      <input ref={amountField} aria-label="Amount you pay" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={locked} onChange={event => clearing(setTyped)(event.target.value)} className={AMOUNT_INPUT} />
                      <SelectPill
                        label="Token"
                        value={source?.assetId ?? ''}
                        disabled={locked || !source}
                        onChange={event => clearing(setPick)(event.target.value)}
                        display={
                          source ? (
                            <>
                              <TokenIcon symbol={source.symbol} size={22} />
                              {source.symbol}
                            </>
                          ) : (
                            'None'
                          )
                        }
                      >
                        {sources.map(token => (
                          <option key={token.assetId} value={token.assetId}>
                            {token.symbol} {token.contractAddress ? `(${short(token.contractAddress)})` : '(native)'}
                          </option>
                        ))}
                      </SelectPill>
                    </>
                  )}
                </Panel>
                <PanelArrow />
                <Panel
                  label="You get"
                  idle={!wallet}
                  aside={<ChainTag chain="sol" name="Solana" />}
                  footer={
                    (target || lookup.loading || intermediary) && (
                      <>
                        {target && <span>It arrives on Solana as {target.symbol}.</span>}
                        {lookup.loading && <Skeleton className="h-4 w-4/5" />}
                        {intermediary && <IntermediaryLine address={intermediary} />}
                      </>
                    )
                  }
                >
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    {quoted && figures ? <Arrives amount={figures.delivered} symbol={target.symbol} kept={kept} /> : <NoFigure />}
                    {target && <TokenTag symbol={target.symbol} />}
                  </div>
                </Panel>
              </Swap>

              {suggested && source && target && source.symbol !== target.symbol && <OtherToken figure={suggested} target={target.symbol} source={source.symbol} />}
              {lookup.error && <Failure error={new Error(`Could not look up your intermediary: ${explain(lookup.error)}`)} retry={lookup.retry} />}
              {list.error && <Failure error={list.error} retry={list.retry} />}

              {quoted && figures && (
                <QuoteBox
                  title="Exact amounts"
                  action={
                    <Button ref={refresh} variant="ghost" size="xs" icon={<RefreshCw />} disabled={!canQuote} onClick={askQuote} data-asks="quote">
                      Get exact amount and fee
                    </Button>
                  }
                >
                  <Figures>
                    <FigureRow term="You pay">
                      <Figure
                        value={
                          <>
                            {figures.paid} {source.symbol} on {CHAINS.find(({ id }) => id === source.blockchain)?.name}
                          </>
                        }
                        note="plus the gas of the deposit"
                      />
                    </FigureRow>
                    <FigureRow term="Network fee">
                      <Figure
                        value={figures.fee ? `${figures.fee} ${target.symbol}` : 'none stated'}
                        note="taken out of what is delivered"
                      />
                    </FigureRow>
                    {figures.held && (
                      <FigureRow term="Held back for price moves" note="It stays with your intermediary, and Refund takes it back.">
                        {figures.held} {target.symbol}
                      </FigureRow>
                    )}
                    <Spends stored={stored} figure={figures.spends ? `${figures.spends} ${target.symbol}` : '–'} />
                  </Figures>
                  <Figures className="border-t border-border pt-2.5 empty:hidden">{preview.spendable && outcome?.(preview.spendable)}</Figures>
                  {moved && <Notice kind="warn">The quote moved before you signed. These are the new numbers, and nothing was charged.</Notice>}
                  {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
                </QuoteBox>
              )}
              {working && !preview && !exec.isBusy && <WorkingLine>{asked === 'quote' ? QUOTING : undefined}</WorkingLine>}

              {shared && (
                <ConsentBox given={understood}>
                  <Checkbox checked={understood} onChange={setUnderstood} label="I have read what will run, and I accept that it was made by whoever shared this link." />
                </ConsentBox>
              )}

              <div className="flex flex-col gap-2.5">
                {!wallet ? (
                  <Button variant="primary" size="lg" block icon={<Wallet />} disabled={isConnecting} onClick={() => connect()}>
                    {isConnecting ? 'Connecting…' : 'Connect EVM wallet'}
                  </Button>
                ) : !isEvm ? (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    icon={<ArrowLeftRight />}
                    disabled={locked}
                    onClick={async () => {
                      try {
                        await disconnect();
                        await connect();
                      } catch {
                        // closing the list of wallets is no error, and the button stays for another try
                      }
                    }}
                  >
                    Switch wallet
                  </Button>
                ) : quoted ? (
                  <Button ref={main} variant="primary" size="lg" block icon={<PenLine />} loading={exec.isBusy || (working && asked === 'sign')} disabled={locked || !!exec.recovery || !!blocked || unfinished} onClick={sign} data-asks="sign">
                    Sign and run
                  </Button>
                ) : (
                  <Button ref={main} variant="primary" size="lg" block icon={<Calculator />} loading={working && asked === 'quote'} disabled={!canQuote} onClick={askQuote} data-asks="quote">
                    Get exact amount and fee
                  </Button>
                )}
                <div aria-live="polite">
                  {blocked && <Reason tone={wallet && !isEvm ? 'warning' : intermediary === null || (list.data && !target) ? 'danger' : 'muted'}>{blocked}</Reason>}
                </div>
                {preview && source && target && (
                  <Caption icon={<PenLine />}>Your wallet asks for one signature, then for the deposit, switching to {CHAINS.find(({ id }) => id === source.blockchain)?.name} if it is on another network.</Caption>
                )}
                <Caption icon={<Clock />}>{TIME_NOTE}</Caption>
              </div>
            </>
          )}

          {/* the card of a 409 already says what it means, and so does the warning of a refused resume, but not that a deletion from either failed */}
          {error && !((exec.recovery?.kind === 'resume-or-cancel' || refusal) && error === explain(exec.error)) && <Notice kind="error">{error}</Notice>}
          {deleted && exec.phase !== 'cancelled' && <DeletedLine id={deleted} />}
          {unsigned && (!preview || refusal) && (
            <Alert
              kind="warning"
              title={refusal && 'This execution cannot be resumed here.'}
              actions={
                <Button variant={refusal ? 'primary' : 'secondary'} size="sm" disabled={locked} onClick={cancel(unsigned)} className={LONG_LABEL}>
                  Delete it (a signature that moves no money)
                </Button>
              }
            >
              {refusal ? `${REFUSED_RESUME[refusal]} ${BLOCKS_WALLET}` : `An attempt was created and never signed. ${BLOCKS_WALLET}`}
            </Alert>
          )}
          {address && exec.recovery?.kind === 'resume-or-cancel' && <Existing key={exec.recovery.executionId} id={exec.recovery.executionId} head="This wallet already has an execution in flight, and Connect runs one at a time per wallet and chain:" {...existing} />}

          {(exec.status || exec.isBusy || exec.phase === 'cancelled') && <Progress exec={exec} chain={chain} resumed={resumed} unfinished={unfinished} />}
          {exec.recovery?.kind === 'retry-transfer' && (
            <Alert
              kind="warning"
              title="The deposit transfer did not go through."
              actions={
                <>
                  <Button variant="primary" size="sm" disabled={locked} onClick={act(() => exec.retryDeposit())}>
                    Send the deposit again
                  </Button>
                  <Button size="sm" disabled={locked} onClick={cancel(exec.recovery.executionId)}>
                    Cancel the execution
                  </Button>
                </>
              }
            >
              {CANCEL_NOTE}
            </Alert>
          )}
          {unfinished && (
            <Alert
              kind="warning"
              actions={
                <Button variant="primary" size="sm" icon={<RotateCcw />} disabled={locked} onClick={resume(exec.executionId!)}>
                  Resume
                </Button>
              }
            >
              This execution has not finished, and this page stopped following it. Do not pay again before you know how it ended.
            </Alert>
          )}
          {resumed && deposit?.depositAddress && !exec.depositTxHash && !exec.execution?.transaction?.evmTxHash && (exec.status === 'DEPOSIT_PENDING' || exec.status === 'EXPIRED') && (
            <DepositBox
              actions={
                <>
                  <Button size="sm" icon={<Copy />} onClick={() => copyText(deposit.depositAddress, depositWhat ? `Deposit address copied. Send only ${depositWhat} to it.` : 'Deposit address copied')}>
                    Copy the address
                  </Button>
                  <Button size="sm" variant="ghost" disabled={exec.isCancelling} onClick={cancel(exec.executionId!)}>
                    Cancel, I will not send it
                  </Button>
                </>
              }
            >
              {/* one sentence for a screen reader: "Send exactly 800 USDC on Base (contract 0x8335…2913) to 0x…" */}
              <p className="flex min-w-0 flex-col gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-muted">Send exactly</span>{' '}
                  <strong className="font-semibold text-text nums">{depositToken ? `${fromAtomic(depositSent!, depositToken.decimals)} ${depositToken.symbol}` : `${depositSent} atomic units`}</strong>
                  {depositChain && (
                    <>
                      {' '}
                      <span className="inline-flex items-center gap-1">
                        on <ChainIcon chain={depositChain.id} size={16} /> <span className="font-medium text-text">{depositChain.name}</span>
                      </span>
                    </>
                  )}
                  {depositToken?.contractAddress && (
                    <>
                      {' '}
                      <span className="min-w-0 text-muted">
                        (contract <Address value={depositToken.contractAddress} chain={depositToken.blockchain} kind="token" copy={false} />)
                      </span>
                    </>
                  )}{' '}
                  <span className="text-muted">to</span>
                </span>{' '}
                <Address value={deposit.depositAddress} chain={depositChain?.id} explorer={!!depositChain} copy={false} full className="w-full justify-between gap-2 rounded-md border border-border bg-bg/60 px-3 py-2" />
              </p>
              <p className="mt-3">If you already sent it, wait: sending it again would pay twice. If you have not, send it from any wallet and this page will follow it.</p>
              <p className="mt-2 text-xs text-muted">{CANCEL_NOTE}</p>
            </DepositBox>
          )}
          {exec.phase === 'expired' && !resumed && (
            <Alert
              kind="warning"
              actions={
                <Button size="sm" disabled={exec.isCancelling} onClick={cancel(exec.executionId!)}>
                  Cancel the execution
                </Button>
              }
            >
              {CANCEL_NOTE}
            </Alert>
          )}
          {exec.status === 'DEPOSIT_FAILED' && <Notice kind="error">The deposit failed, for example on an invalid amount, so nothing ran on Solana. What was transferred is refunded.</Notice>}
          {address && !exec.executionId && !locked && !exec.recovery && last && <Existing key={last} id={last} head="You started an execution from this browser:" onHide={() => setHidden([...hidden, last])} {...existing} />}
          {list.data && (failed || atRest) && <Recover key={failed?.id} exec={exec} execution={failed} unsigned={unsigned} act={act} locked={locked || !!exec.recovery || unfinished} recipe={recipe} stored={stored} gate={refused} list={list.data} intermediary={intermediary} source={source} />}
          {restart && <NewPayment onClick={() => setOpened('asked')} />}
        </RunCard>
      </Pay>

      {!shared && summary}
    </div>
  );
}
