import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BACKEND_PLACEHOLDERS, TERMINAL_STATUSES, guards, parseOriginAsset, signIntentsConnectPayload, type Execution, type ExecutionPreview, type ExecutionStep, type SolanaRecipe, type StepsPreview } from '@aurora-is-near/intents-connect';
import { useExecution, useIntentsConnect, type UseExecutionResult } from '@aurora-is-near/intents-connect/react';
import { useIntentsConnectWallet } from '@aurora-is-near/intents-connect-wallet/connect/appkit';
import type { Idl } from '@connect-anything/core';
import { checkCompat, issueText } from './compat.ts';
import { CHAINS, STAGES, STAGE_OF, bridgePlan, bySymbol, existingOffer, explain, fromAtomic, isQuoteMoved, legs, refundBody, retryPlan, stoppedFollowing, toAtomic, type Balance, type Token, type TokenList } from './connect.ts';
import { STAND_IN, buildRecipe, destinationIssue, matchesPublished, parseStored, runsRecipe, signsOnlyRecipe, takesAmount, toSolanaRecipe, type StoredRecipe } from './recipe.ts';
import { AccountList, Failure, FetchError, Notice, short, useAct, useAsync, useJson } from './ui.tsx';

const SOLSCAN = 'https://solscan.io';
const TIME_NOTE = 'After the deposit, execution takes about 150 seconds plus the MPC signature.';
const CANCEL_NOTE = 'Cancelling only deletes the execution. It does not call back a deposit already sent, and this page stops following that deposit: if one is on its way, wait instead. If it reaches your intermediary, Refund here sends it back.';

const PHASE_TEXT: Partial<Record<UseExecutionResult['phase'], string>> = {
  'resolving-identity': 'Looking up your intermediary…',
  planning: 'Working out the exact amounts…',
  creating: 'Creating the execution…',
  'awaiting-signature': 'Sign the message in your wallet.',
  submitting: 'Submitting your signature…',
  'awaiting-deposit': 'Confirm the deposit in your wallet.',
  settling: `Waiting for the bridge and the execution. ${TIME_NOTE}`,
  expired: 'The deposit window has passed. A late deposit can still revive this execution, or you can cancel it.',
  success: 'Done: the instructions ran on Solana.',
  cancelled: 'The execution was cancelled.',
};

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

const External = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

function PublishedCheck({ stored, program }: { stored: StoredRecipe; program: string }) {
  const published = useJson<{ idl: Idl }>(`/api/idl/${program}`);
  if (published.loading) return <span className="tag">checking the program's published IDL…</span>;
  if (!published.data) return <span className="tag warn">could not be compared with an IDL the program publishes, so the names below are only the word of whoever made the link</span>;
  return matchesPublished(stored, program, published.data.idl) ? (
    <span className="tag ok">matches the IDL the program publishes</span>
  ) : (
    <span className="tag bad">differs from the IDL the program publishes: do not trust the names below</span>
  );
}

type SummaryProps = {
  stored: StoredRecipe;
  steps: ReturnType<typeof buildRecipe>;
  intermediary: string;
  real: boolean;
  amountKnown: boolean;
  shared: boolean;
};

