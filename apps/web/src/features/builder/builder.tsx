import { useMemo, useState, type ReactNode } from 'react';
import { useExecution } from '@aurora-is-near/intents-connect/react';
import { argFields, buildInstruction, flatten, listInstructions, type Field, type FieldType, type Idl, type SimResult } from '@connect-anything/core';
import { checkCompat, issueText } from '../../compat.ts';
import { bySymbol, fromAtomic, toAtomic, type Token, type TokenList } from '../../connect.ts';
import { Execute } from '../run/execute.tsx';
import { STAND_IN, defaultValue, destinationIssue, isByte, recipeCode, resolveStep, simulationRequest, toSolanaRecipe, variantValue, type Row, type StoredRecipe, type StoredStep } from '../../recipe.ts';
import { AccountList, Boundary, Copy, Failure, FetchError, Notice, fetchJson, short, useAct, useAsync, useJson } from '../../ui.tsx';

const CU_LIMIT = 200_000;
const BYTES_LIMIT = 1232;

function ProgramScreen({ onLoad }: { onLoad: (idl: Idl) => void }) {
  const [programId, setProgramId] = useState('');
  const { working, error, act } = useAct();
  const id = programId.trim();
  const load = (request: () => Promise<{ idl: Idl }>) => act(async () => onLoad((await request()).idl));
  const fromChain = load(() => fetchJson(`/api/idl/${encodeURIComponent(id)}`));
  const fromFile = (file: File) =>
    load(async () => fetchJson(`/api/idl/parse${id ? `?programId=${encodeURIComponent(id)}` : ''}`, { method: 'POST', body: await file.text() }))();

  return (
    <section>
      <h2>1. Program</h2>
      <p>Enter the program ID of an Anchor program on Solana, or upload its IDL file (Anchor 0.30 or newer). With both, the file is read as that program's.</p>
      <form
        className="row"
        onSubmit={event => {
          event.preventDefault();
          fromChain();
        }}
      >
        <input aria-label="Program ID" placeholder="Program ID" spellCheck={false} value={programId} onChange={event => setProgramId(event.target.value)} />
        <button className="primary" disabled={working || !id}>
          Load
        </button>
      </form>
      <label className="file">
        IDL file{' '}
        <input
          type="file"
          accept=".json,application/json"
          disabled={working}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = ''; // so that the same file can be picked again after fixing it
            if (file) fromFile(file);
          }}
        />
      </label>
      {working && <Notice>Reading the IDL…</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}

const typeLabel = (type: FieldType): string => {
  switch (type.kind) {
    case 'int':
    case 'float':
      return type.type;
    case 'pubkey':
      return 'public key';
    case 'bytes':
      return 'hex bytes';
    case 'option':
      return `optional ${typeLabel(type.of)}`;
    case 'vec':
      return isByte(type.of) ? 'hex bytes' : `list of ${typeLabel(type.of)}`;
    case 'array':
      return isByte(type.of) ? `${type.len} hex bytes` : `${type.len} × ${typeLabel(type.of)}`;
    case 'struct':
    case 'enum':
      return type.type ?? type.kind;
    default:
      return type.kind;
  }
};

type InputProps = { type: FieldType; label: string; value: any; onChange: (value: unknown) => void; disabled?: boolean };

