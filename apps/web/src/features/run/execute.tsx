import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Calculator, Clock, Copy, PenLine, RefreshCw, RotateCcw, Undo2, Wallet } from 'lucide-react';
import { TERMINAL_STATUSES, guards, parseOriginAsset, signIntentsConnectPayload, type Execution, type ExecutionPreview, type ExecutionStep, type SolanaRecipe, type StepsPreview } from '@aurora-is-near/intents-connect';
import { useIntentsConnect, type UseExecutionResult } from '@aurora-is-near/intents-connect/react';
import { useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import type { Idl } from '@connect-anything/core';
import { checkCompat, issueText } from '../../compat.ts';
import { CHAINS, STAGES, STAGE_OF, bridgeKeeps, bridgePlan, bySymbol, existingOffer, explain, fromAtomic, isQuoteMoved, legs, refundBody, retryPlan, stoppedFollowing, toAtomic, type Balance, type Token, type TokenList } from '../../connect.ts';
import { STAND_IN, buildRecipe, destinationIssue, matchesPublished, runsRecipe, signsOnlyRecipe, takesAmount, type StoredRecipe } from '../../recipe.ts';
import { Failure, Notice, short, useAct, useAsync, useJson } from '../../ui.tsx';
import { Address, Alert, Button, ChainIcon, Checkbox, Skeleton, Spinner, Timeline, TokenIcon, chainMeta, copyText, type StageState, type TimelineStage } from '../../ui/index.ts';
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
  Figures,
  Held,
  LONG_LABEL,
  MetaLine,
  NoFigure,
  OptionTile,
  PaidFrom,
  Panel,
  PanelArrow,
  PhaseCallout,
  QuoteBox,
  Reason,
  RunCard,
  SelectPill,
  SpendsRow,
  Swap,
  TokenTag,
  WorkingLine,
} from './parts.tsx';
import { IdlCheck, Summary, TrustPanel } from './summary.tsx';
import { CANCEL_NOTE, DOING, PHASE_TEXT, TIME_NOTE } from './words.ts';

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

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const timeOf = (iso?: string) => {
  const at = iso ? new Date(iso) : undefined;
  return at && Number.isFinite(at.getTime()) ? clock.format(at) : undefined;
};