function Summary({ stored, steps, intermediary, real, amountKnown, shared }: SummaryProps) {
  const programs = [...new Set(stored.steps.map(({ program }) => program))];
  return (
    <details className="summary" open={shared}>
      <summary>
        What will run: {steps.length} {steps.length === 1 ? 'instruction' : 'instructions'} on {programs.length} {programs.length === 1 ? 'program' : 'programs'}
      </summary>
      <h4>{programs.length === 1 ? 'Program' : 'Programs'}</h4>
      <ul className="programs">
        {programs.map(program => (
          <li key={program}>
            <External href={`${SOLSCAN}/account/${program}`}>
              <code>{program}</code>
            </External>{' '}
            {stored.idls[program].metadata?.name && <span className="hint">calls itself {stored.idls[program].metadata.name}</span>} {shared && <PublishedCheck stored={stored} program={program} />}
          </li>
        ))}
      </ul>
      <h4>Instructions, in this order</h4>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={index}>
            <strong>{step.ixName}</strong> <span className="hint">on {short(step.program)}</span>
            <pre>{JSON.stringify(step.amountArg !== undefined && !amountKnown ? { ...step.args, [step.amountArg]: 'the amount delivered, known after the quote' } : step.args, null, 2)}</pre>
            <div className="hint">
              Data sent: <code>{step.instruction.data.toString('hex')}</code>
              {step.amountArg !== undefined && !amountKnown && ' (0 in place of the amount)'}
            </div>
            <AccountList accounts={step.accounts} program={step.program} intermediary={intermediary} real={real} inputLabel={shared ? 'typed by whoever made the link' : undefined} />
          </li>
        ))}
      </ol>
      {stored.lookupTables?.length ? (
        <>
          <h4>Lookup tables</h4>
          <ul>
            {stored.lookupTables.map(table => (
              <li key={table}>
                <code>{table}</code>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}

function Progress({ exec, chain, resumed }: { exec: UseExecutionResult; chain: string; resumed: boolean }) {
  const { status, phase, execution, executionId, depositTxHash } = exec;
  // a resume asks the wallet for the deposit only while the execution is CREATED: after that the address is shown instead
  const text = exec.error || (resumed && phase === 'awaiting-deposit' && status !== 'CREATED') ? undefined : PHASE_TEXT[phase];
  const stage = status ? STAGE_OF[status] : -1;
  const originChain = (execution?.quote?.originAsset && parseOriginAsset(execution.quote.originAsset)?.chain) || chain;
  const evmTx = CHAINS.find(({ id }) => id === originChain)?.tx ?? CHAINS[0].tx;
  const { evmTxHash, solanaTxHash } = execution?.transaction ?? {};
  const failed = status === 'DEPOSIT_FAILED' || status === 'OPERATION_FAILED';
  return (
    <div className="progress">
      <h3>Status</h3>
      <ol className="stages">
        {STAGES.map((name, index) => {
          const last = index === STAGES.length - 1;
          const label = last && status === 'SUCCESS' ? 'SUCCESS' : last && failed ? 'FAILED' : name;
          return (
            <li key={name} className={index < stage ? 'done' : index === stage ? (failed ? 'bad' : status === 'SUCCESS' ? 'good' : 'now') : ''} aria-current={index === stage ? 'step' : undefined}>
              {label}
            </li>
          );
        })}
      </ol>
      {text && <p role="status">{text}</p>}
      <p className="hint">
        {status && `${status}. `}
        {executionId && (
          <>
            Execution <code>{executionId}</code>
          </>
        )}
      </p>
      <ul className="links">
        {depositTxHash && (
          <li>
            Deposit: <External href={`${evmTx}${depositTxHash}`}>{short(depositTxHash)}</External>
          </li>
        )}
        {evmTxHash && evmTxHash !== depositTxHash && (
          <li>
            EVM transaction: <External href={`${evmTx}${evmTxHash}`}>{short(evmTxHash)}</External>
          </li>
        )}
        {solanaTxHash && (
          <li>
            Solana transaction: <External href={`${SOLSCAN}/tx/${solanaTxHash}`}>{short(solanaTxHash)}</External>
          </li>
        )}
      </ul>
    </div>
  );
}

const Spends = ({ stored, figure }: { stored: StoredRecipe; figure: string }) =>
  takesAmount(stored) ? (
    <>
      <dt>The recipe spends</dt>
      <dd>{figure}</dd>
    </>
  ) : (
    <>
      <dt>Amounts</dt>
      <dd>Fixed in the recipe's instructions and listed under What will run, whatever you pay here. What they do not spend stays with your intermediary.</dd>
    </>
  );

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
    <div className="recover">
      {execution ? <Notice kind="error">{isRefund ? 'The Refund failed, so the money is still with your intermediary. You can send it back again.' : 'The instructions failed on Solana, so the money stayed with your intermediary. You can run them again with it, or send it back.'}</Notice> : <Notice>Whatever a run does not spend stays with your intermediary until you send it back.</Notice>}
      {!token && <Notice kind="error">Intents Connect no longer lists the token of this execution, so its balance cannot be read here.</Notice>}
      {balance.loading && <Notice>Reading what your intermediary holds…</Notice>}
      {balance.error && <Failure error={balance.error} retry={balance.retry} />}
      {held?.amount === '0' && <Notice>Your intermediary holds no {symbol} now, so there is nothing to retry with or send back.</Notice>}
      {held && held.amount !== '0' && (
        <>
          <p>
            Your intermediary holds <strong>{amount(held.amount)}</strong>.
          </p>
          {execution && !isRefund && !sameRecipe && <p className="hint">Retry is offered on the page of the recipe that failed.</p>}
          {sameRecipe && gate && <p className="hint">{gate}</p>}
          <div className="row">
            {sameRecipe && (
              <button disabled={locked || !!gate} onClick={askRetry}>
                Retry
              </button>
            )}
            <button disabled={locked || !backTo} onClick={askRefund}>
              Refund
            </button>
          </div>
          {retry && (
            <div className="card">
              <dl className="figures">
                <dt>Fee</dt>
                <dd>{amount(retry.networkFee)}</dd>
                <Spends stored={stored} figure={amount(retry.spendable)} />
              </dl>
              {moved && <Notice kind="warn">The fee moved before you signed. These are the new numbers, and nothing was charged.</Notice>}
              {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
              <button className="primary" disabled={locked || !!gate} onClick={signRetry}>
                Sign and retry
              </button>
            </div>
          )}
          {refund && backTo && (
            <div className="card">
              <dl className="figures">
                <dt>You get at least</dt>
                <dd>
                  {fromAtomic(refund.quote.minAmountOut, backTo.decimals)} {backTo.symbol} on {CHAINS.find(({ id }) => id === backTo.blockchain)?.name}
                </dd>
                <dt>Sent to</dt>
                <dd>
                  <code>{address}</code>
                </dd>
                <dt>Fee</dt>
                <dd>{amount(refund.details.networkFee)}</dd>
              </dl>
              <p className="hint">Figures from a test run: the real one can differ by what the price does in the seconds before you sign.</p>
              {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
              <button className="primary" disabled={locked} onClick={signRefund}>
                Sign and refund
              </button>
            </div>
          )}
        </>
      )}
    </div>
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
  const hide = onHide && <button onClick={onHide}>Hide</button>;
  // a 409 stays on the screen until a new flow starts, and once the execution is over a reload is the way to one
  const reload = !onHide && <button onClick={() => location.reload()}>Reload this page</button>;

  if (!execution) {
    return (
      <div className="card">
        {title}
        {found.loading && <Notice>Reading it…</Notice>}
        {found.error && <Failure error={new Error(`Could not read it, so nothing is offered for it yet: ${explain(found.error)}`)} retry={found.retry} />}
        {execution === null && <p>Connect no longer has it.</p>}
        {hide}
        {execution === null && reload}
      </div>
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
    <div className="card">
      {title}
      <dl className="figures">
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
      </dl>
      <details className="summary" open={asksWallet || other}>
        <summary>
          What it runs: {steps.length} {steps.length === 1 ? 'instruction' : 'instructions'}
        </summary>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={index}>
              {'programId' in step ? (
                <>
                  <code>{step.programId}</code>
                  <div className="hint">
                    Data: <code>{step.discriminator}</code>
                  </div>
                  {step.args?.length > 0 && <pre>{JSON.stringify(step.args, null, 2)}</pre>}
                  <ul className="programs">
                    {step.accounts?.map(({ pubkey }, at) => (
                      <li key={at}>
                        <code>{pubkey}</code> {(pubkey === BACKEND_PLACEHOLDERS.intermediary || pubkey === intermediary) && <em>your intermediary</em>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <pre>{JSON.stringify(step, null, 2)}</pre>
              )}
            </li>
          ))}
        </ol>
      </details>
      {other && asksWallet && <Notice kind="error">This is not the recipe on this page, so this page will not sign or fund it. Anyone who knows your wallet address can create an execution for it, so if you did not start this one, delete it.</Notice>}
      {other && !asksWallet && <p className="hint">This is not the recipe on this page.</p>}
      {over && <p>It is no longer in flight, so a new run can start.</p>}
      {!asksWallet && !over && !terminal && <p className="hint">It is already signed, so resuming only follows it here and asks your wallet for nothing.</p>}
      {asksWallet && !deletable && <Notice kind="warn">{CANCEL_NOTE}</Notice>}
      {resumable && !open && gate && <p className="hint">{gate}</p>}
      <div className="row">
        {resumable && (
          <button disabled={locked || !open} onClick={resume(id)}>
            Resume it
          </button>
        )}
        {asksWallet && (
          <button disabled={locked} onClick={remove}>
            {deletable ? 'Delete it (a signature that moves no money)' : 'Cancel it'}
          </button>
        )}
        {hide}
        {over && reload}
      </div>
    </div>
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

  return (
    <div className="execute">
      {shared && (
        <Notice kind="warn">
          <strong>This recipe was made by whoever shared this link, not by Connect Anything.</strong> Nobody has checked it. If you run it you pay from your own wallet, and the instructions below run on Solana with your intermediary as the signer, so they can move whatever
          your intermediary holds. Run it only if you trust the person who sent you the link and you understand what is listed here.
        </Notice>
      )}
      {built.steps && <Summary stored={stored} steps={built.steps} intermediary={intermediary ?? STAND_IN} real={!!intermediary} amountKnown={!!preview} shared={shared} />}
      {built.problem && <Notice kind="error">This recipe cannot be built: {built.problem}</Notice>}
      {issues.length > 0 && (
        <Notice kind="error">
          Connect cannot run this recipe:
          {issues.map(issue => (
            <div key={issueText(issue)}>{issueText(issue)}</div>
          ))}
        </Notice>
      )}
      {shared && (
        <label className="inline consent">
          <input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)} /> I have read what will run, and I accept that it was made by whoever shared this link.
        </label>
      )}

      <h3>Wallet</h3>
      {wallet ? (
        <p>
          <code>{address}</code>{' '}
          <button disabled={locked} onClick={() => disconnect()}>
            Disconnect
          </button>
        </p>
      ) : (
        <button className="primary" disabled={isConnecting} onClick={() => connect()}>
          {isConnecting ? 'Connecting…' : 'Connect EVM wallet'}
        </button>
      )}
      {lookup.error && <Failure error={new Error(`Could not look up your intermediary: ${explain(lookup.error)}`)} retry={lookup.retry} />}
      {intermediary && (
        <p className="hint">
          Your intermediary on Solana: <code>{intermediary}</code>
        </p>
      )}

      <h3>Pay from</h3>
      {list.loading && <Notice>Loading tokens…</Notice>}
      {list.error && <Failure error={list.error} retry={list.retry} />}
      {list.data && (
        <div className="grid">
          <label>
            Chain{' '}
            <select value={chain} disabled={locked} onChange={event => clearing(setChain)(event.target.value)}>
              {CHAINS.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Token{' '}
            <select value={source?.assetId ?? ''} disabled={locked || !source} onChange={event => clearing(setPick)(event.target.value)}>
              {sources.map(token => (
                <option key={token.assetId} value={token.assetId}>
                  {token.symbol} {token.contractAddress ? `(${short(token.contractAddress)})` : '(native)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount <input inputMode="decimal" placeholder="0.00" value={amount} disabled={locked} onChange={event => clearing(setTyped)(event.target.value)} />
          </label>
        </div>
      )}
      {suggested && source && target && source.symbol !== target.symbol && (
        <p className="hint">
          The amount above is worked out in {target.symbol}. For {source.symbol}, enter what it is worth.
        </p>
      )}
      <p className="hint">{TIME_NOTE}</p>
      {target && <p className="hint">It arrives on Solana as {target.symbol}.</p>}
      {blocked && <p className="hint">{blocked}</p>}
      <button disabled={!canQuote} onClick={askQuote}>
        Get exact amount and fee
      </button>
      {working && !preview && !exec.isBusy && <Notice>Working…</Notice>}

      {preview && source && target && (
        <div className="card">
          <dl className="figures">
            <dt>You pay</dt>
            <dd>
              {fromAtomic(preview.execution.quote.amount, source.decimals)} {source.symbol} on {CHAINS.find(({ id }) => id === source.blockchain)?.name}, plus the gas of the deposit
            </dd>
            <dt>Network fee</dt>
            <dd>
              {preview.execution.details.networkFee ? `${fromAtomic(preview.execution.details.networkFee, target.decimals)} ${target.symbol}` : 'none stated'}, taken out of what is delivered
            </dd>
            <Spends stored={stored} figure={preview.spendable ? `${fromAtomic(preview.spendable, target.decimals)} ${target.symbol}` : '–'} />
            {preview.spendable && outcome?.(preview.spendable)}
          </dl>
          {moved && <Notice kind="warn">The quote moved before you signed. These are the new numbers, and nothing was charged.</Notice>}
          {unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
          <p className="hint">Your wallet asks for one signature, then for the deposit, switching to {CHAINS.find(({ id }) => id === source.blockchain)?.name} if it is on another network.</p>
          <button className="primary" disabled={locked || !!exec.recovery || !!blocked || unfinished} onClick={sign}>
            Sign and run
          </button>
        </div>
      )}

      {unsigned && !preview && (
        <Notice kind="warn">
          An attempt was created and never signed, and it holds this wallet's one in-flight slot. <button disabled={locked} onClick={cancel(unsigned)}>Delete it (a signature that moves no money)</button>
        </Notice>
      )}
      {address && exec.recovery?.kind === 'resume-or-cancel' && <Existing key={exec.recovery.executionId} id={exec.recovery.executionId} head="This wallet already has an execution in flight, and Connect runs one at a time per wallet and chain:" {...existing} />}
      {exec.recovery?.kind === 'retry-transfer' && (
        <Notice kind="warn">
          The deposit transfer did not go through. {CANCEL_NOTE}{' '}
          <button disabled={locked} onClick={act(() => exec.retryDeposit())}>
            Send the deposit again
          </button>{' '}
          <button disabled={locked} onClick={cancel(exec.recovery.executionId)}>
            Cancel
          </button>
        </Notice>
      )}
      {unfinished && (
        <Notice kind="warn">
          This execution has not finished, and this page stopped following it. Do not pay again before you know how it ended.{' '}
          <button disabled={locked} onClick={resume(exec.executionId!)}>
            Resume
          </button>
        </Notice>
      )}
      {address && !exec.executionId && !locked && !exec.recovery && last && <Existing key={last} id={last} head="You started an execution from this browser:" onHide={() => setHidden([...hidden, last])} {...existing} />}
      {/* the card above already says what a 409 means, but not that a deletion from it failed */}
      {error && (exec.recovery?.kind !== 'resume-or-cancel' || error !== explain(exec.error)) && <Notice kind="error">{error}</Notice>}
      {deleted && exec.phase !== 'cancelled' && (
        <Notice>
          Execution <code>{deleted}</code> was deleted, so a new run can start.
        </Notice>
      )}

      {(exec.status || exec.isBusy || exec.phase === 'cancelled') && <Progress exec={exec} chain={chain} resumed={resumed} />}
      {resumed && deposit?.depositAddress && !exec.depositTxHash && !exec.execution?.transaction?.evmTxHash && (exec.status === 'DEPOSIT_PENDING' || exec.status === 'EXPIRED') && (
        <Notice>
          Waiting for a deposit of {depositToken ? `${fromAtomic(deposit.amount, depositToken.decimals)} ${depositToken.symbol}` : `${deposit.amount} atomic units`} to <code>{deposit.depositAddress}</code>. If you already sent it, wait: sending it again would pay twice. If you have not, send it from any wallet and this page will follow it. {CANCEL_NOTE}{' '}
          <button disabled={exec.isCancelling} onClick={cancel(exec.executionId!)}>
            Cancel, I will not send it
          </button>
        </Notice>
      )}
      {exec.phase === 'expired' && !resumed && (
        <Notice kind="warn">
          {CANCEL_NOTE}{' '}
          <button disabled={exec.isCancelling} onClick={cancel(exec.executionId!)}>
            Cancel the execution
          </button>
        </Notice>
      )}
      {exec.status === 'DEPOSIT_FAILED' && <Notice kind="error">The deposit failed, for example on an invalid amount, so nothing ran on Solana. What was transferred is refunded.</Notice>}
      {list.data && (failed || atRest) && <Recover key={failed?.id} exec={exec} execution={failed} unsigned={unsigned} act={act} locked={locked || !!exec.recovery || unfinished} recipe={recipe} stored={stored} gate={refused} list={list.data} intermediary={intermediary} source={source} />}
    </div>
  );
}

export function SharedRecipe({ id }: { id: string }) {
  const exec = useExecution();
  const found = useJson<unknown>(`/api/recipes/${encodeURIComponent(id)}`);
  const parsed = useMemo(() => {
    if (found.data === undefined) return undefined;
    try {
      const stored = parseStored(found.data);
      return { stored, recipe: toSolanaRecipe(stored) };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [found.data]);
  const missing = found.error instanceof FetchError && (found.error.status === 404 || found.error.status === 400);

  return (
    <section>
      <h2>A recipe someone shared with you</h2>
      {found.loading && <Notice>Loading the recipe…</Notice>}
      {missing && <Notice kind="error">This link does not lead to a recipe. Check it with whoever sent it to you.</Notice>}
      {found.error && !missing && <Failure error={found.error} retry={found.retry} />}
      {parsed?.problem && <Notice kind="error">{parsed.problem} Nothing can run from this link.</Notice>}
      {parsed?.stored && <Execute exec={exec} recipe={parsed.recipe} stored={parsed.stored} shared />}
    </section>
  );
}
