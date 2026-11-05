import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Calculator, Clock, Copy, FileWarning, Link2Off, PenLine, RefreshCw, RotateCcw, Undo2, Wallet } from 'lucide-react';
import type { SolanaStep } from '@aurora-is-near/intents-connect';
import type { UseExecutionResult } from '@aurora-is-near/intents-connect/react';
import { rescueRecipe, type Obligation, type ObligationRow } from '@connect-anything/kamino-rescue';
import { CHAINS, STAGES } from '../../connect.ts';
import { Dead, Loading, SharedHeader } from '../../features/run/shared.tsx';
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
  type Tone,
} from '../../features/run/parts.tsx';
import { IdlCheck, Summary, TrustPanel, type IdlState } from '../../features/run/summary.tsx';
import { CANCEL_NOTE, DOING, PHASE_TEXT, TIME_NOTE } from '../../features/run/words.ts';
import { buildRecipe, type StoredRecipe } from '../../recipe.ts';
import { Failure, Notice, short } from '../../ui.tsx';
import { Address, Alert, Button, ChainIcon, Checkbox, Skeleton, Timeline, TokenIcon, chainMeta, type StageState, type TimelineStage } from '../../ui/index.ts';
import { Demo, DemoGrid, Surface } from './kit.tsx';
import type { DevSection } from './types.ts';

// The 27 states of the run card (Execute, src/features/run/execute.tsx), numbered as in the redesign brief, and the states
// of /r/:id. Each is drawn from the same presentational parts as the card, on made-up figures: nothing here asks a wallet
// or Connect anything.

const EVM_WALLET = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const SOLANA_WALLET = 'GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW';
const INTERMEDIARY = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EXECUTION = '0b6c1f3e-8a2d-4c57-9e41-7d3a5f2b9c80';
const DEPOSIT_ADDRESS = '0x7F3a9C1e5B2d4A6f8E0c2B4d6F8a0C2e4B6d8F0a';
const DEPOSIT_TX = '0x9f2c4e6a8b0d1f3e5a7c9b1d3f5e7a9c0b2d4f6e8a1c3e5b7d9f0a2c4e6b8d0f';
const SOLANA_TX = '5j7s1QzqC9JZtV3XbJrK4m8nW2pF6dY9uH3gL1aB7cE5vR8tN2kM4qP6sD9fG3hJ5kL7mN9pQ2rS4tV6wX8yZ1a';
const USDC_ON_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Two minutes and a bit ago, for the clock of a run that is settling. */
const SINCE = new Date(Date.now() - 128_000).toISOString();
const STARTED = '4:54 PM';

// A Kamino repay on a made-up position, built by the same functions as the real one, for what will run.
const SOME = 'PfqP2R8NB8gNjegeNrsjTVv4epj3WqcH8S58QQL5UwH';
const DEBT: ObligationRow = {
  reserve: SOME,
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
  amount: '1000000000',
  usd: 1000,
  tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  supplyVault: SOME,
  debtFarm: null,
  pythOracle: null,
  switchboardPriceOracle: null,
  switchboardTwapOracle: null,
  scopePrices: SOME,
};
const POSITION: Obligation = {
  address: SOME,
  market: SOME,
  deposits: [],
  borrows: [DEBT],
  collateralUsd: 2000,
  debtUsd: 1000,
  adjustedDebtUsd: 1000,
  ltv: 0.5,
  liquidationLtv: 0.8,
  refreshRemaining: [SOME],
  repayRemaining: [],
  unjoinedDebtFarms: [],
};
const RECIPE = (() => {
  try {
    const stored: StoredRecipe = rescueRecipe(POSITION, DEBT);
    // before the quote the amount is 0 in the data, and after it the amount delivered
    return { stored, steps: buildRecipe(stored, INTERMEDIARY, '0'), quoted: buildRecipe(stored, INTERMEDIARY, '776160000') };
  } catch (error) {
    return { problem: (error as Error).message };
  }
})();

