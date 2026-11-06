import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { argFields, buildInstruction, flatten, listInstructions, type Idl, type SimResult } from '@connect-anything/core';
import { ArrowRight, CircleCheck, ListPlus, Play, Plus, SquareMousePointer } from 'lucide-react';
import { checkCompat, issueText } from '../../compat.ts';
import { bySymbol, fromAtomic, toAtomic, type Token, type TokenList } from '../../connect.ts';
import { Execute } from '../run/execute.tsx';
import { STAND_IN, defaultValue, destinationIssue, followsIntermediary, recipeCode, resolveStep, simulationRequest, toSolanaRecipe, type Row, type StoredRecipe, type StoredStep } from '../../recipe.ts';
import { Boundary, Failure, FetchError, fetchJson, useAct, useAsync, useJson } from '../../ui.tsx';
import { Alert, Button, Card, EmptyState, Input, Spinner, Stepper, Switch, cn, isSolanaAddress, solanaAddressProblem, toast, type StepItem } from '../../ui/index.ts';
import { AccountsPanel, type AccountGroup, type AccountView } from './AccountsPanel.tsx';
import { EXAMPLES, exampleOf, loadExample } from './examples.ts';
import { ExportTabs } from './ExportPanel.tsx';
import { Labeled, type KeyPicks } from './FieldInput.tsx';
import { InstructionPicker, ProgramBar, type InstructionOption } from './InstructionPicker.tsx';
import { KNOWN, suggestionsFor, type QuickPick } from './known.ts';
import { Examples, HowItWorks, ProgramForm, RecentPrograms } from './ProgramStep.tsx';
import { Readiness, type ReadinessItem } from './Readiness.tsx';
import { RecipeTray, type TrayStep } from './RecipeTray.tsx';
import { RemainingAccounts, remainingAnchor } from './RemainingAccounts.tsx';
import { SimulationPending, SimulationReport, SimulatorOffline } from './SimulateStep.tsx';
import { StepHeader } from './StepHeader.tsx';
import { dropImport, forgetRecent, readImport, readRecent, readSession, rememberProgram, saveSession, setStepInUrl, stepInUrl, type Saved } from './storage.ts';

/** How the form names the intermediary: it is not known until someone runs the recipe. */
const WHO = 'the intermediary of whoever runs this';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type HeadingRef = Ref<HTMLHeadingElement>;