function FieldInput({ type, label, value, onChange, disabled }: InputProps) {
  const text = (placeholder: string, inputMode?: 'numeric' | 'decimal') => (
    <input aria-label={label} placeholder={placeholder} inputMode={inputMode} spellCheck={false} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} />
  );
  switch (type.kind) {
    case 'int':
      return text(type.type, 'numeric');
    case 'float':
      return text(type.type, 'decimal');
    case 'string':
      return text('text');
    case 'bytes':
      return text('hex');
    case 'bool':
      return <input aria-label={label} type="checkbox" disabled={disabled} checked={value} onChange={event => onChange(event.target.checked)} />;
    case 'pubkey':
      return (
        <div className="row">
          {text('address')}
          <button onClick={() => onChange(STAND_IN)} disabled={disabled}>
            Intermediary
          </button>
        </div>
      );
    case 'option':
      return (
        <div>
          <label className="inline">
            <input type="checkbox" aria-label={`${label} is set`} disabled={disabled} checked={value !== null} onChange={event => onChange(event.target.checked ? defaultValue(type.of) : null)} /> Set a value
          </label>
          {value !== null && <FieldInput type={type.of} label={label} value={value} onChange={onChange} disabled={disabled} />}
        </div>
      );
    case 'vec':
    case 'array': {
      if (isByte(type.of)) return text(type.kind === 'array' ? `${type.len} bytes as hex` : 'hex');
      const items = value as unknown[];
      return (
        <div className="nested">
          {items.map((item, index) => (
            <div className="item" key={index}>
              <FieldInput type={type.of} label={`${label} ${index + 1}`} value={item} disabled={disabled} onChange={next => onChange(items.map((old, at) => (at === index ? next : old)))} />
              {type.kind === 'vec' && (
                <button disabled={disabled} onClick={() => onChange(items.filter((_, at) => at !== index))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {type.kind === 'vec' && (
            <button disabled={disabled} onClick={() => onChange([...items, defaultValue(type.of)])}>
              Add item
            </button>
          )}
        </div>
      );
    }
    case 'struct':
      return (
        <div className="nested">
          {type.fields.map(field => (
            <Labeled key={field.name} field={field} label={`${label}.${field.name}`} value={value[field.name]} disabled={disabled} onChange={next => onChange({ ...value, [field.name]: next })} />
          ))}
        </div>
      );
    case 'enum': {
      const name: string = typeof value === 'string' ? value : Object.keys(value)[0];
      const fields = type.variants.find(variant => variant.name === name)?.fields ?? [];
      return (
        <div className="nested">
          <select aria-label={label} disabled={disabled} value={name} onChange={event => onChange(variantValue(type.variants.find(variant => variant.name === event.target.value)!))}>
            {type.variants.map(variant => (
              <option key={variant.name}>{variant.name}</option>
            ))}
          </select>
          {fields.map(field => (
            <Labeled key={field.name} field={field} label={`${label}.${field.name}`} value={value[name][field.name]} disabled={disabled} onChange={next => onChange({ [name]: { ...value[name], [field.name]: next } })} />
          ))}
        </div>
      );
    }
  }
}

function Labeled({ field, label, children, ...input }: Omit<InputProps, 'type'> & { field: Field; children?: ReactNode }) {
  return (
    <div className="field">
      <div>
        <strong>{field.name}</strong> <span className="hint">{typeLabel(field)}</span>
      </div>
      {field.docs && <div className="hint">{field.docs.join(' ')}</div>}
      <FieldInput type={field} label={label} {...input} />
      {children}
    </div>
  );
}

function InstructionForm({ idl, ixName, mint, onAdd }: { idl: Idl; ixName: string; mint: string; onAdd: (step: StoredStep) => void }) {
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

  return (
    <div className="form">
      <h3>{ixName}</h3>
      {instruction.docs && <p className="hint">{instruction.docs.join(' ')}</p>}

      <h4>Arguments</h4>
      {fields.length === 0 && <p className="hint">This instruction takes no arguments.</p>}
      {fields.map(field => (
        <Labeled key={field.name} field={field} label={field.name} value={args[field.name]} disabled={amountArg === field.name} onChange={next => setArgs({ ...args, [field.name]: next })}>
          {canTakeAmount.includes(field) && (
            <label className="inline">
              <input type="checkbox" checked={amountArg === field.name} onChange={event => setAmountArg(event.target.checked ? field.name : undefined)} /> Takes the amount delivered, known when the recipe runs
            </label>
          )}
        </Labeled>
      ))}
      {canTakeAmount.length > 0 && !amountArg && <p className="hint">No argument takes the amount delivered, so this step spends a fixed amount and any rest stays with the intermediary.</p>}

      <h4>Accounts</h4>
      <AccountList
        accounts={accounts.slice(0, specs.size)}
        program={idl.address}
        intermediary={STAND_IN}
        edit={row =>
          editable(row) && (
            <div className="row">
              <input
                aria-label={`Address of ${row.name}`}
                spellCheck={false}
                placeholder={row.pubkey && row.pubkey !== idl.address ? 'Another address' : row.optional ? 'Blank leaves it out' : 'Address'}
                value={inputs[row.name] ?? ''}
                onChange={event => setInputs({ ...inputs, [row.name]: event.target.value.trim() })}
              />
              <button onClick={() => setInputs({ ...inputs, [row.name]: STAND_IN })}>Intermediary</button>
            </div>
          )
        }
      />
      <h4>Remaining accounts</h4>
      {remaining.map(({ pubkey, isWritable }, index) => (
        <div className="row" key={index}>
          <input aria-label={`Remaining account ${index + 1}`} spellCheck={false} placeholder="Address" value={pubkey} onChange={event => setRemaining(remaining.map((row, at) => (at === index ? { ...row, pubkey: event.target.value.trim() } : row)))} />
          <label className="inline">
            <input type="checkbox" checked={isWritable} onChange={event => setRemaining(remaining.map((row, at) => (at === index ? { ...row, isWritable: event.target.checked } : row)))} /> Writable
          </label>
          <button onClick={() => setRemaining(remaining.filter((_, at) => at !== index))}>Remove</button>
        </div>
      ))}
      <button onClick={() => setRemaining([...remaining, { pubkey: '', isWritable: false }])}>Add remaining account</button>

      <h4>Compatibility with Connect</h4>
      {issues.length === 0 ? (
        <Notice>Not checked yet. This page only checks that the recipe touches the token it receives, so Connect may still refuse this instruction at the run.</Notice>
      ) : (
        <Notice kind="error">
          {issues.map(issue => (
            <div key={issueText(issue)}>{issueText(issue)}</div>
          ))}
        </Notice>
      )}
      {notReady && <p className="hint">Not ready: {notReady}</p>}
      <button className="primary" disabled={issues.length > 0 || !!notReady} onClick={() => onAdd(step)}>
        Add to recipe
      </button>
    </div>
  );
}

type InstructionScreenProps = {
  idl?: Idl;
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
};

function InstructionScreen({ idl, list, targets, token, onTarget, steps, onSteps, destination, onBack, onNext }: InstructionScreenProps) {
  const [chosen, setChosen] = useState<string>();
  const instructions = useMemo(() => (idl ? listInstructions(idl) : []), [idl]);
  const ixName = instructions.some(({ name }) => name === chosen) ? chosen : undefined; // another program may have been loaded since
  const move = (index: number) => {
    const next = [...steps];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onSteps(next);
  };

  return (
    <section>
      <h2>2. Instruction</h2>
      {!idl ? (
        <Notice>
          No program yet. <button onClick={onBack}>Load a program</button>
        </Notice>
      ) : (
        <p>
          <strong>{idl.metadata?.name ?? 'Program'}</strong> <code>{idl.address}</code> <button onClick={onBack}>Load another program</button>
        </p>
      )}

      <h3>Token the recipe receives</h3>
      {list.loading && <Notice>Loading the tokens Intents Connect can deliver…</Notice>}
      {list.error && <Failure error={list.error} retry={list.retry} />}
      {list.data && targets.length === 0 && <Notice kind="error">Intents Connect lists no Solana token to deliver right now, so no recipe can be built.</Notice>}
      {token && (
        <select aria-label="Token the recipe receives" value={token.assetId} onChange={event => onTarget(event.target.value)}>
          {targets.map(target => (
            <option key={target.assetId} value={target.assetId}>
              {target.symbol} ({short(target.contractAddress!)})
            </option>
          ))}
        </select>
      )}

      {idl && (
        <>
          <h3>Instructions</h3>
          {instructions.length === 0 ? (
            <Notice>This IDL has no instructions.</Notice>
          ) : (
            <ul className="instructions">
              {instructions.map(({ name, docs, args, accounts }) => (
                <li key={name}>
                  <button className={name === ixName ? 'chosen' : ''} aria-pressed={name === ixName} onClick={() => setChosen(name)}>
                    <strong>{name}</strong> <span className="hint">{args} arguments, {accounts} accounts</span>
                    {docs?.[0] && <span className="hint block">{docs[0]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ixName && !token && <Notice>Pick the token the recipe receives first: the accounts depend on it.</Notice>}
          {ixName && token && (
            <Boundary key={`${idl.address} ${ixName}`}>
              <InstructionForm idl={idl} ixName={ixName} mint={token.contractAddress!} onAdd={step => onSteps([...steps, step])} />
            </Boundary>
          )}
        </>
      )}

      <h3>Recipe</h3>
      {steps.length === 0 ? (
        <Notice>Nothing yet. Instructions run in the order added, so add whatever must run first (a refresh, say) before the main one.</Notice>
      ) : (
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={index}>
              <strong>{step.ixName}</strong> <span className="hint">{short(step.program)}</span>{' '}
              {index > 0 && <button onClick={() => move(index)}>Up</button>} <button onClick={() => onSteps(steps.filter((_, at) => at !== index))}>Remove</button>
            </li>
          ))}
        </ol>
      )}
      {destination && <Notice kind="error">{destination}</Notice>}
      <button className="primary" disabled={steps.length === 0 || !token || !!destination} onClick={onNext}>
        Next: simulate
      </button>
    </section>
  );
}

function SimulationReport({ result }: { result: SimResult }) {
  const { verdict, computeUnits, txBytes, warnings, error, logs } = result;
  return (
    <>
      <Notice kind={verdict === 'ok' ? 'ok' : verdict === 'warn' ? 'warn' : 'error'}>
        {verdict === 'ok' && 'The recipe passed simulation.'}
        {verdict === 'warn' && 'The recipe passed simulation with warnings.'}
        {verdict === 'fail' && 'The recipe failed in simulation, and would most likely fail for real.'}
      </Notice>
      <dl className="figures">
        <dt>CU</dt>
        <dd className={computeUnits > CU_LIMIT ? 'over' : ''}>{computeUnits.toLocaleString('en-US')} / 200k</dd>
        <dt>Bytes</dt>
        <dd className={txBytes > BYTES_LIMIT ? 'over' : ''}>{txBytes} / {BYTES_LIMIT}</dd>
      </dl>
      {warnings.length > 0 && (
        <ul>
          {warnings.map(warning => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {error && (
        <Notice kind="error">
          {error.name ?? `Error${error.code === undefined ? '' : ` ${error.code}`}`}: {error.message}
          {error.instructionIndex !== undefined && ` (instruction index ${error.instructionIndex})`}
          {error.programId && <> in <code>{error.programId}</code></>}
        </Notice>
      )}
      <details open={verdict !== 'ok'}>
        <summary>Logs ({logs.length})</summary>
        {logs.length ? <pre>{logs.join('\n')}</pre> : <p className="hint">The simulator gave no logs.</p>}
      </details>
    </>
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
  });

  return (
    <>
      <h3>Export</h3>
      <h4>Link</h4>
      <p className="hint">Opens this recipe on another browser. Whoever opens it runs it with their own wallet and sees that you made it.</p>
      {url ? (
        <div className="row">
          <a href={url}>{url}</a> <Copy text={url} />
        </div>
      ) : (
        <button disabled={working} onClick={create}>
          {working ? 'Creating the link…' : 'Create a link'}
        </button>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <h4>TypeScript</h4>
      {code.problem && <Notice kind="error">The recipe cannot be exported as code: {code.problem}</Notice>}
      {code.text && (
        <>
          <p className="hint">A module exporting a SolanaRecipe for the Aurora SDK.</p>
          <Copy text={code.text} />
          <pre className="code">{code.text}</pre>
        </>
      )}
    </>
  );
}

function SimulateScreen({ stored, token, onBack, onRun }: { stored?: StoredRecipe; token?: Token; onBack: () => void; onRun: () => void }) {
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
    <section>
      <h2>3. Simulation and export</h2>
      {!stored || !token ? (
        <Notice>
          The recipe is empty. <button onClick={onBack}>Add an instruction</button>
        </Notice>
      ) : (
        <>
          <form
            className="row"
            onSubmit={event => {
              event.preventDefault();
              if (typed === tested) sim.retry();
              setTested(typed);
            }}
          >
            <label className="inline">
              Amount delivered to test with <input aria-label="Test amount" inputMode="decimal" value={typed} onChange={event => setTyped(event.target.value)} /> {token.symbol}
            </label>
            <button disabled={sim.loading}>Simulate</button>
          </form>
          {!atomic && <Notice kind="error">"{tested}" is not an amount of {token.symbol}, which has {decimals} decimals.</Notice>}
          {sim.loading && <Notice>Simulating against a mainnet fork…</Notice>}
          {offline && <Notice kind="warn">The simulator is offline, so this recipe has not been checked. You can still export and run it. ({sim.error!.message})</Notice>}
          {sim.error && !offline && <Failure error={sim.error} retry={sim.retry} />}
          {sim.data && <SimulationReport result={sim.data} />}
          {sim.data && atomic && <p className="hint">Tested with {fromAtomic(atomic, decimals)} {token.symbol} delivered, as an intermediary that holds just that.</p>}
          <Export stored={stored} />
          <p>
            <button className="primary" onClick={onRun}>
              Next: run it
            </button>
          </p>
        </>
      )}
    </section>
  );
}

const SCREENS = ['Program', 'Instruction', 'Simulation', 'Run'];

export function Builder() {
  const exec = useExecution();
  const list = useJson<TokenList>('/api/tokens');
  const [screen, setScreen] = useState(1);
  const [idl, setIdl] = useState<Idl>();
  const [idls, setIdls] = useState<Record<string, Idl>>({});
  const [steps, setSteps] = useState<StoredStep[]>([]);
  const [target, setTarget] = useState('');

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

  return (
    <>
      <nav className="tabs" aria-label="Steps">
        {SCREENS.map((name, index) => (
          // leaving screen 4 mid-run would hide the only way to act on a running execution
          <button key={name} className={screen === index + 1 ? 'chosen' : ''} aria-current={screen === index + 1 ? 'step' : undefined} disabled={exec.isBusy || (index >= 2 && !!destination)} onClick={() => setScreen(index + 1)}>
            {index + 1}. {name}
          </button>
        ))}
      </nav>
      {screen === 1 && <ProgramScreen onLoad={onLoad} />}
      {screen === 2 && (
        <Boundary>
          <InstructionScreen idl={idl} list={list} targets={targets} token={token} onTarget={setTarget} steps={steps} onSteps={setSteps} destination={destination} onBack={() => setScreen(1)} onNext={() => setScreen(3)} />
        </Boundary>
      )}
      {screen === 3 && <SimulateScreen stored={stored} token={token} onBack={() => setScreen(idl ? 2 : 1)} onRun={() => setScreen(4)} />}
      {screen === 4 &&
        (stored && recipe ? (
          <section>
            <h2>4. Run</h2>
            <Execute exec={exec} recipe={recipe} stored={stored} />
          </section>
        ) : (
          <section>
            <h2>4. Run</h2>
            <Notice>
              The recipe is empty. <button onClick={() => setScreen(idl ? 2 : 1)}>Add an instruction</button>
            </Notice>
          </section>
        ))}
    </>
  );
}