/** Steps as Connect lists them for an execution: a refresh and a repay, the intermediary as the signer. */
const STEPS: SolanaStep[] = [
  {
    programId: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
    discriminator: '07930a4a8f1d8e2f',
    args: [],
    accounts: [
      { pubkey: SOME, isSigner: false, isWritable: true },
      { pubkey: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF', isSigner: false, isWritable: false },
    ],
  },
  {
    programId: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
    discriminator: '74ae9b6f9d03c5a1',
    args: [{ name: 'liquidity_amount', type: 'u64', value: '776160000' }],
    accounts: [
      { pubkey: '{INTERMEDIARY}', isSigner: true, isWritable: false },
      { pubkey: SOME, isSigner: false, isWritable: true },
      { pubkey: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', isSigner: false, isWritable: false },
    ],
  },
];

/** The explorer links of a run, as the stages show them. */
const DEPOSIT_LINK = <ExplorerLink href={`${CHAINS[0].tx}${DEPOSIT_TX}`} label={short(DEPOSIT_TX)} explorer={chainMeta('base')!.explorer} />;
const SOLANA_LINK = <ExplorerLink href={`https://solscan.io/tx/${SOLANA_TX}`} label={short(SOLANA_TX)} explorer="Solscan" />;

/** The figures of a quote, already formatted, as execute.tsx passes them. */
type Quote = {
  pay: string;
  fee: string;
  /** What the recipe spends; none for a recipe with its amounts written in. */
  spends?: string;
  arrives: string;
  kept: number | null;
  /** The rows the page adds, as the Kamino repay does. */
  outcome?: ReactNode;
  moved?: boolean;
  unsigned?: boolean;
};

const KAMINO_QUOTE: Quote = {
  pay: '800 USDC on Base',
  fee: '0.12 USDC',
  spends: '776.16 USDC',
  arrives: '776.16',
  kept: 0.0298,
  outcome: (
    <>
      <dt>It repays</dt>
      <dd>776.16 USDC</dd>
      <dt>LTV after, at today's prices</dt>
      <dd>11.2%</dd>
    </>
  ),
};

type SceneProps = {
  /** Which wallet is connected: none before one is. */
  wallet?: 'evm' | 'solana';
  amount?: string;
  /** The token paid with; null when Connect takes none from the chain. */
  token?: string | null;
  /** The token the recipe receives; null when Connect does not deliver it. */
  target?: string | null;
  /** The intermediary: looked up, being looked up, or null when Solana is off for the key. */
  intermediary?: string | null | 'loading';
  /** A run or a request is under way, so the fields wait. */
  locked?: boolean;
  quote?: Quote;
  /** Above the card: why the recipe cannot run. */
  above?: ReactNode;
  /** Under the swap: a lookup that failed. */
  failure?: ReactNode;
  working?: boolean;
  /** A shared recipe's consent, given or not. */
  consent?: boolean;
  button: ReactNode;
  reason?: [Tone, string];
  /** Everything under the button, as execute.tsx orders it. */
  children?: ReactNode;
};

/** The card, laid out as Execute lays it out, on the values given. */
function Scene({ wallet, amount = '800', token = 'USDC', target = 'USDC', intermediary, locked = false, quote, above, failure, working = false, consent, button, reason, children }: SceneProps) {
  return (
    <div className="mx-auto flex w-full max-w-run min-w-0 flex-col gap-4">
      {above}
      <RunCard>
        <Swap>
          <Panel
            label="You pay"
            idle={!wallet}
            aside={
              <SelectPill
                label="Chain"
                compact
                defaultValue="base"
                disabled={locked}
                display={
                  <>
                    <ChainIcon chain="base" size={18} />
                    Base
                  </>
                }
              >
                {CHAINS.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </SelectPill>
            }
            footer={
              wallet ? (
                <PaidFrom address={wallet === 'evm' ? EVM_WALLET : SOLANA_WALLET}>
                  <Button variant="ghost" size="xs" disabled={locked}>
                    Disconnect
                  </Button>
                </PaidFrom>
              ) : (
                <span>No wallet connected yet.</span>
              )
            }
          >
            <input aria-label="Amount you pay" inputMode="decimal" autoComplete="off" placeholder="0.00" defaultValue={amount} disabled={locked} className={AMOUNT_INPUT} />
            <SelectPill
              label="Token"
              defaultValue="usdc"
              disabled={locked || !token}
              display={
                token ? (
                  <>
                    <TokenIcon symbol={token} size={22} />
                    {token}
                  </>
                ) : (
                  'None'
                )
              }
            >
              {token && <option value="usdc">{`${token} (${short(USDC_ON_BASE)})`}</option>}
            </SelectPill>
          </Panel>
          <PanelArrow />
          <Panel
            label="You get"
            idle={!wallet}
            aside={<ChainTag chain="sol" name="Solana" />}
            footer={
              (target || intermediary) && (
                <>
                  {target && <span>It arrives on Solana as {target}.</span>}
                  {intermediary === 'loading' && <Skeleton className="h-4 w-4/5" />}
                  {intermediary && intermediary !== 'loading' && (
                    <p className="min-w-0">
                      Your intermediary on Solana: <Address value={intermediary} full className="text-balance" />
                    </p>
                  )}
                </>
              )
            }
          >
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              {quote && target ? <Arrives amount={quote.arrives} symbol={target} kept={quote.kept} /> : <NoFigure />}
              {target && <TokenTag symbol={target} />}
            </div>
          </Panel>
        </Swap>
        {failure}
        {quote && (
          <QuoteBox
            title="Exact amounts"
            action={
              <Button variant="ghost" size="xs" icon={<RefreshCw />} disabled={locked}>
                Get exact amount and fee
              </Button>
            }
          >
            <Figures>
              <dt>You pay</dt>
              <dd>
                <Figure value={quote.pay} note="plus the gas of the deposit" />
              </dd>
              <dt>Network fee</dt>
              <dd>
                <Figure value={quote.fee} note="taken out of what is delivered" />
              </dd>
              <SpendsRow figure={quote.spends} />
            </Figures>
            <Figures className="border-t border-border pt-2.5 empty:hidden">{quote.outcome}</Figures>
            {quote.moved && <Notice kind="warn">The quote moved before you signed. These are the new numbers, and nothing was charged.</Notice>}
            {quote.unsigned && <Notice kind="warn">Your wallet will first ask you to sign the deletion of the earlier attempt. That moves no money.</Notice>}
          </QuoteBox>
        )}
        {working && <WorkingLine />}
        {consent !== undefined && <Consent given={consent} />}
        <div className="flex flex-col gap-2.5">
          {button}
          <div aria-live="polite">{reason && <Reason tone={reason[0]}>{reason[1]}</Reason>}</div>
          {quote && <Caption icon={<PenLine />}>Your wallet asks for one signature, then for the deposit, switching to Base if it is on another network.</Caption>}
          <Caption icon={<Clock />}>{TIME_NOTE}</Caption>
        </div>
        {children}
      </RunCard>
    </div>
  );
}

function Consent({ given }: { given: boolean }) {
  const [checked, setChecked] = useState(given);
  return (
    <ConsentBox given={checked}>
      <Checkbox checked={checked} onChange={setChecked} label="I have read what will run, and I accept that it was made by whoever shared this link." />
    </ConsentBox>
  );
}

const CONNECT = (
  <Button variant="primary" size="lg" block icon={<Wallet />}>
    Connect EVM wallet
  </Button>
);
const SWITCH = (
  <Button variant="primary" size="lg" block icon={<ArrowLeftRight />}>
    Switch wallet
  </Button>
);
const quoteButton = ({ disabled = false, again = false } = {}) => (
  <Button variant={again ? 'secondary' : 'primary'} size="lg" block icon={<Calculator />} disabled={disabled}>
    Get exact amount and fee
  </Button>
);
const signButton = ({ busy = false } = {}) => (
  <Button variant="primary" size="lg" block icon={<PenLine />} loading={busy} disabled={busy}>
    Sign and run
  </Button>
);

type Phase = UseExecutionResult['phase'];

type RunProps = {
  phase: Phase;
  /** The stage the execution is at, -1 before it exists. */
  at: number;
  now: StageState;
  note?: ReactNode;
  /** The raw status under the stages, left out when it is stale. */
  status?: string;
  links?: ReactNode[];
  /** The last stage's name once it is over. */
  last?: string;
  /** The callout above the stages: none once an error says it. */
  callout?: boolean;
};

/** The run's progress, as Progress in execute.tsx draws it: done before the stage it is at, waiting after. */
function Run({ phase, at, now, note, status, links = [], last, callout = true }: RunProps) {
  const text = callout && PHASE_TEXT[phase];
  const stages: TimelineStage[] = STAGES.map((name, index) => ({
    id: name,
    title: index === STAGES.length - 1 && last ? last : name,
    state: index < at ? 'done' : index === at ? now : 'pending',
    description: index === at ? note : undefined,
    time: index === 0 && at >= 0 ? STARTED : undefined,
    link: links[index],
  }));
  return (
    <Block>
      {text && <PhaseCallout phase={phase} text={text} since={SINCE} />}
      <Timeline stages={stages} label="Progress" announce="" />
      {at >= 0 && (
        <MetaLine>
          {status && `${status}. `}Execution <code>{EXECUTION}</code>
        </MetaLine>
      )}
    </Block>
  );
}

const DEPOSIT_FACT = (
  <>
    800 USDC on Base to <code>{DEPOSIT_ADDRESS}</code>
  </>
);

function existingTitle(head: string) {
  return (
    <p>
      {head} <code>{EXECUTION}</code>
    </p>
  );
}

function Program({ state }: { state: IdlState }) {
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <code className="font-mono text-[0.8125rem] text-text">KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD</code>
      <IdlCheck state={state} />
    </li>
  );
}

const REFUND_TILE = (
  <OptionTile icon={<Undo2 />} title="Send it back" action={<Button size="sm">Refund</Button>}>
    As USDC on Base, to the wallet connected here.
  </OptionTile>
);

const run = (number: string, id: string, title: string, description: string, render: () => ReactNode): DevSection => ({ id: `run-${number}-${id}`, title: `${number} · ${title}`, description, render });

export const sections: DevSection[] = [
  run('01', 'no-wallet', 'No wallet', '!wallet. From and To wait, and the one button connects a wallet. Nothing is quoted before one does.', () => (
    <Scene button={CONNECT} reason={['muted', 'Connect an EVM wallet to continue.']} />
  )),
  run('02', 'not-evm', 'Not an EVM wallet', '!isEvm. A Solana wallet cannot pay: Switch wallet disconnects it and opens the list of wallets.', () => (
    <Scene wallet="solana" button={SWITCH} reason={['warning', 'This is not an EVM wallet. Recipes are paid from Base, Arbitrum or Ethereum, so connect an EVM wallet.']} />
  )),
  run('03', 'lookup', 'Looking up the intermediary', 'lookup.loading. The line of the intermediary is a skeleton until Connect answers.', () => (
    <Scene wallet="evm" intermediary="loading" button={quoteButton({ disabled: true })} reason={['muted', 'Looking up your intermediary…']} />
  )),
  run('04', 'lookup-failed', 'The lookup failed', 'lookup.error. What went wrong, and Try again.', () => (
    <Scene
      wallet="evm"
      failure={<Failure error={new Error('Could not look up your intermediary: Intents Connect is not answering right now (503).')} retry={() => {}} />}
      button={quoteButton({ disabled: true })}
    />
  )),
  run('05', 'solana-off', 'Solana is off for the key', 'intermediary === null. Nothing can run until the Connect key has Solana.', () => (
    <Scene wallet="evm" intermediary={null} button={quoteButton({ disabled: true })} reason={['danger', 'Solana is not enabled for this Connect key yet.']} />
  )),
  run('06', 'not-delivered', "The recipe's token is not delivered", '!target. Connect does not deliver the token the recipe receives.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} target={null} button={quoteButton({ disabled: true })} reason={['danger', "Intents Connect does not deliver this recipe's token right now, so it cannot run."]} />
  )),
  run('07', 'cannot-run', 'The recipe cannot be built, or Connect would refuse it', 'built.problem, issues. The reasons above the card.', () => (
    <Scene
      wallet="evm"
      intermediary={INTERMEDIARY}
      above={
        <>
          <Notice kind="error">This recipe cannot be built: refresh_obligation needs an address for obligation.</Notice>
          <Notice kind="error">
            Connect cannot run this recipe:
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
              <li>No step touches USDT, the token this recipe receives, so Connect refuses it.</li>
            </ul>
          </Notice>
        </>
      }
      button={quoteButton({ disabled: true })}
      reason={['muted', 'This recipe cannot run, see above.']}
    />
  )),
  run('08', 'consent', 'A shared recipe waits for consent', 'shared && !understood. The box is marked until it is ticked, right above the button.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} consent={false} button={quoteButton({ disabled: true })} reason={['muted', 'Tick the box above first.']} />
  )),
  run('09', 'no-amount', 'No amount, or no token on the chain', 'missing. What is missing, under the button.', () => (
    <DemoGrid>
      <Demo title="No amount">
        <Scene wallet="evm" intermediary={INTERMEDIARY} amount="" button={quoteButton({ disabled: true })} reason={['muted', 'Enter an amount of USDC.']} />
      </Demo>
      <Demo title="No token from this chain">
        <Scene wallet="evm" intermediary={INTERMEDIARY} token={null} button={quoteButton({ disabled: true })} reason={['muted', 'Intents Connect takes no token from this chain right now.']} />
      </Demo>
    </DemoGrid>
  )),
  run('10', 'quoting', 'The quote is being worked out', 'working && !preview. The fields wait, through the 503s of a busy Connect.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} locked working button={quoteButton({ disabled: true })} />
  )),
  run('11', 'quote', 'The quote', 'preview. What is paid, what arrives at least, the fee, what the recipe spends, and what the page adds. A bridge that keeps 1% or more is marked.', () => (
    <DemoGrid>
      <Demo title="Kamino repay, the bridge keeps 3%">
        <Scene wallet="evm" intermediary={INTERMEDIARY} quote={KAMINO_QUOTE} button={signButton()} />
      </Demo>
      <Demo title="Amounts written into the recipe">
        <Scene wallet="evm" intermediary={INTERMEDIARY} amount="25" quote={{ pay: '25 USDC on Base', fee: '0.02 USDC', arrives: '24.91', kept: 0.0036 }} button={signButton()} />
      </Demo>
    </DemoGrid>
  )),
  run('12', 'moved', 'The quote moved', 'moved. New figures, and nothing was charged.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} quote={{ ...KAMINO_QUOTE, arrives: '775.94', spends: '775.94 USDC', kept: 0.0301, moved: true }} button={signButton()} />
  )),
  run('13', 'unsigned', 'An attempt never signed', 'unsigned. It holds the wallet’s one in-flight slot until it is deleted, and a new run deletes it first.', () => (
    <DemoGrid>
      <Demo title="Declined, nothing quoted">
        <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton()}>
          <Notice kind="error">You declined the signature in your wallet.</Notice>
          <Alert
            kind="warning"
            actions={
              <Button size="sm" className={LONG_LABEL}>
                Delete it (a signature that moves no money)
              </Button>
            }
          >
            An attempt was created and never signed, and it holds this wallet's one in-flight slot.
          </Alert>
          <Run phase="failed" at={0} now="failed" note="Not signed" status="CREATED" callout={false} />
        </Scene>
      </Demo>
      <Demo title="Quoted again">
        <Scene wallet="evm" intermediary={INTERMEDIARY} quote={{ ...KAMINO_QUOTE, unsigned: true }} button={signButton()}>
          <Run phase="failed" at={0} now="failed" note="Not signed" status="CREATED" callout={false} />
        </Scene>
      </Demo>
    </DemoGrid>
  )),
  run('14', 'phases', 'The run, phase by phase', 'resolving-identity … settling. The stage in progress, the wallet to check, and in settling the time so far.', () => (
    <div className="flex flex-col gap-10">
      <Demo title="awaiting-signature, in the card">
        <Scene wallet="evm" intermediary={INTERMEDIARY} locked quote={KAMINO_QUOTE} button={signButton({ busy: true })}>
          <Run phase="awaiting-signature" at={0} now="active" note={DOING[0]} status="CREATED" />
        </Scene>
      </Demo>
      <DemoGrid>
        {(
          [
            ['resolving-identity', -1, undefined, undefined],
            ['planning', -1, undefined, undefined],
            ['creating', -1, undefined, undefined],
            ['submitting', 0, 'CREATED', undefined],
            // the CREATED the page holds after the signature is stale, so it is left out
            ['awaiting-deposit', 1, undefined, undefined],
            ['settling', 2, 'DEPOSIT_PROCESSING', [undefined, DEPOSIT_LINK]],
            ['settling', 3, 'OPERATION_PROCESSING', [undefined, DEPOSIT_LINK]],
          ] as [Phase, number, string | undefined, ReactNode[] | undefined][]
        ).map(([phase, at, status, links]) => (
          <Demo key={`${phase}-${at}`} title={status ? `${phase}, ${status}` : phase}>
            <Surface className="py-0">
              <Run phase={phase} at={at} now="active" note={DOING[at]} status={status} links={links} />
            </Surface>
          </Demo>
        ))}
      </DemoGrid>
    </div>
  )),
  run('15', 'in-flight', 'Another execution is in flight (409)', "recovery.kind === 'resume-or-cancel'. Read before anything is offered: only this page's recipe is resumed.", () => (
    <DemoGrid>
      <Demo title="This recipe, signed">
        <Scene wallet="evm" intermediary={INTERMEDIARY} quote={KAMINO_QUOTE} button={<Button variant="primary" size="lg" block icon={<PenLine />} disabled>Sign and run</Button>}>
          <ExistingFrame title={existingTitle('This wallet already has an execution in flight, and Connect runs one at a time per wallet and chain:')}>
            <Facts>
              <dt>Status</dt>
              <dd>DEPOSIT_PENDING, signed</dd>
              <dt>Deposit</dt>
              <dd>{DEPOSIT_FACT}</dd>
              <dt>Delivered to</dt>
              <dd>
                <code>{INTERMEDIARY}</code>
              </dd>
              <dt>Deposit hash</dt>
              <dd>none seen yet</dd>
            </Facts>
            <Details summary="What it runs: 2 instructions">
              <ExecutionSteps steps={STEPS} intermediary={INTERMEDIARY} />
            </Details>
            <Caption>It is already signed, so resuming only follows it here and asks your wallet for nothing.</Caption>
            <Actions>
              <Button variant="primary" size="sm" icon={<RotateCcw />}>
                Resume it
              </Button>
            </Actions>
          </ExistingFrame>
        </Scene>
      </Demo>
      <Demo title="Another recipe, unsigned">
        <Scene wallet="evm" intermediary={INTERMEDIARY} quote={KAMINO_QUOTE} button={<Button variant="primary" size="lg" block icon={<PenLine />} disabled>Sign and run</Button>}>
          <ExistingFrame title={existingTitle('This wallet already has an execution in flight, and Connect runs one at a time per wallet and chain:')}>
            <Facts>
              <dt>Status</dt>
              <dd>CREATED, and it still needs your signature</dd>
              <dt>Deposit</dt>
              <dd>{DEPOSIT_FACT}</dd>
              <dt>Delivered to</dt>
              <dd>
                <code>{INTERMEDIARY}</code>
              </dd>
              <dt>Deposit hash</dt>
              <dd>none seen yet</dd>
            </Facts>
            <Details open summary="What it runs: 2 instructions">
              <ExecutionSteps steps={STEPS} intermediary={INTERMEDIARY} />
            </Details>
            <Notice kind="error">
              This is not the recipe on this page, so this page will not sign or fund it. Anyone who knows your wallet address can create an execution for it, so if you did not start this one, delete it.
            </Notice>
            <Actions>
              <Button variant="primary" size="sm" className={LONG_LABEL}>
                Delete it (a signature that moves no money)
              </Button>
            </Actions>
          </ExistingFrame>
        </Scene>
      </Demo>
    </DemoGrid>
  )),
  run('16', 'transfer-failed', 'The deposit transfer did not go through', "recovery.kind === 'retry-transfer'. Send it again, or cancel.", () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ disabled: true })}>
      <Notice kind="error">You declined the transaction in your wallet.</Notice>
      <Run phase="awaiting-deposit" at={1} now="failed" note="The transfer did not go through" callout={false} />
      <Alert
        kind="warning"
        title="The deposit transfer did not go through."
        actions={
          <>
            <Button variant="primary" size="sm">
              Send the deposit again
            </Button>
            <Button size="sm">Cancel</Button>
          </>
        }
      >
        {CANCEL_NOTE}
      </Alert>
    </Scene>
  )),
  run('17', 'unfinished', 'The page stopped following it', 'unfinished. Paused where it was: Resume follows it again, and paying again could pay twice.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ disabled: true })}>
      <Notice kind="error">Intents Connect is not answering right now (503). An execution already started may still be running, so check it before paying again.</Notice>
      <Run phase="failed" at={2} now="paused" note="This page stopped following it" status="DEPOSIT_PROCESSING" links={[undefined, DEPOSIT_LINK]} callout={false} />
      <Alert
        kind="warning"
        actions={
          <Button variant="primary" size="sm" icon={<RotateCcw />}>
            Resume
          </Button>
        }
      >
        This execution has not finished, and this page stopped following it. Do not pay again before you know how it ended.
      </Alert>
    </Scene>
  )),
  run('18', 'from-this-browser', 'An execution started from this browser', 'last. Offered again after a reload, with Hide.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton()}>
      <ExistingFrame title={existingTitle('You started an execution from this browser:')}>
        <Facts>
          <dt>Status</dt>
          <dd>CREATED, and it still needs your signature</dd>
          <dt>Deposit</dt>
          <dd>{DEPOSIT_FACT}</dd>
          <dt>Delivered to</dt>
          <dd>
            <code>{INTERMEDIARY}</code>
          </dd>
          <dt>Deposit hash</dt>
          <dd>none seen yet</dd>
        </Facts>
        <Details open summary="What it runs: 2 instructions">
          <ExecutionSteps steps={STEPS} intermediary={INTERMEDIARY} />
        </Details>
        <Actions>
          <Button variant="primary" size="sm" icon={<RotateCcw />}>
            Resume it
          </Button>
          <Button size="sm" className={LONG_LABEL}>
            Delete it (a signature that moves no money)
          </Button>
          <Button size="sm" variant="ghost">
            Hide
          </Button>
        </Actions>
      </ExistingFrame>
    </Scene>
  )),
  run('19', 'resumed-deposit', 'A resumed execution waits for its deposit', 'resumed && depositAddress. The deposit can come from any wallet, and sending it twice pays twice.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} locked button={quoteButton({ disabled: true })}>
      <Run phase="awaiting-deposit" at={1} now="active" note={DOING[1]} status="DEPOSIT_PENDING" callout={false} />
      <DepositBox
        actions={
          <>
            <Button size="sm" icon={<Copy />}>
              Copy the address
            </Button>
            <Button size="sm" variant="ghost">
              Cancel, I will not send it
            </Button>
          </>
        }
      >
        <p>
          Waiting for a deposit of <strong>800 USDC</strong> to <code>{DEPOSIT_ADDRESS}</code>. If you already sent it, wait: sending it again would pay twice. If you have not, send it from any wallet and this page will follow it.
        </p>
        <p className="mt-2 text-xs text-muted">{CANCEL_NOTE}</p>
      </DepositBox>
    </Scene>
  )),
  run('20', 'expired', 'The deposit window passed', "phase === 'expired'. A late deposit can still revive it, or it can be cancelled.", () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ disabled: true })}>
      <Run phase="expired" at={1} now="paused" note="The deposit window passed" status="EXPIRED" />
      <Alert kind="warning" actions={<Button size="sm">Cancel the execution</Button>}>
        {CANCEL_NOTE}
      </Alert>
    </Scene>
  )),
  run('21', 'deposit-failed', 'The deposit failed', 'DEPOSIT_FAILED. Nothing ran on Solana, and the transfer is refunded.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ again: true })}>
      <Run phase="failed" at={4} now="failed" note="The deposit failed, so nothing ran" status="DEPOSIT_FAILED" last="Failed" links={[undefined, DEPOSIT_LINK]} callout={false} />
      <Notice kind="error">The deposit failed, for example on an invalid amount, so nothing ran on Solana. What was transferred is refunded.</Notice>
    </Scene>
  )),
  run('22', 'success', 'Success', 'SUCCESS. The deposit and the Solana transaction, each in its explorer. The Kamino page adds Before → After.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ again: true })}>
      <Run phase="success" at={4} now="success" status="SUCCESS" last="Success" links={[undefined, DEPOSIT_LINK, undefined, SOLANA_LINK]} />
    </Scene>
  )),
  run('23', 'failed', 'The instructions failed: Retry or Refund', 'OPERATION_FAILED. The money stays with the intermediary: run the instructions again on it, or send it back. Each asks for its own figures.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ again: true })}>
      <Run phase="failed" at={4} now="failed" note="The instructions failed on Solana" status="OPERATION_FAILED" last="Failed" links={[undefined, DEPOSIT_LINK]} callout={false} />
      <Block tight>
        <Notice kind="error">The instructions failed on Solana, so the money stayed with your intermediary. You can run them again with it, or send it back.</Notice>
        <Held>776.16 USDC</Held>
        <div className="flex flex-col gap-2">
          <OptionTile icon={<RotateCcw />} title="Run it again" action={<Button size="sm">Retry</Button>}>
            The instructions run again on what your intermediary holds, so nothing is deposited.
          </OptionTile>
          {REFUND_TILE}
        </div>
        <QuoteBox title="Retry">
          <Figures>
            <dt>Fee</dt>
            <dd>0.05 USDC</dd>
            <SpendsRow figure="776.11 USDC" />
          </Figures>
          <Button variant="primary" size="lg" block icon={<PenLine />}>
            Sign and retry
          </Button>
        </QuoteBox>
      </Block>
    </Scene>
  )),
  run('24', 'refund-failed', 'The Refund failed', 'isRefund. The money is still with the intermediary, and Refund can be asked again.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton({ again: true })}>
      <Run phase="failed" at={4} now="failed" note="The instructions failed on Solana" status="OPERATION_FAILED" last="Failed" callout={false} />
      <Block tight>
        <Notice kind="error">The Refund failed, so the money is still with your intermediary. You can send it back again.</Notice>
        <Held>776.16 USDC</Held>
        <div className="flex flex-col gap-2">{REFUND_TILE}</div>
        <QuoteBox title="Refund">
          <Figures>
            <dt>You get at least</dt>
            <dd>775.02 USDC on Base</dd>
            <dt>Sent to</dt>
            <dd>
              <code className="font-mono text-[0.8125rem] break-all">{EVM_WALLET}</code>
            </dd>
            <dt>Fee</dt>
            <dd>0.31 USDC</dd>
          </Figures>
          <Caption>Figures from a test run: the real one can differ by what the price does in the seconds before you sign.</Caption>
          <Button variant="primary" size="lg" block icon={<PenLine />}>
            Sign and refund
          </Button>
        </QuoteBox>
      </Block>
    </Scene>
  )),
  run('25', 'left-over', 'Left over after a run', 'held > 0 with nothing failed. What a run did not spend, offered back.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton()}>
      <Block tight>
        <p role="status" className="text-sm leading-5 text-muted">
          Whatever a run does not spend stays with your intermediary until you send it back.
        </p>
        <Held>0.27 USDC</Held>
        <div className="flex flex-col gap-2">{REFUND_TILE}</div>
      </Block>
    </Scene>
  )),
  run('26', 'deleted', 'An execution was deleted', 'deleted. A line in the card, and a toast.', () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton()}>
      <DeletedLine id={EXECUTION} />
    </Scene>
  )),
  run('27', 'cancelled', 'Cancelled', "phase === 'cancelled'. The stages stop where it was.", () => (
    <Scene wallet="evm" intermediary={INTERMEDIARY} button={quoteButton()}>
      <Run phase="cancelled" at={1} now="cancelled" status="DEPOSIT_PENDING" />
    </Scene>
  )),
  {
    id: 'run-what-will-run',
    title: 'What will run',
    description: 'Summary: under the card on /build and /kamino, closed; open from the start on a shared link. Built here from a made-up Kamino position.',
    render: () =>
      'problem' in RECIPE ? (
        <Notice kind="error">The made-up recipe did not build: {RECIPE.problem}</Notice>
      ) : (
        <DemoGrid>
          <Demo title="Under the card: closed">
            <Summary stored={RECIPE.stored} steps={RECIPE.steps} intermediary={INTERMEDIARY} real amountKnown={false} shared={false} />
          </Demo>
          <Demo title="Opened, after the quote">
            <Summary stored={RECIPE.stored} steps={RECIPE.quoted} intermediary={INTERMEDIARY} real amountKnown shared={false} open />
          </Demo>
        </DemoGrid>
      ),
  },
  {
    id: 'run-shared-page',
    title: 'Shared recipe /r/:id',
    description: 'Who made it and what to check first, what will run open, then the card with its consent right above the button.',
    render: () =>
      'problem' in RECIPE ? (
        <Notice kind="error">The made-up recipe did not build: {RECIPE.problem}</Notice>
      ) : (
        <section className="mx-auto flex w-full max-w-run min-w-0 flex-col gap-5">
          <SharedHeader />
          <div className="flex min-w-0 flex-col gap-4">
            <TrustPanel stored={RECIPE.stored} instructions={RECIPE.stored.steps.length} check={() => <IdlCheck state="match" />} />
            <Summary stored={RECIPE.stored} steps={RECIPE.steps} intermediary={INTERMEDIARY} real amountKnown={false} shared />
            <Scene wallet="evm" intermediary={INTERMEDIARY} consent={false} button={quoteButton({ disabled: true })} reason={['muted', 'Tick the box above first.']} />
          </div>
        </section>
      ),
  },
  {
    id: 'run-shared-checks',
    title: 'Shared recipe: the IDL checks',
    description: 'PublishedCheck, per program: checking, could not compare, matches, differs.',
    render: () => (
      <Surface className="max-w-run">
        <ul className="flex flex-col gap-4">
          <Program state="checking" />
          <Program state="unknown" />
          <Program state="match" />
          <Program state="differs" />
        </ul>
      </Surface>
    ),
  },
  {
    id: 'run-shared-dead',
    title: 'Shared recipe: links that run nothing',
    description: 'A 404 or 400, a recipe that cannot be read, and the page while it loads.',
    render: () => (
      <DemoGrid>
        <Demo title="404, 400">
          <Dead icon={<Link2Off />} title="This link does not lead to a recipe." />
        </Demo>
        <Demo title="A recipe that cannot be read">
          <Dead icon={<FileWarning />} title="This recipe cannot be read.">
            <p>This recipe is malformed: it is not a version 1 recipe. Nothing can run from this link.</p>
          </Dead>
        </Demo>
        <Demo title="Loading" wide>
          <div className="max-w-run">
            <Loading />
          </div>
        </Demo>
      </DemoGrid>
    ),
  },
];