function ProgramScreen({ onLoad, heading, hint }: { onLoad: (idl: Idl) => void; heading: HeadingRef; hint?: string }) {
  const [programId, setProgramId] = useState('');
  const [idError, setIdError] = useState<string>();
  const [example, setExample] = useState<string>();
  const [recent, setRecent] = useState(readRecent);
  const { working, error, act } = useAct();
  const id = programId.trim();
  const load = (request: () => Promise<{ idl: Idl }>) => act(async () => onLoad((await request()).idl));
  // only what was read from chain is worth a chip: an example is one click away anyway, and a file is not on chain
  const fromChain = (address: string) =>
    load(async () => {
      const answer = await fetchJson<{ idl: Idl }>(`/api/idl/${encodeURIComponent(address)}`);
      rememberProgram(answer.idl);
      return answer;
    });
  const fromFile = (file: File) =>
    load(async () => fetchJson(`/api/idl/parse${id ? `?programId=${encodeURIComponent(id)}` : ''}`, { method: 'POST', body: await file.text() }))();

  // a program ID that is no address never reaches the server
  const refuse = () => {
    const problem = id ? solanaAddressProblem(id) : null;
    if (problem) {
      setIdError(problem);
      document.getElementById('program-id')?.focus();
    }
    return !!problem;
  };

  return (
    <section aria-labelledby="builder-step" className="flex flex-col gap-6">
      <StepHeader ref={heading} number={1} title="Program" description="Load an Anchor program by its ID, or from its IDL file. Each instruction it has becomes a form." />
      {hint && <Alert>{hint}</Alert>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start">
        <div className="flex min-w-0 flex-col gap-6 md:col-span-7">
          <ProgramForm
            programId={programId}
            onProgramId={value => {
              setProgramId(value);
              setIdError(undefined);
            }}
            idError={idError}
            onSubmit={() => {
              if (!refuse()) fromChain(id)();
            }}
            onFile={file => {
              if (!refuse()) fromFile(file);
            }}
            working={working}
            exampleWorking={!!example}
            error={error}
          />
          <Examples
            examples={EXAMPLES}
            loading={example}
            disabled={working}
            onPick={program => {
              setExample(program);
              load(async () => ({ idl: await loadExample(exampleOf(program)!) }))().finally(() => setExample(undefined));
            }}
          />
          <RecentPrograms
            recent={recent}
            disabled={working}
            onPick={address => {
              setProgramId(address);
              setIdError(undefined);
              fromChain(address)();
            }}
            onClear={() => {
              forgetRecent();
              setRecent([]);
            }}
          />
        </div>
        <div className="min-w-0 md:col-span-5">
          <HowItWorks />
        </div>
      </div>
    </section>
  );
}

/** A section of the instruction form: a title, a count on the right, a line under it. */
function FormSection({ title, aside, description, children }: { title: string; aside?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-base font-semibold text-text">{title}</h4>
          {aside !== undefined && <span className="text-xs text-muted nums">{aside}</span>}
        </div>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

const ARG_PROBLEM = /^(.+?): (.*)$/s;

/** An optional account left out: the program's own key stands in, as the IDL allows, and nothing signs or writes it. */
const leftOut = (row: Row, program: string) => row.optional && row.pubkey === program && !row.isSigner && !row.isWritable;

/** What to show for an account's address: whose it is when it is the intermediary's, or the key. */
const showsOf = (row: Row, program: string): AccountView['shows'] =>
  !row.pubkey ? 'missing' : leftOut(row, program) ? 'left-out' : row.pubkey === STAND_IN ? 'self' : followsIntermediary(row, STAND_IN) ? 'follows' : 'address';

/** An instruction's docs, three lines of them until asked: some IDLs put a manual there. */
function Docs({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={cn('text-sm leading-relaxed text-muted', long && !open && 'line-clamp-3')}>{text}</p>
      {long && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-sm text-xs font-medium text-accent-hover transition-colors duration-120 hover:text-text">
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

/** One instruction's arguments and accounts, and the way into the recipe once they are complete. */
export function InstructionForm({ idl, ixName, mint, symbol, onAdd }: { idl: Idl; ixName: string; mint: string; symbol: string; onAdd: (step: StoredStep) => void }) {
  const fields = useMemo(() => argFields(idl, ixName), [idl, ixName]);
  const [args, setArgs] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map(field => [field.name, defaultValue(field)])));
  const [amountArg, setAmountArg] = useState<string>();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<{ pubkey: string; isWritable: boolean }[]>([]);

  const instruction = idl.instructions.find(ix => ix.name === ixName)!;
  const specs = new Map(flatten(instruction.accounts).map(({ path, account }) => [path, account]));
  const step: StoredStep = { program: idl.address, ixName, args, inputs, remaining: remaining.length ? remaining : undefined, amountArg };
  // any amount does here: the check is only whether the rest of the form is complete
  const { args: built, accounts } = resolveStep(idl, step, { intermediary: STAND_IN, mint, amount: '1' });

  const issues = checkCompat(idl, ixName);
  let notReady = '';
  try {
    buildInstruction(idl, ixName, built, accounts);
  } catch (error) {
    notReady = (error as Error).message;
  }

  // A pda or an address in the IDL outranks whatever is typed, so only what nothing found and a guess from a name can be corrected.
  const editable = ({ name, source, isSigner }: Row) => {
    const spec = specs.get(name);
    return !!spec && (source === 'input' || (source === 'auto' && !isSigner && !spec.address && !spec.pda));
  };
  const canTakeAmount = fields.filter(field => field.kind === 'int' && field.min === '0');

  // What follows only lays the form out; none of it goes into the step.
  // Each account sits where it was before anything was typed, so that a row does not jump between groups while it is filled in.
  const untyped = resolveStep(idl, { ...step, inputs: {} }, { intermediary: STAND_IN, mint, amount: '1' }).accounts;
  const mintPick: QuickPick = { label: `${symbol} mint`, address: mint };
  const views: AccountView[] = accounts.slice(0, specs.size).map((row, index) => {
    const first = untyped[index] ?? row;
    const scope = row.name.split('.');
    const short = scope.pop()!;
    const group: AccountGroup = leftOut(first, idl.address) ? 'optional' : !first.pubkey || first.source === 'input' ? 'input' : first.source;
    return {
      name: row.name,
      scope,
      short,
      group,
      shows: showsOf(row, idl.address),
      pubkey: row.pubkey,
      isSigner: row.isSigner,
      isWritable: row.isWritable,
      optional: row.optional,
      editable: editable(row),
      value: inputs[row.name] ?? '',
      placeholder: row.pubkey && row.pubkey !== idl.address ? 'Another address' : row.optional ? 'Blank leaves it out' : 'Address',
      docs: specs.get(row.name)?.docs?.join(' '),
      suggestions: suggestionsFor(row.name, mintPick),
    };
  });
  const picks: KeyPicks = { intermediary: STAND_IN, known: KNOWN, suggest: name => suggestionsFor(name, mintPick) };

  // The checklist: every account without an address, every remaining account that is not one, and what the coder says
  // of the arguments once each account has some address.
  const items: ReadinessItem[] = [];
  if (issues.length) items.push({ key: 'compat', label: '', problem: 'Connect cannot run this instruction, as said above.', anchor: 'compat' });
  let probe = '';
  try {
    buildInstruction(idl, ixName, built, accounts.map(row => (row.pubkey && isSolanaAddress(row.pubkey) ? row : { ...row, pubkey: STAND_IN })));
  } catch (error) {
    probe = (error as Error).message;
  }
  const argument = probe.startsWith(`${ixName}.`) ? ARG_PROBLEM.exec(probe.slice(ixName.length + 1)) : null;
  if (argument) {
    const [, path, why] = argument;
    items.push({ key: `arg ${path}`, label: path, problem: why === 'missing' || /: $/.test(why) ? 'needs a value' : why, anchor: `arg-${path.split(/[.[]/)[0]}` });
  } else if (probe) items.push({ key: 'probe', label: '', problem: probe });
  for (const row of accounts.slice(0, specs.size)) if (!row.pubkey) items.push({ key: `account ${row.name}`, label: row.name, problem: 'needs an address', anchor: `account-${row.name}` });
  remaining.forEach(({ pubkey }, index) => {
    if (!isSolanaAddress(pubkey)) items.push({ key: `remaining ${index}`, label: `Remaining account ${index + 1}`, problem: pubkey ? 'is not an address' : 'needs an address', anchor: remainingAnchor(index) });
  });
  const ready = issues.length === 0 && !notReady;
  if (!ready && items.length === 0) items.push({ key: 'not-ready', label: '', problem: notReady });

  return (
    <Card as="section" aria-labelledby="instruction-name" padding="lg" className="flex flex-col gap-8 max-sm:[--card-p:1rem]">
      <header className="flex flex-col gap-1.5">
        <h3 id="instruction-name" className="font-mono text-lg font-semibold break-all text-text">
          {ixName}
        </h3>
        {instruction.docs && <Docs text={instruction.docs.join(' ')} />}
      </header>

      <FormSection title="Arguments" aside={fields.length || undefined}>
        {fields.length === 0 && <p className="text-sm text-muted">This instruction takes no arguments.</p>}
        {fields.map(field => (
          <Labeled
            key={field.name}
            id={`arg-${field.name}`}
            field={field}
            label={field.name}
            value={amountArg === field.name ? '' : args[field.name]}
            placeholder={amountArg === field.name ? 'The amount delivered, known at the run' : undefined}
            disabled={amountArg === field.name}
            picks={picks}
            onChange={next => setArgs({ ...args, [field.name]: next })}
          >
            {canTakeAmount.includes(field) && (
              <Switch
                label="Uses the amount delivered"
                description={
                  amountArg === field.name
                    ? 'Filled in when the recipe runs, with what Connect delivers.'
                    : !amountArg && field === canTakeAmount[0]
                      ? 'Off, this step spends a fixed amount, and any rest stays with the intermediary.'
                      : undefined
                }
                checked={amountArg === field.name}
                onChange={checked => setAmountArg(checked ? field.name : undefined)}
                className="mt-1"
              />
            )}
          </Labeled>
        ))}
      </FormSection>

      <FormSection title="Accounts" aside={specs.size}>
        <AccountsPanel accounts={views} who={WHO} intermediary={STAND_IN} known={KNOWN} onInput={(name, value) => setInputs({ ...inputs, [name]: value.trim() })} />
      </FormSection>

      <FormSection title="Remaining accounts" description="Extra accounts after those the IDL names, for programs that read more.">
        <RemainingAccounts
          rows={remaining}
          onPubkey={(index, pubkey) => setRemaining(remaining.map((row, at) => (at === index ? { ...row, pubkey: pubkey.trim() } : row)))}
          onWritable={(index, isWritable) => setRemaining(remaining.map((row, at) => (at === index ? { ...row, isWritable } : row)))}
          onRemove={index => setRemaining(remaining.filter((_, at) => at !== index))}
          onAdd={() => setRemaining([...remaining, { pubkey: '', isWritable: false }])}
        />
      </FormSection>

      <div className="flex flex-col gap-5 border-t border-border pt-6">
        {issues.length === 0 ? (
          <p className="flex gap-2 text-xs leading-5 text-muted">
            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
            <span>Signers checked: Connect signs only as the intermediary, and this instruction needs no other signer. The simulation in step 3 checks the rest.</span>
          </p>
        ) : (
          <Alert id="compat" kind="danger" title="Connect cannot run this instruction">
            {issues.map(issue => (
              <div key={issueText(issue)}>{issueText(issue)}</div>
            ))}
          </Alert>
        )}
        <Readiness items={items} ready={ready} />
        <Button variant="primary" size="lg" icon={<Plus />} disabled={issues.length > 0 || !!notReady} onClick={() => onAdd(step)} className="sm:self-start">
          Add to recipe
        </Button>
      </div>
    </Card>
  );
}

// A step's key in the tray, by the step itself: a move or a removal keeps the steps and changes their places.
const keys = new WeakMap<StoredStep, string>();
let made = 0;
function keyOf(step: StoredStep) {
  let key = keys.get(step);
  if (key === undefined) keys.set(step, (key = `step ${made++}`));
  return key;
}

type InstructionScreenProps = {
  idl?: Idl;
  idls: Record<string, Idl>;
  list: ReturnType<typeof useJson<TokenList>>;
  targets: Token[];
  token?: Token;
  onTarget: (assetId: string) => void;
  steps: StoredStep[];
  onSteps: (steps: StoredStep[]) => void;
  /** Why Connect would refuse the recipe as it stands. */
  destination?: string;
  onBack: () => void;
  onNext: () => void;
  heading: HeadingRef;
};

function InstructionScreen({ idl, idls, list, targets, token, onTarget, steps, onSteps, destination, onBack, onNext, heading }: InstructionScreenProps) {
  const [chosen, setChosen] = useState<string>();
  const instructions = useMemo(() => (idl ? listInstructions(idl) : []), [idl]);
  const ixName = instructions.some(({ name }) => name === chosen) ? chosen : undefined; // another program may have been loaded since
  const move = (index: number) => {
    const next = [...steps];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onSteps(next);
  };

  // What each step's accounts resolve to with the token as it is, for the tray to show on demand: the resolution the run uses.
  const trayed = useMemo<TrayStep[]>(
    () =>
      steps.map((step, index) => {
        const of = idls[step.program];
        const key = steps.indexOf(step) === index ? keyOf(step) : `${keyOf(step)} ${index}`;
        const shown: TrayStep = { key, ixName: step.ixName, program: step.program, programName: of?.metadata?.name ?? 'Program', amountArg: step.amountArg };
        if (!of || !token) return shown;
        try {
          const { accounts } = resolveStep(of, step, { intermediary: STAND_IN, mint: token.contractAddress!, amount: '1' });
          return { ...shown, accounts: accounts.map(row => ({ name: row.name, pubkey: row.pubkey, source: row.source, shows: showsOf(row, of.address) })) };
        } catch (error) {
          return { ...shown, problem: (error as Error).message };
        }
      }),
    [steps, idls, token],
  );

  // what Connect would refuse, for every instruction at once, so the list can say it before one is picked
  const options = useMemo<InstructionOption[]>(
    () =>
      instructions.map(({ name, docs, args, accounts }) => {
        let issues: string[] = [];
        try {
          issues = idl ? checkCompat(idl, name).map(issueText) : [];
        } catch {
          // the form says what is wrong once it is picked
        }
        return { name, docs: docs?.[0], args, accounts, issues };
      }),
    [idl, instructions],
  );

  return (
    <section aria-labelledby="builder-step" className="flex flex-col gap-6">
      <StepHeader ref={heading} number={2} title="Instruction" description="Pick an instruction and fill in what the IDL cannot find. Add as many as you need: they run in the order added." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start">
        <div className="flex min-w-0 flex-col gap-5 md:col-span-7">
          {!idl ? (
            <Alert
              actions={
                <Button size="sm" onClick={onBack}>
                  Load a program
                </Button>
              }
            >
              No program yet.
            </Alert>
          ) : (
            <>
              <ProgramBar name={idl.metadata?.name ?? 'Program'} address={idl.address} onBack={onBack} />
              {instructions.length === 0 ? <Alert>This IDL has no instructions.</Alert> : <InstructionPicker options={options} value={ixName} onChange={setChosen} />}
              {ixName && !token && <Alert>Pick the token the recipe receives first: the accounts depend on it.</Alert>}
              {ixName && token && (
                <Boundary key={`${idl.address} ${ixName}`}>
                  <InstructionForm
                    idl={idl}
                    ixName={ixName}
                    mint={token.contractAddress!}
                    symbol={token.symbol}
                    onAdd={step => {
                      onSteps([...steps, step]);
                      toast.success(`Added ${step.ixName} to the recipe`, { description: `Step ${steps.length + 1}. Add another, or simulate.` });
                    }}
                  />
                </Boundary>
              )}
              {!ixName && instructions.length > 0 && (
                <EmptyState compact icon={<SquareMousePointer />} title="Pick an instruction above">
                  Its arguments and accounts show here, with the accounts the IDL can find already filled in.
                </EmptyState>
              )}
            </>
          )}
        </div>
        <div className="min-w-0 md:sticky md:top-24 md:col-span-5">
          <RecipeTray
            tokens={{ loading: list.loading, error: list.error, retry: list.retry, empty: !!list.data && targets.length === 0 }}
            failure={list.error && <Failure error={list.error} retry={list.retry} />}
            targets={targets}
            token={token}
            onTarget={onTarget}
            steps={trayed}
            onUp={index => move(index)}
            onDown={index => move(index + 1)}
            onRemove={index => onSteps(steps.filter((_, at) => at !== index))}
            destination={destination}
            nextDisabled={steps.length === 0 || !token || !!destination}
            onNext={onNext}
          />
        </div>
      </div>
    </section>
  );
}

function Export({ stored }: { stored: StoredRecipe }) {
  const code = useMemo(() => {
    try {
      return { text: recipeCode(stored) };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [stored]);
  const { working, error, act } = useAct();
  const [link, setLink] = useState<{ of: StoredRecipe; url: string }>();
  const url = link?.of === stored ? link.url : undefined;
  const create = act(async () => {
    const { id } = await fetchJson<{ id: string }>('/api/recipes', { method: 'POST', body: JSON.stringify(stored) });
    setLink({ of: stored, url: `${location.origin}/r/${id}` });
    toast.success('Link created', { description: 'Whoever opens it can run this recipe with their own wallet.' });
  });

  return (
    <Card as="section" aria-labelledby="export-title" padding="lg" className="flex flex-col gap-4 max-sm:[--card-p:1rem]">
      <h3 id="export-title" className="text-base font-semibold text-text">
        Export
      </h3>
      <ExportTabs url={url} working={working} error={error} onCreate={create} code={code} />
    </Card>
  );
}

type SimulateScreenProps = {
  stored?: StoredRecipe;
  token?: Token;
  /** In place of the screen while the recipe waits on the token list, after a reload. */
  pending?: ReactNode;
  onBack: () => void;
  onRun: () => void;
  heading: HeadingRef;
};

function SimulateScreen({ stored, token, pending, onBack, onRun, heading }: SimulateScreenProps) {
  const decimals = token?.decimals ?? 0;
  const [typed, setTyped] = useState('1');
  const [tested, setTested] = useState(typed);
  const atomic = toAtomic(tested, decimals);
  const sim = useAsync<SimResult>(
    stored && atomic ? async () => fetchJson('/api/simulate', { method: 'POST', body: JSON.stringify(simulationRequest(stored, atomic)) }) : null,
    [stored, atomic],
  );
  const offline = sim.error instanceof FetchError && sim.error.status === 503;

  return (
    <section aria-labelledby="builder-step" className="flex flex-col gap-6">
      <StepHeader ref={heading} number={3} title="Simulation and export" description="A run on a fork of mainnet, as an intermediary that holds just the amount delivered. Then share it as a link, or as code." />
      {pending ?? (!stored || !token ? (
        <EmptyState
          icon={<ListPlus />}
          title="The recipe is empty."
          action={
            <Button variant="primary" onClick={onBack}>
              Add an instruction
            </Button>
          }
        >
          Add an instruction, and it is simulated here.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start">
          <Card as="section" aria-label="Simulation" padding="lg" className="flex min-w-0 flex-col gap-6 md:col-span-7 max-sm:[--card-p:1rem]">
            <form
              className="flex flex-col gap-1.5"
              onSubmit={event => {
                event.preventDefault();
                if (typed === tested) sim.retry();
                setTested(typed);
              }}
            >
              <label htmlFor="test-amount" className="text-sm font-medium text-text">
                Test amount
              </label>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1 sm:max-w-60">
                  <Input
                    id="test-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby="test-amount-hint"
                    value={typed}
                    onChange={event => setTyped(event.target.value)}
                    trailing={<span className="pr-2 text-sm text-muted">{token.symbol}</span>}
                    className="nums"
                  />
                </div>
                <Button type="submit" icon={<Play />} loading={sim.loading} disabled={sim.loading}>
                  Simulate
                </Button>
              </div>
              <p id="test-amount-hint" className="text-xs leading-5 text-muted">
                What Connect delivers to the intermediary. Change it and simulate again.
              </p>
            </form>
            {!atomic && (
              <Alert kind="danger">
                "{tested}" is not an amount of {token.symbol}, which has {decimals} decimals.
              </Alert>
            )}
            {sim.loading && <SimulationPending />}
            {offline && <SimulatorOffline reason={sim.error!.message} />}
            {sim.error && !offline && <Failure error={sim.error} retry={sim.retry} />}
            {sim.data && <SimulationReport result={sim.data} tested={atomic && `Tested with ${fromAtomic(atomic, decimals)} ${token.symbol} delivered, as an intermediary that holds just that.`} />}
          </Card>
          <div className="flex min-w-0 flex-col gap-4 md:sticky md:top-24 md:col-span-5">
            <Export stored={stored} />
            <Button variant="primary" size="lg" block iconRight={<ArrowRight />} onClick={onRun}>
              Next: run it
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Steps 3 and 4 after a reload: the recipe is back, and waits on the token list to know what it receives. */
function TokensPending({ list }: { list: ReturnType<typeof useJson<TokenList>> }) {
  if (list.error) return <Failure error={list.error} retry={list.retry} />;
  if (list.data) return <Alert kind="danger">Intents Connect lists no Solana token to deliver right now, so no recipe can be built.</Alert>;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <Spinner size="sm" />
      Loading the tokens Intents Connect can deliver…
    </p>
  );
}

const STEPS = ['Program', 'Instruction', 'Simulate', 'Run'];

/** Why the builder opened at the program in place of the later step the address asked for. */
const NOTHING_YET: Record<number, string> = {
  2: 'Instructions come from a program: load one first.',
  3: 'Nothing to simulate yet: load a program, then add an instruction.',
  4: 'Nothing to run yet: load a program, then add an instruction.',
};

type Start = { saved?: Saved; imported?: StoredRecipe; problem?: string; screen: number; asked?: number };

/**
 * Where the builder opens: a recipe another page handed over, else what this tab left, at the step in the address. A later
 * step with no program and no recipe behind it, as the landing page links to, opens the program instead, saying why.
 */
function start(): Start {
  const handed = readImport();
  const step = stepInUrl();
  if (handed?.recipe) return { imported: handed.recipe, screen: step ?? 2 };
  const saved = readSession();
  if (step && step > 1 && !saved?.idl && !saved?.steps.length) return { saved, problem: handed?.problem, screen: 1, asked: step };
  return { saved, problem: handed?.problem, screen: step ?? 1 };
}

export function Builder() {
  const exec = useExecution();
  const list = useJson<TokenList>('/api/tokens');
  const [initial] = useState(start);
  const [screen, setScreen] = useState(initial.screen);
  const [idl, setIdl] = useState<Idl | undefined>(() => {
    const last = initial.imported?.steps.at(-1);
    return last ? initial.imported!.idls[last.program] : initial.saved?.idl;
  });
  const [idls, setIdls] = useState<Record<string, Idl>>(() => initial.imported?.idls ?? initial.saved?.idls ?? {});
  const [steps, setSteps] = useState<StoredStep[]>(() => initial.imported?.steps ?? initial.saved?.steps ?? []);
  const [target, setTarget] = useState(() => initial.imported?.destination.assetId ?? initial.saved?.target ?? '');
  const [problem, setProblem] = useState(initial.problem);

  // Known limit: native SOL is left out as a target, since it has no mint to fund a simulation with or to read a balance of. Wrapped tokens work.
  const targets = useMemo(() => (list.data?.tokens ?? []).filter(token => token.contractAddress).sort(bySymbol), [list.data]);
  const token = targets.find(({ assetId }) => assetId === target) ?? targets.find(({ symbol }) => symbol === 'USDC') ?? targets[0];

  const stored = useMemo<StoredRecipe | undefined>(
    () =>
      token && steps.length
        ? {
            version: 1,
            destination: { chain: 'sol', assetId: token.assetId, tokenAddress: token.contractAddress! },
            idls: Object.fromEntries(steps.map(({ program }) => [program, idls[program]])),
            steps,
          }
        : undefined,
    [token, steps, idls],
  );
  const recipe = useMemo(() => stored && toSolanaRecipe(stored), [stored]);
  const destination = useMemo(() => (stored ? destinationIssue(stored, STAND_IN) : undefined), [stored]);

  const onLoad = (loaded: Idl) => {
    setIdl(loaded);
    setIdls(known => ({ ...known, [loaded.address]: loaded }));
    setScreen(2);
  };

  // The handed-over recipe is read once: the key goes, and a reload brings back the session instead.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || (!initial.imported && !initial.problem)) return;
    announced.current = true;
    dropImport();
    const count = initial.imported?.steps.length ?? 0;
    if (initial.imported) toast.success('Recipe opened in the builder', { description: `${count === 1 ? '1 step' : `${count} steps`}. Change them here, then simulate.` });
  }, [initial]);

  useEffect(() => saveSession({ idl, idls, steps, target }), [idl, idls, steps, target]);

  // The step goes in the address, and the new step's heading takes the focus so that a screen reader says where it is.
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(screen);
  useEffect(() => {
    if (screen !== 1 || stepInUrl() !== undefined) setStepInUrl(screen);
    if (shown.current === screen) return;
    shown.current = screen;
    setProblem(undefined);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [screen]);

  // ?step=3 or 4 for a recipe Connect would refuse is a way around the lock of the stepper, so it opens step 2
  useEffect(() => {
    if (screen >= 3 && destination && !exec.isBusy) setScreen(2);
  }, [screen, destination, exec.isBusy]);

  const pending = steps.length > 0 && !token ? <TokensPending list={list} /> : undefined;

  const stepper: StepItem[] = STEPS.map((title, index) => {
    // leaving screen 4 mid-run would hide the only way to act on a running execution
    const locked = exec.isBusy || (index >= 2 && !!destination);
    const done = [!!idl, steps.length > 0, screen > 3 && steps.length > 0, false][index];
    return {
      id: String(index + 1),
      title,
      state: screen === index + 1 ? 'current' : locked ? 'locked' : done ? 'done' : 'upcoming',
      reason: exec.isBusy ? 'A run is in progress, and this step shows the only way to act on it.' : 'Connect would refuse the recipe as it is: see the recipe in step 2.',
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={stepper} onSelect={id => setScreen(Number(id))} className="border-b border-border pb-5" />
      {problem && (
        <Alert kind="danger" title="The recipe handed to the builder could not be opened">
          {problem}
        </Alert>
      )}
      {screen === 1 && <ProgramScreen onLoad={onLoad} heading={heading} hint={idl || !initial.asked ? undefined : NOTHING_YET[initial.asked]} />}
      {screen === 2 && (
        <Boundary>
          <InstructionScreen
            idl={idl}
            idls={idls}
            list={list}
            targets={targets}
            token={token}
            onTarget={setTarget}
            steps={steps}
            onSteps={setSteps}
            destination={destination}
            onBack={() => setScreen(1)}
            onNext={() => setScreen(3)}
            heading={heading}
          />
        </Boundary>
      )}
      {screen === 3 && <SimulateScreen stored={stored} token={token} pending={pending} onBack={() => setScreen(idl ? 2 : 1)} onRun={() => setScreen(4)} heading={heading} />}
      {screen === 4 && (
        <section aria-labelledby="builder-step" className="flex flex-col gap-6">
          <StepHeader ref={heading} number={4} title="Run" description="Pay from Base, Arbitrum or Ethereum with one signature. Intents Connect delivers the token on Solana and runs the recipe." />
          {pending ?? (stored && recipe ? (
            <Execute exec={exec} recipe={recipe} stored={stored} />
          ) : (
            <EmptyState
              icon={<ListPlus />}
              title="The recipe is empty."
              action={
                <Button variant="primary" onClick={() => setScreen(idl ? 2 : 1)}>
                  Add an instruction
                </Button>
              }
            >
              Add an instruction, and it runs here.
            </EmptyState>
          ))}
        </section>
      )}
    </div>
  );
}
