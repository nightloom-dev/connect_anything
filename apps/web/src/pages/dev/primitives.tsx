import { useState } from 'react';
import { ArrowRight, Blocks, FileJson, Inbox, LifeBuoy, Plus, RefreshCw, Search, Settings2, Trash2, Wallet } from 'lucide-react';
import {
  Address,
  AddressInput,
  Alert,
  AmountInput,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ChainBadge,
  ChainIcon,
  Checkbox,
  CodeBlock,
  Combobox,
  CopyButton,
  Dialog,
  Disclosure,
  EmptyState,
  HealthBar,
  IconButton,
  Input,
  KeyValue,
  KeyValueRow,
  LogViewer,
  Meter,
  Popover,
  Select,
  Skeleton,
  Slider,
  Spinner,
  Stepper,
  Switch,
  Tabs,
  Timeline,
  TokenAmount,
  TokenIcon,
  Tooltip,
  TxLink,
  toast,
  type BadgeVariant,
  type ButtonVariant,
  type StepItem,
  type TimelineStage,
} from '../../ui/index.ts';
import { Demo, DemoGrid, Row, Surface } from './kit.tsx';
import type { DevSection } from './types.ts';

export const order = 0;

// fake data, shaped like the real thing
const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const INTERMEDIARY = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const EVM_WALLET = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const EVM_TX = '0x8f2a5c3b9d4e1f7a6b0c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a';
const SOL_TX = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'soft', 'ghost', 'danger'];

function Buttons() {
  const [busy, setBusy] = useState(false);
  return (
    <DemoGrid>
      <Demo title="Variants" wide>
        <Row>
          {VARIANTS.map(variant => (
            <Button key={variant} variant={variant}>
              {variant[0].toUpperCase() + variant.slice(1)}
            </Button>
          ))}
        </Row>
      </Demo>
      <Demo title="Sizes">
        <Row>
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
      </Demo>
      <Demo title="With icons">
        <Row>
          <Button variant="primary" icon={<Wallet />}>
            Connect wallet
          </Button>
          <Button iconRight={<ArrowRight />}>Next: simulate</Button>
          <Button variant="danger" icon={<Trash2 />}>
            Delete it
          </Button>
        </Row>
      </Demo>
      <Demo title="Loading keeps the width">
        <Row>
          <Button variant="primary" loading>
            Pay 4.12 USDC
          </Button>
          <Button variant="primary" loading icon={<RefreshCw />}>
            Getting a quote…
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true);
              window.setTimeout(() => setBusy(false), 1500);
            }}
          >
            Click me
          </Button>
        </Row>
      </Demo>
      <Demo title="Disabled">
        <Row>
          {VARIANTS.map(variant => (
            <Button key={variant} variant={variant} disabled>
              {variant[0].toUpperCase() + variant.slice(1)}
            </Button>
          ))}
        </Row>
      </Demo>
      <Demo title="Full width (block)">
        <Surface className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block>
            Pay 4.12 USDC from Base
          </Button>
          <Button variant="ghost" size="sm" block>
            Cancel
          </Button>
        </Surface>
      </Demo>
      <Demo title="Icon buttons (hover or focus for the tooltip)">
        <Row>
          <IconButton label="Settings" icon={<Settings2 />} />
          <IconButton label="Add a step" icon={<Plus />} variant="secondary" />
          <IconButton label="Search" icon={<Search />} variant="soft" />
          <IconButton label="Delete step" icon={<Trash2 />} variant="danger" />
          <IconButton label="Refreshing" icon={<RefreshCw />} variant="secondary" loading />
          <IconButton label="Disabled" icon={<Settings2 />} variant="secondary" disabled />
          <IconButton label="Small" icon={<Plus />} size="xs" variant="secondary" />
          <IconButton label="Large" icon={<Plus />} size="md" variant="secondary" />
        </Row>
      </Demo>
    </DemoGrid>
  );
}

const BADGES: BadgeVariant[] = ['auto', 'recipe', 'input', 'signs', 'writable', 'optional', 'ok', 'warn', 'bad', 'info', 'accent', 'neutral'];