function Progress({ exec, chain, resumed, unfinished }: { exec: UseExecutionResult; chain: string; resumed: boolean; unfinished: boolean }) {
  const { status, phase, execution, executionId, depositTxHash } = exec;
  // a resume asks the wallet for the deposit only while the execution is CREATED: after that the address is shown instead
  const text = exec.error || (resumed && phase === 'awaiting-deposit' && status !== 'CREATED') ? undefined : PHASE_TEXT[phase];
  const stage = status ? STAGE_OF[status] : -1;
  const originChain = (execution?.quote?.originAsset && parseOriginAsset(execution.quote.originAsset)?.chain) || chain;
  const evmTx = CHAINS.find(({ id }) => id === originChain)?.tx ?? CHAINS[0].tx;
  const { evmTxHash, solanaTxHash } = execution?.transaction ?? {};
  const failed = status === 'DEPOSIT_FAILED' || status === 'OPERATION_FAILED';

  // Display only, from here. The page reads the execution again only after the deposit, so a CREATED it holds once the
  // signature is in is stale: the stages show the deposit, and the line under them leaves that status out.
  const stale = status === 'CREATED' && exec.hasSubmittedSignature;
  const at = stale ? STAGE_OF.DEPOSIT_PENDING : stage;
  // nothing runs on this page now: what stopped is waiting on the person (paused) or did not go through (failed)
  const now: StageState = failed ? 'failed' : status === 'SUCCESS' ? 'success' : phase === 'cancelled' ? 'cancelled' : exec.isBusy ? 'active' : unfinished || phase === 'expired' ? 'paused' : 'failed';
  const note =
    status === 'OPERATION_FAILED'
      ? 'The instructions failed on Solana'
      : status === 'DEPOSIT_FAILED'
        ? 'The deposit failed, so nothing ran'
        : exec.recovery?.kind === 'retry-transfer'
          ? 'The transfer did not go through'
          : phase === 'expired'
            ? 'The deposit window passed'
            : unfinished
              ? 'This page stopped following it'
              : now === 'failed' && at === 0
                ? 'Not signed'
                : now === 'active'
                  ? DOING[at]
                  : undefined;
  const explorer = (chainMeta(originChain) ?? chainMeta(CHAINS[0].id))!.explorer;
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
  const stages: TimelineStage[] = STAGES.map((name, index) => {
    const last = index === STAGES.length - 1;
    return {
      id: name,
      title: last && status === 'SUCCESS' ? 'Success' : last && failed ? 'Failed' : name,
      state: index < at ? 'done' : index === at ? now : 'pending',
      description: index === at ? note : undefined,
      time: index === 0 ? timeOf(execution?.createdAt) : undefined,
      link: links[index] || undefined,
    };
  });

  return (
    <Block>
      {text && <PhaseCallout phase={phase} text={text} since={execution?.createdAt} />}
      {/* the callout says each phase as it changes, so the stages stay quiet */}
      <Timeline stages={stages} label="Progress" announce="" />
      {(status || executionId) && (
        <MetaLine>
          {status && !stale && `${status}. `}
          {executionId && (
            <>
              Execution <code>{executionId}</code>
            </>
          )}
        </MetaLine>
      )}
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
                <dt>Fee</dt>
                <dd>{amount(retry.networkFee)}</dd>
                <Spends stored={stored} figure={amount(retry.spendable)} />
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
                <dt>You get at least</dt>
                <dd>
                  {fromAtomic(refund.quote.minAmountOut, backTo.decimals)} {backTo.symbol} on {CHAINS.find(({ id }) => id === backTo.blockchain)?.name}
                </dd>
                <dt>Sent to</dt>
                <dd>
                  <code className="font-mono text-[0.8125rem] break-all">{address}</code>
                </dd>
                <dt>Fee</dt>
                <dd>{amount(refund.details.networkFee)}</dd>
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

  return (
    <ExistingFrame title={title}>
      <Facts>
        <dt>Status</dt>
        <dd>
          {status}, {needsSignature ? 'and it still needs your signature' : 'signed'}
        </dd>
        {quote?.depositAddress && (
          <>
            <dt>Deposit</dt>
            <dd>
              {token && paid ? `${fromAtomic(paid, token.decimals)} ${token.symbol}${chain ? ` on ${chain.name}` : ''}` : `${paid} atomic units of ${quote.originAsset}`} to <code>{quote.depositAddress}</code>
            </dd>
          </>
        )}
        {quote?.recipient && (
          <>
            <dt>Delivered to</dt>
            <dd>
              <code>{quote.recipient}</code>
            </dd>
          </>
        )}
        <dt>Deposit hash</dt>
        <dd>{transaction?.evmTxHash ? <code>{transaction.evmTxHash}</code> : 'none seen yet'}</dd>
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
              ? 'Solana is not enabled for this Connect key yet.'
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
  const existing = { address: address!, intermediary, stored, list: list.data, gate: refused, locked, act, resume, drop: dropAndSay };

  // the person reads what will run before they consent to it on a shared link, and finds it under the card elsewhere
  const summary = built.steps && <Summary stored={stored} steps={built.steps} intermediary={intermediary ?? STAND_IN} real={!!intermediary} amountKnown={!!preview} shared={shared} />;
  const quoted = preview && source && target;

  return (
    <div data-ui="run" className="mx-auto flex w-full max-w-run min-w-0 flex-col gap-4">
      {shared && <TrustPanel stored={stored} instructions={stored.steps.length} check={program => <PublishedCheck stored={stored} program={program} />} />}
      {shared && summary}
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
              <>
                {wallet ? (
                  <PaidFrom address={address}>
                    <Button variant="ghost" size="xs" disabled={locked} onClick={() => disconnect()}>
                      Disconnect
                    </Button>
                  </PaidFrom>
                ) : (
                  <span>No wallet connected yet.</span>
                )}
                {suggested && source && target && source.symbol !== target.symbol && (
                  <span className="text-warning">
                    The amount above is worked out in {target.symbol}. For {source.symbol}, enter what it is worth.
                  </span>
                )}
              </>
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
                <input aria-label="Amount you pay" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={locked} onChange={event => clearing(setTyped)(event.target.value)} className={AMOUNT_INPUT} />
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
                  {intermediary && (
                    <p className="min-w-0">
                      Your intermediary on Solana: <Address value={intermediary} full className="text-balance" />
                    </p>
                  )}
                </>
              )
            }
          >
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              {quoted ? <Arrives amount={fromAtomic(preview.execution.quote.minAmountOut, target.decimals)} symbol={target.symbol} kept={kept} /> : <NoFigure />}
              {target && <TokenTag symbol={target.symbol} />}
            </div>
          </Panel>
        </Swap>

        {lookup.error && <Failure error={new Error(`Could not look up your intermediary: ${explain(lookup.error)}`)} retry={lookup.retry} />}
        {list.error && <Failure error={list.error} retry={list.retry} />}

        {preview && source && target && (
          <QuoteBox
            title="Exact amounts"
            action={
              <Button variant="ghost" size="xs" icon={<RefreshCw />} disabled={!canQuote} onClick={askQuote}>
                Get exact amount and fee
              </Button>
            }
          >
            <Figures>
              <dt>You pay</dt>
              <dd>
                <Figure
                  value={
                    <>
                      {fromAtomic(preview.execution.quote.amount, source.decimals)} {source.symbol} on {CHAINS.find(({ id }) => id === source.blockchain)?.name}
                    </>
                  }
                  note="plus the gas of the deposit"
                />
              </dd>
              <dt>Network fee</dt>
              <dd>
                <Figure
                  value={preview.execution.details.networkFee ? `${fromAtomic(preview.execution.details.networkFee, target.decimals)} ${target.symbol}` : 'none stated'}
                  note="taken out of what is delivered"
                />
              </dd>
              <Spends stored={stored} figure={preview.spendable ? `${fromAtomic(preview.spendable, target.decimals)} ${target.symbol}` : '–'} />
            </Figures>
            <Figures className="border-t border-border pt-2.5 empty:hidden">{preview.spendable && outcome?.(preview.spendable)}</Figures>
            {moved && <Notice kind="warn">The quote moved before you signed. These are the new numbers, and nothing was charged.</Notice>}
            {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
          </QuoteBox>
        )}
        {working && !preview && !exec.isBusy && <WorkingLine />}

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
            <Button variant="primary" size="lg" block icon={<PenLine />} loading={exec.isBusy} disabled={locked || !!exec.recovery || !!blocked || unfinished} onClick={sign}>
              Sign and run
            </Button>
          ) : (
            <Button variant={exec.status && atRest ? 'secondary' : 'primary'} size="lg" block icon={<Calculator />} disabled={!canQuote} onClick={askQuote}>
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

        {/* the card above already says what a 409 means, but not that a deletion from it failed */}
        {error && (exec.recovery?.kind !== 'resume-or-cancel' || error !== explain(exec.error)) && <Notice kind="error">{error}</Notice>}
        {deleted && exec.phase !== 'cancelled' && <DeletedLine id={deleted} />}
        {unsigned && !preview && (
          <Alert
            kind="warning"
            actions={
              <Button size="sm" disabled={locked} onClick={cancel(unsigned)} className={LONG_LABEL}>
                Delete it (a signature that moves no money)
              </Button>
            }
          >
            An attempt was created and never signed, and it holds this wallet's one in-flight slot.
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
                  Cancel
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
                <Button size="sm" icon={<Copy />} onClick={() => copyText(deposit.depositAddress, 'Deposit address copied')}>
                  Copy the address
                </Button>
                <Button size="sm" variant="ghost" disabled={exec.isCancelling} onClick={cancel(exec.executionId!)}>
                  Cancel, I will not send it
                </Button>
              </>
            }
          >
            <p>
              Waiting for a deposit of <strong>{depositToken ? `${fromAtomic(deposit.amount, depositToken.decimals)} ${depositToken.symbol}` : `${deposit.amount} atomic units`}</strong> to <code>{deposit.depositAddress}</code>. If you already sent it, wait: sending it again would pay
              twice. If you have not, send it from any wallet and this page will follow it.
            </p>
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
      </RunCard>

      {!shared && summary}
    </div>
  );
}
