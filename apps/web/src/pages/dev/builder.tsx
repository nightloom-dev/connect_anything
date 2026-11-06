import { useEffect, useState, type ReactNode } from 'react';
import { listInstructions, type Idl, type SimResult } from '@connect-anything/core';
import { checkCompat, issueText } from '../../compat.ts';
import type { Token } from '../../connect.ts';
import { recipeCode, STAND_IN, type StoredRecipe } from '../../recipe.ts';
import { AccountsPanel, type AccountView } from '../../features/builder/AccountsPanel.tsx';
import { InstructionForm } from '../../features/builder/builder.tsx';
import { EXAMPLES, KLEND, WHIRLPOOLS, exampleOf, loadExample } from '../../features/builder/examples.ts';
import { ExportTabs } from '../../features/builder/ExportPanel.tsx';
import { InstructionPicker, InstructionRow, ProgramBar, type InstructionOption } from '../../features/builder/InstructionPicker.tsx';
import { KNOWN, suggestionsFor } from '../../features/builder/known.ts';
import { DropZone, Examples, HowItWorks, ProgramForm, RecentPrograms } from '../../features/builder/ProgramStep.tsx';
import { Readiness, type ReadinessItem } from '../../features/builder/Readiness.tsx';
import { RecipeTray, type TrayStep } from '../../features/builder/RecipeTray.tsx';
import { RemainingAccounts } from '../../features/builder/RemainingAccounts.tsx';
import { Meters, SimulationPending, SimulationReport, SimulatorOffline, Verdict } from '../../features/builder/SimulateStep.tsx';
import { Failure } from '../../ui.tsx';
import { Skeleton, isSolanaAddress, toast } from '../../ui/index.ts';
import okResult from '../../../../../fixtures/klend-repay.result.json';
import warnResult from '../../../../../fixtures/klend-repay-six-reserves.result.json';
import failResult from '../../../../../fixtures/klend-repay-wrong-market.result.json';
import { Demo, DemoGrid, Surface } from './kit.tsx';
import type { DevSection } from './types.ts';

// The builder's parts in each of their states. The IDLs, the simulation results and the recipe are the repository's own
// fixtures; the rest is made up for the state it shows.

export const order = 30;

const OK = okResult as SimResult;
const WARN = warnResult as SimResult;
const FAIL = failResult as SimResult;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const REPAY = 'repay_obligation_liquidity_v2';
const noop = () => {};

/** What GET /api/tokens lists to deliver on Solana, in the builder's order. */
const TOKENS: Token[] = [
  { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', blockchain: 'sol', contractAddress: USDC_MINT, decimals: 6 },
  { assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near', symbol: 'USDT', blockchain: 'sol', contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  { assetId: 'nep141:sol.omft.near', symbol: 'wSOL', blockchain: 'sol', contractAddress: 'So11111111111111111111111111111111111111112', decimals: 9 },
];

/** Something the gallery reads on demand, as the builder does: an example IDL, the demo recipe. */
function useLoaded<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    let live = true;
    load().then(
      loaded => live && setValue(loaded),
      (failure: Error) => live && setError(failure),
    );
    return () => {
      live = false;
    };
  }, []); // read once
  return { value, error };
}

const example = (program: string) => () => loadExample(exampleOf(program)!);

/** An example's IDL, read as the builder reads it, then what is drawn from it. */
function Loading({ children, program }: { children: (idl: Idl) => ReactNode; program: string }) {
  const { value, error } = useLoaded(example(program));
  if (error) return <Failure error={error} />;
  return value ? children(value) : <Skeleton className="h-24" />;
}

const optionsOf = (idl: Idl): InstructionOption[] =>
  listInstructions(idl).map(({ name, docs, args, accounts }) => ({ name, docs: docs?.[0], args, accounts, issues: checkCompat(idl, name).map(issueText) }));