function Badges() {
  return (
    <DemoGrid>
      <Demo title="Variants">
        <Row className="gap-2">
          {BADGES.map(variant => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Row>
      </Demo>
      <Demo title="Medium, with a dot">
        <Row className="gap-2">
          <Badge size="md" variant="ok" dot>
            Simulated
          </Badge>
          <Badge size="md" variant="warn" dot>
            Not checked
          </Badge>
          <Badge size="md" variant="bad" dot>
            Not supported
          </Badge>
          <Badge size="md" variant="neutral" icon={<FileJson className="size-3" />}>
            IDL from chain
          </Badge>
        </Row>
      </Demo>
    </DemoGrid>
  );
}

function Alerts() {
  return (
    <div className="flex flex-col gap-3">
      <Alert kind="info" title="Your intermediary holds 2.5 USDC">
        Whatever a run does not spend stays there until you send it back.
      </Alert>
      <Alert kind="success" title="Repaid">
        The debt is 4.12 USDC smaller and the LTV is 61.8%.
      </Alert>
      <Alert
        kind="warning"
        title="The position can move before this runs"
        why="After the deposit, execution takes about 150 seconds plus the MPC signature, and the amount is fixed when you sign. In that time prices change, interest accrues, and the position can be liquidated or repaid by someone else."
      >
        The LTV you end up with can differ from the target.
      </Alert>
      <Alert
        kind="danger"
        title="The instructions failed on Solana"
        actions={
          <>
            <Button size="sm" variant="primary">
              Run them again
            </Button>
            <Button size="sm">Send it back</Button>
          </>
        }
      >
        The money stayed with your intermediary.
      </Alert>
      <Alert kind="info">A message with no title, as the old screens show one.</Alert>
    </div>
  );
}

function Cards() {
  return (
    <DemoGrid>
      <Demo title="Header, body, footer">
        <Card>
          <CardHeader title="Kamino position" description="Main market · 3 reserves" icon={<LifeBuoy />} actions={<Badge variant="warn">At risk</Badge>} />
          <CardBody>
            <KeyValue
              items={[
                { label: 'Collateral', value: '$1,240.00' },
                { label: 'Debt', value: '$892.80' },
              ]}
            />
          </CardBody>
          <CardFooter>
            <Button size="sm" variant="ghost">
              Details
            </Button>
            <Button size="sm" variant="primary">
              Repay
            </Button>
          </CardFooter>
        </Card>
      </Demo>
      <Demo title="Elevated, large padding">
        <Card elevated padding="lg">
          <CardHeader title="Pay from Base" description="One signature, then about 150 seconds." />
          <CardBody>
            <TokenAmount amount="4.12" symbol="USDC" icon size="xl" />
            <Button variant="primary" size="lg" block>
              Pay 4.12 USDC
            </Button>
          </CardBody>
        </Card>
      </Demo>
    </DemoGrid>
  );
}

const CHAIN_OPTIONS = [
  { value: 'base', label: 'Base', icon: <ChainIcon chain="base" /> },
  { value: 'arb', label: 'Arbitrum', icon: <ChainIcon chain="arb" /> },
  { value: 'eth', label: 'Ethereum', icon: <ChainIcon chain="eth" /> },
];

const TOKEN_OPTIONS = [
  { value: 'USDC', label: 'USDC', description: 'USD Coin', icon: <TokenIcon symbol="USDC" size={18} />, aside: '1,204.50' },
  { value: 'USDT', label: 'USDT', description: 'Tether USD', icon: <TokenIcon symbol="USDT" size={18} />, aside: '0.00' },
  { value: 'ETH', label: 'ETH', description: 'Ether', icon: <TokenIcon symbol="ETH" size={18} />, aside: '0.412' },
  { value: 'DAI', label: 'DAI', description: 'No icon: a letter', icon: <TokenIcon symbol="DAI" size={18} />, disabled: true },
];

type Instruction = { name: string; args: number; accounts: number; docs: string; supported: boolean };

const INSTRUCTIONS: Instruction[] = [
  { name: 'repay_obligation_liquidity_v2', args: 1, accounts: 12, docs: 'Repay borrowed liquidity to a reserve', supported: true },
  { name: 'deposit_reserve_liquidity', args: 1, accounts: 11, docs: 'Deposit liquidity into a reserve in exchange for collateral', supported: true },
  { name: 'refresh_reserve', args: 0, accounts: 6, docs: 'Accrue interest and update the market price', supported: true },
  { name: 'refresh_obligation', args: 0, accounts: 2, docs: 'Recompute the values of an obligation', supported: true },
  { name: 'flash_borrow_reserve_liquidity', args: 1, accounts: 12, docs: 'Borrow within one transaction', supported: false },
  { name: 'withdraw_obligation_collateral', args: 1, accounts: 10, docs: 'Withdraw collateral from an obligation', supported: true },
];

function Inputs() {
  const [address, setAddress] = useState('');
  const [bad, setBad] = useState('KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmj0');
  const [good, setGood] = useState(KLEND);
  const [amount, setAmount] = useState('4.12');
  const [many, setMany] = useState('1.1234567');
  return (
    <DemoGrid>
      <Demo title="Input">
        <div className="flex flex-col gap-4">
          <Input label="Recipe name" placeholder="Repay my Kamino debt" hint="Shown to whoever opens the link." />
          <Input label="Seed" value="obligation" readOnly mono aside="u8 array" />
          <Input label="Amount" value="abc" readOnly error="Enter a number, like 1.5." />
          <Input label="Disabled" value="Locked while the run is in flight" disabled />
          <Input aria-label="Search" placeholder="Search instructions" leading={<Search className="size-4 text-muted" />} size="sm" />
        </div>
      </Demo>
      <Demo title="AddressInput">
        <div className="flex flex-col gap-4">
          <AddressInput label="Program ID" value={address} onChange={setAddress} hint="Paste reads the clipboard; try it." />
          <AddressInput label="Valid" value={good} onChange={setGood} />
          <AddressInput label="Not base58" value={bad} onChange={setBad} />
          <AddressInput label="From the server" value={INTERMEDIARY} onChange={() => {}} error="This account does not exist on mainnet." />
        </div>
      </Demo>
      <Demo title="AmountInput">
        <div className="flex flex-col gap-4">
          <AmountInput label="You pay" value={amount} onChange={setAmount} symbol="USDC" decimals={6} balance="1,204.50" onMax={() => setAmount('1204.5')} />
          <AmountInput label="Too many decimals" value={many} onChange={setMany} symbol="USDC" decimals={6} />
          <AmountInput label="Large" size="lg" value="0.25" onChange={() => {}} symbol="SOL" decimals={9} />
          <AmountInput label="Disabled" value="10" onChange={() => {}} symbol="USDT" decimals={6} disabled />
        </div>
      </Demo>
      <Demo title="Select and Combobox">
        <SelectDemos />
      </Demo>
    </DemoGrid>
  );
}

function SelectDemos() {
  const [chain, setChain] = useState('base');
  const [token, setToken] = useState('USDC');
  const [instruction, setInstruction] = useState<Instruction | null>(INSTRUCTIONS[0]);
  return (
    <div className="flex flex-col gap-4">
      <Select label="From" value={chain} onChange={setChain} options={CHAIN_OPTIONS} />
      <Select label="Token" value={token} onChange={setToken} options={TOKEN_OPTIONS} hint="With a description and a balance per option." />
      <Select label="Nothing chosen" value="" onChange={() => {}} options={CHAIN_OPTIONS} placeholder="Choose a chain" error="Choose where you pay from." />
      <Combobox
        label="Instruction"
        value={instruction}
        onChange={setInstruction}
        options={INSTRUCTIONS}
        getKey={option => option.name}
        getLabel={option => option.name}
        filter={(option, query) => `${option.name} ${option.docs}`.toLowerCase().includes(query.trim().toLowerCase())}
        isDisabled={option => !option.supported}
        renderOption={option => (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-mono text-[13px]">{option.name}</span>
              {!option.supported && <Badge variant="bad">Not supported</Badge>}
            </span>
            <span className="truncate text-xs text-muted">
              {option.args} args · {option.accounts} accounts · {option.docs}
            </span>
          </span>
        )}
        placeholder="Search instructions"
        hint="Type to filter by name or docs; arrows and Enter pick."
      />
      <Select label="Disabled" value="arb" onChange={() => {}} options={CHAIN_OPTIONS} disabled />
    </div>
  );
}

function Toggles() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [checked, setChecked] = useState(true);
  const [unchecked, setUnchecked] = useState(false);
  const [target, setTarget] = useState(62);
  const [cu, setCu] = useState(40);
  return (
    <DemoGrid>
      <Demo title="Switch">
        <div className="flex flex-col gap-4">
          <Switch label="Uses the amount delivered" description="The argument takes what the bridge delivers, so the recipe spends all of it." checked={on} onChange={setOn} />
          <Switch label="Writable" checked={off} onChange={setOff} />
          <Switch label="Small" size="sm" checked={on} onChange={setOn} />
          <Switch label="Disabled" checked disabled onChange={() => {}} />
        </div>
      </Demo>
      <Demo title="Checkbox">
        <div className="flex flex-col gap-4">
          <Checkbox label="I understand that the amount is fixed when I sign" checked={checked} onChange={setChecked} />
          <Checkbox label="Signer" description="This account signs the transaction." checked={unchecked} onChange={setUnchecked} />
          <Checkbox label="Some of the accounts" indeterminate checked={false} onChange={() => {}} />
          <Checkbox label="Disabled" checked disabled onChange={() => {}} />
        </div>
      </Demo>
      <Demo title="Slider with marks">
        <Surface className="flex flex-col gap-5">
          <Slider
            label="Target LTV"
            value={target}
            onChange={setTarget}
            min={0}
            max={90}
            format={value => `${value}%`}
            tone={target >= 80 ? 'danger' : target >= 70 ? 'warning' : 'accent'}
            marks={[
              { value: 0, label: '0%' },
              { value: 72, label: 'Now 72%' },
              { value: 80, label: 'Liquidation', tone: 'danger' },
            ]}
          />
          <Slider label="Plain" value={cu} onChange={setCu} format={value => `${value}k CU`} />
          <Slider label="Disabled" value={30} onChange={() => {}} disabled format={value => `${value}%`} />
        </Surface>
      </Demo>
    </DemoGrid>
  );
}

function TabsDemo() {
  return (
    <DemoGrid>
      <Demo title="Underline">
        <Tabs
          label="Export"
          tabs={[
            { id: 'link', label: 'Link', content: <p className="text-sm text-muted">Create a link anyone can open to pay this recipe.</p> },
            { id: 'ts', label: 'TypeScript', badge: 'P1', content: <p className="text-sm text-muted">The same recipe as code.</p> },
            { id: 'qr', label: 'QR code', disabled: true, content: null },
          ]}
        />
      </Demo>
      <Demo title="Segmented">
        <Tabs
          variant="segmented"
          label="View"
          tabs={[
            { id: 'needs', label: 'Needs your input', badge: 4, content: <p className="text-sm text-muted">Four accounts to fill.</p> },
            { id: 'auto', label: 'Found', badge: 5, content: <p className="text-sm text-muted">Five accounts found automatically.</p> },
            { id: 'all', label: 'All', content: <p className="text-sm text-muted">Every account.</p> },
          ]}
        />
      </Demo>
    </DemoGrid>
  );
}

function Overlays() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <DemoGrid>
      <Demo title="Dialog">
        <Row>
          <Button onClick={() => setOpen(true)}>Open a dialog</Button>
          <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirm(true)}>
            Delete…
          </Button>
        </Row>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Open in the builder"
          description="The recipe opens as steps you can change. Nothing is paid until you run it."
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Open it
              </Button>
            </>
          }
        >
          <KeyValue
            dense
            items={[
              { label: 'Program', value: <Address value={KLEND} /> },
              { label: 'Instruction', value: <span className="font-mono text-[13px]">repay_obligation_liquidity_v2</span> },
            ]}
          />
        </Dialog>
        <Dialog
          open={confirm}
          onClose={() => setConfirm(false)}
          tone="danger"
          icon={<Trash2 />}
          size="sm"
          title="Delete the execution?"
          description="It only deletes the execution. A deposit already sent keeps going."
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>Keep it</Button>
              <Button variant="danger" onClick={() => setConfirm(false)}>
                Delete it
              </Button>
            </>
          }
        />
      </Demo>
      <Demo title="Popover and Tooltip">
        <Row>
          <Popover trigger={<Button iconRight={<Settings2 />}>Options</Button>} anchor="bottom start" label="Options">
            {({ close }) => (
              <div className="flex flex-col gap-1 p-1.5 text-sm">
                <p className="px-1.5 pb-1 text-xs text-muted">Slippage tolerance</p>
                {['0.5%', '1%', '2%'].map(value => (
                  <button key={value} type="button" onClick={close} className="rounded-md px-2.5 py-2 text-left hover:bg-white/6">
                    {value}
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <Tooltip content="About 150 seconds after the deposit">
            <span tabIndex={0} className="rounded-xs text-sm text-muted underline decoration-dotted underline-offset-4">
              How long?
            </span>
          </Tooltip>
          <Tooltip content="Shown below at the top edge" side="bottom">
            <Button size="sm" variant="ghost">
              Tooltip below
            </Button>
          </Tooltip>
        </Row>
      </Demo>
      <Demo title="Disclosure">
        <div className="flex flex-col gap-3">
          <Disclosure title="What will run">
            <p className="text-sm text-muted">Two refresh steps, then repay_obligation_liquidity_v2 on klend.</p>
          </Disclosure>
          <Disclosure variant="card" title="Accounts found automatically" aside="5" defaultOpen>
            <p className="text-sm text-muted">The lending market, its authority, the reserve and its liquidity supply, the token program.</p>
          </Disclosure>
          <Disclosure variant="card" title="Remaining accounts" aside="0">
            <p className="text-sm text-muted">None.</p>
          </Disclosure>
        </div>
      </Demo>
      <Demo title="Toasts">
        <Row>
          <Button size="sm" onClick={() => toast.success('Link created')}>
            Success
          </Button>
          <Button size="sm" onClick={() => toast.error('Could not copy', { description: 'Select the text and copy it by hand.' })}>
            Error
          </Button>
          <Button size="sm" onClick={() => toast('Execution deleted', { action: { label: 'Undo', onClick: () => {} } })}>
            With an action
          </Button>
          <Button size="sm" onClick={() => toast.loading('Reading the position…', { duration: 2000 })}>
            Loading
          </Button>
        </Row>
      </Demo>
    </DemoGrid>
  );
}

function Data() {
  return (
    <DemoGrid>
      <Demo title="KeyValue with a total">
        <Surface>
          <KeyValue divided>
            <KeyValueRow label="You pay" value={<TokenAmount amount="4.15" symbol="USDC" icon />} />
            <KeyValueRow label="Bridge fee" value="0.03 USDC" tone="muted" hint="Kept by the bridge, with slippage" />
            <KeyValueRow label="Arrives on Solana" value="at least 4.12 USDC" />
            <KeyValueRow label="Repays" value={<TokenAmount amount="4.12" symbol="USDC" />} total />
          </KeyValue>
        </Surface>
      </Demo>
      <Demo title="KeyValue: tones, dense, stacked">
        <div className="flex flex-col gap-4">
          <Surface className="py-3">
            <KeyValue
              dense
              items={[
                { label: 'Simulation', value: 'Passed', tone: 'success' },
                { label: 'Compute', value: '154,000 CU', tone: 'warning' },
                { label: 'Status', value: 'Failed', tone: 'danger' },
                { label: 'Network', value: 'Base', tone: 'accent' },
              ]}
            />
          </Surface>
          <Surface className="py-3">
            <KeyValue stacked items={[{ label: 'Recipe', value: 'Repays a Kamino debt with what arrives, and leaves the rest with your intermediary.' }]} />
          </Surface>
        </div>
      </Demo>
      <Demo title="Address">
        <div className="flex flex-col items-start gap-3">
          <Address value={KLEND} />
          <Address value={INTERMEDIARY} label="your intermediary" />
          <Address value={USDC_MINT} kind="token" chars={6} />
          <Address value={EVM_WALLET} chain="base" />
          <Address value={INTERMEDIARY} copy={false} explorer={false} />
          <Address value={EVM_WALLET} chain="eth" full className="max-w-64" />
        </div>
      </Demo>
      <Demo title="TxLink, chains and tokens">
        <div className="flex flex-col gap-4">
          <Row>
            <TxLink hash={EVM_TX} chain="base" />
            <TxLink hash={EVM_TX} chain="arb" />
            <TxLink hash={EVM_TX} chain="eth" label="Deposit" />
            <TxLink hash={SOL_TX} chain="sol" />
          </Row>
          <Row>
            <ChainBadge chain="base" />
            <ChainBadge chain="arb" />
            <ChainBadge chain="eth" />
            <ChainBadge chain="sol" size="md" />
            <ChainBadge chain="polygon" name="Polygon" />
            <ChainBadge chain="base" iconOnly />
          </Row>
          <Row>
            {['USDC', 'USDT', 'SOL', 'ETH', 'JUP', 'BONK'].map(symbol => (
              <TokenIcon key={symbol} symbol={symbol} size={24} />
            ))}
          </Row>
          <Row className="items-baseline gap-5">
            <TokenAmount amount="4.12" symbol="USDC" icon size="sm" />
            <TokenAmount amount="1,204.50" symbol="USDC" icon />
            <TokenAmount amount="0.25" symbol="SOL" icon size="lg" />
            <TokenAmount amount="4.12" symbol="USDC" size="xl" prefix="≈" />
          </Row>
          <Row>
            <span className="text-sm text-muted">CopyButton</span>
            <CopyButton value={INTERMEDIARY} label="Copy intermediary" message="Intermediary copied" />
            <CopyButton value={EVM_TX} size="sm" />
          </Row>
        </div>
      </Demo>
    </DemoGrid>
  );
}

function Meters() {
  return (
    <DemoGrid>
      <Demo title="Meter: ok, warn, over">
        <Surface className="flex flex-col gap-5">
          <Meter label="Compute units" value={96_412} max={200_000} unit="CU" />
          <Meter label="Compute units" value={183_900} max={200_000} unit="CU" />
          <Meter label="Transaction size" value={1_301} max={1_232} unit="bytes" />
          <Meter label="Small, no status line" value={612} max={1_232} unit="bytes" size="sm" />
        </Surface>
      </Demo>
      <Demo title="HealthBar, small, in a list">
        <Surface className="flex flex-col gap-4">
          {[0.31, 0.68, 0.79, 0.86].map(ltv => (
            <div key={ltv} className="flex items-center gap-4">
              <span className="w-14 text-sm text-text nums">{(ltv * 100).toFixed(1)}%</span>
              <HealthBar value={ltv} liquidation={0.8} size="sm" className="flex-1" />
            </div>
          ))}
        </Surface>
      </Demo>
      <Demo title="HealthBar: safe">
        <Surface>
          <HealthBar value={0.42} liquidation={0.8} />
        </Surface>
      </Demo>
      <Demo title="HealthBar: caution, with a target">
        <Surface>
          <HealthBar value={0.74} liquidation={0.8} target={0.62} />
        </Surface>
      </Demo>
      <Demo title="HealthBar: past liquidation">
        <Surface>
          <HealthBar value={0.83} liquidation={0.8} target={0.7} />
        </Surface>
      </Demo>
      <AfterDemo />
    </DemoGrid>
  );
}

/** The quote arrives: the bar moves from now to after. */
function AfterDemo() {
  const [quoted, setQuoted] = useState(true);
  return (
    <Demo title="HealthBar: after the repayment (toggle to animate)">
      <Surface className="flex flex-col gap-4">
        <HealthBar value={0.77} liquidation={0.8} target={0.62} after={quoted ? 0.618 : null} />
        <Switch size="sm" label="Quote received" checked={quoted} onChange={setQuoted} />
      </Surface>
    </Demo>
  );
}

const STEPS = (current: number, locked: number[] = []): StepItem[] =>
  ['Program', 'Instruction', 'Simulate', 'Run'].map((title, index) => ({
    id: title.toLowerCase(),
    title,
    state: locked.includes(index) ? 'locked' : index < current ? 'done' : index === current ? 'current' : 'upcoming',
    reason: locked.includes(index) ? 'Add a step to the recipe first.' : undefined,
  }));

const STAGES = ['Signature', 'Deposit', 'Bridge', 'Execution', 'Result'];

const stages = (reached: number, end: 'active' | 'success' | 'failed' | 'cancelled'): TimelineStage[] =>
  STAGES.map((title, index) => {
    return {
      id: title,
      title,
      state: index < reached ? 'done' : index === reached ? end : 'pending',
      time: index < reached ? `${[4, 12, 96, 31][index] ?? 2} s` : index === reached && end === 'active' ? '0:48' : undefined,
      description:
        index === reached
          ? {
              active: ['Sign the message in your wallet.', 'Confirm the deposit in your wallet.', 'The bridge moves the money to Solana, about 150 seconds.', 'Running the instructions on Solana.', ''][index],
              success: 'The debt is repaid.',
              failed: 'The instructions failed on Solana, so the money stayed with your intermediary.',
              cancelled: 'Deleted before the deposit.',
            }[end]
          : undefined,
      link: index === 1 && reached > 1 ? <TxLink hash={EVM_TX} chain="base" /> : index === 3 && reached > 3 ? <TxLink hash={SOL_TX} chain="sol" /> : undefined,
    };
  });

function Progress() {
  const [step, setStep] = useState(1);
  return (
    <DemoGrid>
      <Demo title="Stepper (click a done or upcoming step)" wide>
        <Surface className="flex flex-col gap-6">
          <Stepper steps={STEPS(step)} onSelect={id => setStep(['program', 'instruction', 'simulate', 'run'].indexOf(id))} />
          <Stepper steps={STEPS(1, [2, 3])} onSelect={() => {}} label="Steps, two locked" />
          <Stepper steps={STEPS(4)} label="Steps, all done" />
        </Surface>
      </Demo>
      <Demo title="Timeline: in progress">
        <Surface>
          <Timeline stages={stages(2, 'active')} />
        </Surface>
      </Demo>
      <Demo title="Timeline: success">
        <Surface>
          <Timeline stages={stages(4, 'success')} />
        </Surface>
      </Demo>
      <Demo title="Timeline: failed">
        <Surface>
          <Timeline stages={stages(3, 'failed')} />
        </Surface>
      </Demo>
      <Demo title="Timeline: cancelled">
        <Surface>
          <Timeline stages={stages(1, 'cancelled')} />
        </Surface>
      </Demo>
    </DemoGrid>
  );
}

const TS = `import { createIntentsConnectApi } from '@aurora-is-near/intents-connect';

// Repay a Kamino debt from Base with one signature
const api = createIntentsConnectApi({ baseUrl: process.env.CONNECT_API_URL });

export async function repay(wallet: string, amount = '4.12') {
  const { solana: intermediary } = await api.getIntermediary(wallet);
  if (!intermediary) throw new Error('Solana is not enabled for this key');
  return buildRecipe(recipe, intermediary, toAtomic(amount, 6));
}
`;

const JSON_SAMPLE = `{
  "name": "repay_obligation_liquidity_v2",
  "accounts": [
    { "name": "owner", "signer": true },
    { "name": "obligation", "writable": true },
    { "name": "lending_market" }
  ],
  "args": [{ "name": "liquidity_amount", "type": "u64" }],
  "discriminator": [116, 174, 213, 76, 180, 53, 210, 144]
}`;

const LOGS = [
  'Program ComputeBudget111111111111111111111111111111 invoke [1]',
  'Program ComputeBudget111111111111111111111111111111 success',
  `Program ${KLEND} invoke [1]`,
  'Program log: Instruction: RefreshReserve',
  `Program ${KLEND} consumed 41213 of 1399850 compute units`,
  `Program ${KLEND} success`,
  `Program ${KLEND} invoke [1]`,
  'Program log: Instruction: RepayObligationLiquidityV2',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]',
  'Program log: Instruction: TransferChecked',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 6200 of 1310421 compute units',
  'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
  'Program log: AnchorError occurred. Error Code: ObligationStale. Error Number: 6031. Error Message: Obligation needs to be refreshed.',
  `Program ${KLEND} consumed 89412 of 1358637 compute units`,
  `Program ${KLEND} failed: custom program error: 0x178f`,
];

function Code() {
  return (
    <DemoGrid>
      <Demo title="CodeBlock: TypeScript, with Download" wide>
        <CodeBlock code={TS} language="ts" title="repay.ts" download="repay.ts" />
      </Demo>
      <Demo title="CodeBlock: JSON, short, wrapped">
        <CodeBlock code={JSON_SAMPLE} language="json" title="klend.idl.json (part)" maxHeight={220} wrap />
      </Demo>
      <Demo title="CodeBlock: text, no line numbers">
        <CodeBlock code={'npm run build\nnpm test -w apps/web'} language="text" lineNumbers={false} title="Terminal" />
      </Demo>
      <Demo title="LogViewer with a failure" wide>
        <LogViewer logs={LOGS} />
      </Demo>
      <Demo title="LogViewer: errors only, from the start">
        <LogViewer logs={LOGS} errorsOnly maxHeight={160} />
      </Demo>
      <Demo title="LogViewer: no logs">
        <LogViewer logs={[]} title="Simulation logs" />
      </Demo>
    </DemoGrid>
  );
}

function Feedback() {
  return (
    <DemoGrid>
      <Demo title="Skeleton: a position card loading">
        <Surface aria-busy="true" className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton lines={3} />
        </Surface>
      </Demo>
      <Demo title="Spinner">
        <Row className="gap-5 text-muted">
          <Spinner size="xs" />
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <Spinner size="xl" className="text-accent" label="Loading" />
        </Row>
      </Demo>
      <Demo title="EmptyState">
        <Surface className="p-0">
          <EmptyState
            icon={<Inbox />}
            title="No positions"
            action={
              <Button size="sm" variant="primary" icon={<LifeBuoy />}>
                Try the demo position
              </Button>
            }
          >
            This wallet has no Kamino obligations on the main market.
          </EmptyState>
        </Surface>
      </Demo>
      <Demo title="EmptyState: compact">
        <Surface className="p-0">
          <EmptyState compact icon={<Blocks />} title="No steps yet">
            Pick an instruction to add the first one.
          </EmptyState>
        </Surface>
      </Demo>
    </DemoGrid>
  );
}

export const sections: DevSection[] = [
  { id: 'ui-buttons', title: 'Buttons', description: 'Button and IconButton: variants, sizes, icons, loading, disabled.', render: () => <Buttons /> },
  { id: 'ui-badges', title: 'Badges', description: 'The account tags of the old screens and the statuses.', render: () => <Badges /> },
  { id: 'ui-alerts', title: 'Alerts', description: 'role="alert" for danger, role="status" for the rest. "Why?" holds the long reason.', render: () => <Alerts /> },
  { id: 'ui-cards', title: 'Cards', render: () => <Cards /> },
  { id: 'ui-inputs', title: 'Fields', description: 'Input, AddressInput, AmountInput, Select and Combobox, with hints and errors.', render: () => <Inputs /> },
  { id: 'ui-toggles', title: 'Switch, Checkbox, Slider', render: () => <Toggles /> },
  { id: 'ui-tabs', title: 'Tabs', render: () => <TabsDemo /> },
  { id: 'ui-overlays', title: 'Dialog, Popover, Tooltip, Disclosure, Toasts', render: () => <Overlays /> },
  { id: 'ui-data', title: 'Figures, addresses, chains and tokens', render: () => <Data /> },
  { id: 'ui-meters', title: 'Meter and HealthBar', description: 'Limits of a transaction, and an LTV against its liquidation line.', render: () => <Meters /> },
  { id: 'ui-progress', title: 'Stepper and Timeline', render: () => <Progress /> },
  { id: 'ui-code', title: 'CodeBlock and LogViewer', render: () => <Code /> },
  { id: 'ui-feedback', title: 'Skeleton, Spinner, EmptyState', render: () => <Feedback /> },
];