function ProgramStates() {
  const [file, setFile] = useState<string>();
  return (
    <DemoGrid>
      <Demo title="Program ID and file, idle">
        <ProgramForm programId="" onProgramId={noop} onSubmit={noop} onFile={picked => setFile(picked.name)} working={false} />
        {file && <p className="text-xs text-muted">Picked {file}</p>}
      </Demo>
      <Demo title="An ID that is no address, refused before any request">
        <ProgramForm programId="not-a-key" onProgramId={noop} idError="A Solana address is base58: letters and digits, without 0, O, I or l." onSubmit={noop} onFile={noop} working={false} />
      </Demo>
      <Demo title="Reading the IDL">
        <ProgramForm programId={KLEND} onProgramId={noop} onSubmit={noop} onFile={noop} working />
      </Demo>
      <Demo title="No IDL on chain, with the way out">
        <ProgramForm programId="11111111111111111111111111111111" onProgramId={noop} onSubmit={noop} onFile={noop} working={false} error="Program 11111111111111111111111111111111 has no Anchor IDL account. Upload its IDL file instead." />
      </Demo>
      <Demo title="Drop zone: idle, a file held over it, disabled" wide>
        <div className="grid gap-4 md:grid-cols-3">
          <DropZone onFile={noop} />
          <DropZone onFile={noop} over />
          <DropZone onFile={noop} disabled />
        </div>
      </Demo>
      <Demo title="Examples">
        <Examples examples={EXAMPLES} onPick={program => toast(`Would load ${exampleOf(program)!.name}`)} />
      </Demo>
      <Demo title="Examples, one loading">
        <Examples examples={EXAMPLES} onPick={noop} loading={WHIRLPOOLS} disabled />
      </Demo>
      <Demo title="Recent programs">
        <RecentPrograms
          recent={[
            { address: KLEND, name: 'kamino_lending' },
            { address: WHIRLPOOLS, name: 'whirlpool' },
            { address: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo' },
          ]}
          onPick={noop}
          onClear={noop}
        />
      </Demo>
      <Demo title="Beside the form">
        <HowItWorks />
      </Demo>
    </DemoGrid>
  );
}

function PickerStates() {
  const [chosen, setChosen] = useState<string>();
  return (
    <DemoGrid>
      <Demo title="Orca Whirlpools: 11 instructions Connect cannot run">
        <Loading program={WHIRLPOOLS}>
          {idl => (
            <div className="flex flex-col gap-4">
              <ProgramBar name={idl.metadata?.name ?? 'Program'} address={idl.address} onBack={noop} />
              <InstructionPicker options={optionsOf(idl)} value={chosen} onChange={setChosen} />
            </div>
          )}
        </Loading>
      </Demo>
      <Demo title="Rows of the list, as it draws them">
        <Loading program={WHIRLPOOLS}>
          {idl => (
            <Surface className="flex flex-col gap-1 p-2">
              {optionsOf(idl)
                .filter(({ name }) => ['swap', 'open_position', 'initialize_pool', 'collect_fees'].includes(name))
                .map(option => (
                  <div key={option.name} className="rounded-md px-3 py-2 hover:bg-text/5">
                    <InstructionRow option={option} />
                  </div>
                ))}
            </Surface>
          )}
        </Loading>
      </Demo>
      <Demo title="Disabled">
        <InstructionPicker options={[]} onChange={noop} disabled />
      </Demo>
    </DemoGrid>
  );
}

function FormStates() {
  return (
    <DemoGrid>
      <Demo title={`Kamino Lend ${REPAY}, as picked`}>
        <Loading program={KLEND}>{idl => <InstructionForm idl={idl} ixName={REPAY} mint={USDC_MINT} symbol="USDC" onAdd={step => toast(`Would add ${step.ixName}`)} />}</Loading>
      </Demo>
      <Demo title="An instruction Connect cannot run: Orca open_position">
        <Loading program={WHIRLPOOLS}>{idl => <InstructionForm idl={idl} ixName="open_position" mint={USDC_MINT} symbol="USDC" onAdd={noop} />}</Loading>
      </Demo>
    </DemoGrid>
  );
}

const account = (name: string, view: Partial<AccountView> & Pick<AccountView, 'group' | 'shows'>): AccountView => {
  const scope = name.split('.');
  const short = scope.pop()!;
  return { name, scope, short, pubkey: null, isSigner: false, isWritable: false, optional: false, editable: false, value: '', placeholder: 'Address', suggestions: suggestionsFor(name, { label: 'USDC mint', address: USDC_MINT }), ...view };
};

/** Every way an account can show, by group. Typing into a field fills it, as in the form. The derived account is the stand-in intermediary's USDC account. */
const ACCOUNTS: AccountView[] = [
  account('repay_accounts.obligation', { group: 'input', shows: 'missing', isWritable: true, editable: true, docs: 'Docs from the IDL go here, under the name.' }),
  account('repay_accounts.lending_market', { group: 'input', shows: 'address', pubkey: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF', value: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF', editable: true }),
  account('repay_accounts.reserve_liquidity_mint', { group: 'input', shows: 'missing', editable: true }),
  account('repay_accounts.token_program', { group: 'input', shows: 'missing', editable: true }),
  account('farms_accounts.obligation_farm_user_state', { group: 'optional', shows: 'left-out', optional: true, editable: true, placeholder: 'Optional', pubkey: KLEND }),
  account('farms_accounts.reserve_farm_state', { group: 'optional', shows: 'left-out', optional: true, editable: true, placeholder: 'Optional', pubkey: KLEND }),
  account('repay_accounts.repay_reserve', { group: 'recipe', shows: 'address', pubkey: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59', isWritable: true }),
  account('repay_accounts.owner', { group: 'auto', shows: 'self', pubkey: STAND_IN, isSigner: true }),
  account('repay_accounts.user_source_liquidity', { group: 'auto', shows: 'follows', pubkey: 'E9yZFuPob5nB8ZnviNS7TrmAwE2sNgixNvHjPN6gcWYU', isWritable: true, editable: true, placeholder: 'Another address' }),
  account('repay_accounts.lending_market_authority', { group: 'auto', shows: 'address', pubkey: '9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo' }),
  account('repay_accounts.instruction_sysvar_account', { group: 'auto', shows: 'address', pubkey: 'Sysvar1nstructions1111111111111111111111111' }),
];

function AccountStates() {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const views = ACCOUNTS.map(view => {
    const value = typed[view.name] ?? view.value;
    if (view.group !== 'input' && view.group !== 'optional' && !value) return view;
    const filled = isSolanaAddress(value);
    return { ...view, value, pubkey: filled ? value : view.pubkey, shows: filled ? 'address' : view.group === 'optional' ? 'left-out' : view.group === 'input' ? 'missing' : view.shows } as AccountView;
  });
  return (
    <DemoGrid>
      <Demo title="Needs your input, optional, from the recipe, found automatically" wide>
        <Surface className="max-w-3xl">
          <AccountsPanel accounts={views} who="the intermediary of whoever runs this" intermediary={STAND_IN} known={KNOWN} onInput={(name, value) => setTyped({ ...typed, [name]: value.trim() })} />
        </Surface>
      </Demo>
    </DemoGrid>
  );
}

const ITEMS: ReadinessItem[] = [
  { key: 'a', label: 'repay_accounts.obligation', problem: 'needs an address', anchor: 'nowhere' },
  { key: 'b', label: 'repay_accounts.reserve_liquidity_mint', problem: 'needs an address', anchor: 'nowhere' },
  { key: 'c', label: 'liquidity_amount', problem: 'needs a value', anchor: 'nowhere' },
  { key: 'd', label: 'repay_accounts.token_program', problem: 'needs an address', anchor: 'nowhere' },
  { key: 'e', label: 'lending_market_authority', problem: 'needs an address', anchor: 'nowhere' },
  { key: 'f', label: 'farms_program', problem: 'needs an address', anchor: 'nowhere' },
  { key: 'g', label: 'Remaining account 1', problem: 'is not an address', anchor: 'nowhere' },
];

function ReadinessStates() {
  const [rows, setRows] = useState([
    { pubkey: USDC_MINT, isWritable: false },
    { pubkey: 'not-an-address', isWritable: true },
  ]);
  return (
    <DemoGrid>
      <Demo title="Ready">
        <Readiness items={[]} ready />
      </Demo>
      <Demo title="Two things left">
        <Readiness items={ITEMS.slice(0, 2)} ready={false} />
      </Demo>
      <Demo title="More than five: the rest behind Show all">
        <Readiness items={ITEMS} ready={false} />
      </Demo>
      <Demo title="A reason with no field to go to">
        <Readiness items={[{ key: 'x', label: '', problem: 'Connect cannot run this instruction, as said above.' }]} ready={false} />
      </Demo>
      <Demo title="Remaining accounts" wide>
        <RemainingAccounts
          rows={rows}
          onPubkey={(index, pubkey) => setRows(rows.map((row, at) => (at === index ? { ...row, pubkey } : row)))}
          onWritable={(index, isWritable) => setRows(rows.map((row, at) => (at === index ? { ...row, isWritable } : row)))}
          onRemove={index => setRows(rows.filter((_, at) => at !== index))}
          onAdd={() => setRows([...rows, { pubkey: '', isWritable: false }])}
        />
      </Demo>
    </DemoGrid>
  );
}

const STEPS: TrayStep[] = [
  { key: 'refresh', ixName: 'refresh_reserve', program: KLEND, programName: 'kamino_lending' },
  {
    key: 'obligation',
    ixName: 'refresh_obligation',
    program: KLEND,
    programName: 'kamino_lending',
    accounts: [
      { name: 'lending_market', pubkey: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF', source: 'recipe', shows: 'address' },
      { name: 'obligation', pubkey: '2WAWpMP739iZuLPAwGqx9mwPCAbDurYMPHuaDj28qnMt', source: 'recipe', shows: 'address' },
      { name: 'remaining 1', pubkey: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59', source: 'recipe', shows: 'address' },
    ],
  },
  {
    key: 'repay',
    ixName: REPAY,
    program: KLEND,
    programName: 'kamino_lending',
    amountArg: 'liquidity_amount',
    accounts: [
      { name: 'repay_accounts.owner', pubkey: STAND_IN, source: 'auto', shows: 'self' },
      { name: 'repay_accounts.obligation', pubkey: '2WAWpMP739iZuLPAwGqx9mwPCAbDurYMPHuaDj28qnMt', source: 'input', shows: 'address' },
      { name: 'repay_accounts.user_source_liquidity', pubkey: 'E9yZFuPob5nB8ZnviNS7TrmAwE2sNgixNvHjPN6gcWYU', source: 'auto', shows: 'follows' },
      { name: 'farms_accounts.reserve_farm_state', pubkey: KLEND, source: 'input', shows: 'left-out' },
      { name: 'repay_accounts.repay_reserve', pubkey: null, source: 'input', shows: 'missing' },
    ],
  },
];

const DESTINATION = `No step references the token this recipe receives, ${TOKENS[1].contractAddress}: neither its mint nor the intermediary's associated token account. Connect refuses such a recipe. Whoever builds it can add the mint as a remaining account of a step.`;

function TrayStates() {
  const [token, setToken] = useState(TOKENS[0]);
  const [steps, setSteps] = useState(STEPS);
  const tokens = { loading: false, retry: noop, empty: false };
  const tray = { targets: TOKENS, token, onTarget: (assetId: string) => setToken(TOKENS.find(item => item.assetId === assetId)!), onUp: noop, onDown: noop, onNext: noop };
  return (
    <DemoGrid>
      <Demo title="Loading the tokens">
        <RecipeTray {...tray} tokens={{ ...tokens, loading: true }} token={undefined} steps={[]} onRemove={noop} nextDisabled />
      </Demo>
      <Demo title="Empty">
        <RecipeTray {...tray} tokens={tokens} steps={[]} onRemove={noop} nextDisabled />
      </Demo>
      <Demo title="Three steps, the last takes the amount">
        <RecipeTray {...tray} tokens={tokens} steps={steps} onRemove={index => setSteps(steps.filter((_, at) => at !== index))} nextDisabled={steps.length === 0} />
      </Demo>
      <Demo title="A token no step touches">
        <RecipeTray {...tray} tokens={tokens} token={TOKENS[1]} steps={STEPS} onRemove={noop} destination={DESTINATION} nextDisabled />
      </Demo>
      <Demo title="The token list failed">
        <RecipeTray {...tray} tokens={tokens} token={undefined} steps={[]} onRemove={noop} failure={<Failure error={new Error('Intents Connect gave no token list (500)')} retry={noop} />} nextDisabled />
      </Demo>
      <Demo title="No token to deliver">
        <RecipeTray {...tray} tokens={{ ...tokens, empty: true }} token={undefined} steps={[]} onRemove={noop} nextDisabled />
      </Demo>
    </DemoGrid>
  );
}

const TESTED = 'Tested with 1 USDC delivered, as an intermediary that holds just that.';

function SimulationStates() {
  return (
    <DemoGrid>
      <Demo title="Verdicts" wide>
        <div className="grid gap-4 md:grid-cols-3">
          <Verdict verdict="ok">{TESTED}</Verdict>
          <Verdict verdict="warn">{TESTED}</Verdict>
          <Verdict verdict="fail">{TESTED}</Verdict>
        </div>
      </Demo>
      <Demo title="Passed: klend-repay.result.json">
        <SimulationReport result={OK} tested={TESTED} />
      </Demo>
      <Demo title="Warnings, over the compute budget: klend-repay-six-reserves.result.json">
        <SimulationReport result={WARN} tested={TESTED} />
      </Demo>
      <Demo title="Failed, with where: klend-repay-wrong-market.result.json">
        <SimulationReport result={FAIL} tested={TESTED} />
      </Demo>
      <Demo title="Simulating, then the simulator offline">
        <div className="flex flex-col gap-6">
          <SimulationPending />
          <SimulatorOffline reason="The simulator is offline: SIM_URL is not set" />
        </div>
      </Demo>
      <Demo title="Meters: well within">
        <Meters computeUnits={115_948} txBytes={934} />
      </Demo>
      <Demo title="Meters: near the limit">
        <Meters computeUnits={186_420} txBytes={1_198} />
      </Demo>
      <Demo title="Meters: over it">
        <Meters computeUnits={250_028} txBytes={1_301} />
      </Demo>
    </DemoGrid>
  );
}

function ExportStates() {
  const demo = useLoaded(() => import('../../../../../fixtures/klend-repay-wrong-market.recipe.json').then(module => module.default as unknown as StoredRecipe));
  const code = demo.value ? { text: recipeCode(demo.value) } : {};
  return (
    <DemoGrid>
      <Demo title="Link, before one is made">
        <ExportTabs working={false} onCreate={() => toast('Would POST /api/recipes')} code={code} />
      </Demo>
      <Demo title="Link, being made">
        <ExportTabs working onCreate={noop} code={code} />
      </Demo>
      <Demo title="Link, made">
        <ExportTabs url={`${location.origin}/r/de000000000000000000000000000001`} working={false} onCreate={noop} code={code} />
      </Demo>
      <Demo title="Link, the store refused">
        <ExportTabs working={false} error="The recipe store is full" onCreate={noop} code={code} />
      </Demo>
      <Demo title="TypeScript of the demo recipe" wide>
        {demo.value ? <ExportTabs working={false} onCreate={noop} code={code} defaultIndex={1} /> : <Skeleton className="h-40" />}
      </Demo>
      <Demo title="TypeScript, when the recipe cannot be built">
        <ExportTabs working={false} onCreate={noop} code={{ problem: `${REPAY}: no address for repay_accounts.obligation` }} defaultIndex={1} />
      </Demo>
    </DemoGrid>
  );
}

export const sections: DevSection[] = [
  { id: 'builder-program', title: 'Builder: program', description: 'Step 1: a program ID checked before any request, the drop zone, the examples that ship with the page, recent programs.', render: () => <ProgramStates /> },
  { id: 'builder-picker', title: 'Builder: instruction search', description: 'Step 2: the Combobox, with each instruction’s size and what Connect cannot run. Real IDLs.', render: () => <PickerStates /> },
  { id: 'builder-form', title: 'Builder: instruction form', description: 'The real form on the real Kamino Lend and Orca Whirlpools IDLs, as picked: accounts grouped, the checklist under it.', render: () => <FormStates /> },
  { id: 'builder-accounts', title: 'Builder: account groups', description: 'Every way an account can show. Type into a field to fill it.', render: () => <AccountStates /> },
  { id: 'builder-readiness', title: 'Builder: readiness', description: 'What stands between the form and "Add to recipe", each a link to its field.', render: () => <ReadinessStates /> },
  { id: 'builder-tray', title: 'Builder: recipe tray', description: 'Beside the form: the token, the steps in order with their accounts on demand, what Connect would refuse, the way on.', render: () => <TrayStates /> },
  { id: 'builder-simulation', title: 'Builder: simulation', description: 'Step 3: verdicts ok, warn and fail on the simulator fixtures, offline, and the meters near their limits.', render: () => <SimulationStates /> },
  { id: 'builder-export', title: 'Builder: export', description: 'A link that opens the recipe elsewhere, or TypeScript for the SDK.', render: () => <ExportStates /> },
];
