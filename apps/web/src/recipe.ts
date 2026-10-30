import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import { prepareSolanaSteps } from '@aurora-is-near/intents-connect-wallet/solana';
import { argFields, buildInstruction, resolveAccounts, toRecipeCode, toSimRequest, type Field, type FieldType, type Idl, type ResolvedAccount } from '@connect-anything/core';
import { PublicKey } from '@solana/web3.js';

// Screens 1 to 3 run without a wallet and resolveAccounts needs a real key to derive from, so a recipe is written with
// this one and it is swapped for the real intermediary at every build. Nobody holds its private key.
export const STAND_IN = '3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7';

const MAX_STEPS = 50;
const MAX_LOOKUP_TABLES = 16;
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';

export type StoredStep = {
  program: string;
  ixName: string;
  args: Record<string, unknown>;
  /** What the author typed for the accounts nothing could find, by account name. */
  inputs: Record<string, string>;
  /** What a recipe knows about its accounts, by account name. null leaves an optional account out. */
  hints?: Record<string, string | null>;
  remaining?: { pubkey: string; isWritable: boolean }[];
  /** A top-level unsigned integer argument that takes the amount delivered, known only when the recipe runs. */
  amountArg?: string;
};

/** What /api/recipes keeps and /r/:id runs. There is no author's title: every word on that page comes from the steps. */
export type StoredRecipe = {
  version: 1;
  destination: { chain: 'sol'; assetId: string; tokenAddress: string };
  idls: Record<string, Idl>;
  steps: StoredStep[];
  lookupTables?: string[];
};

export type Row = Omit<ResolvedAccount, 'docs'>;
export type Context = { intermediary: string; mint: string; amount: string };

function isKey(value: unknown): value is string {
  try {
    return typeof value === 'string' && new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (value: unknown, each: (item: any) => boolean) => Array.isArray(value) && value.every(each);

/** Anyone can POST a recipe, so nothing in one is taken on trust. Throws with the reason. */
export function parseStored(json: unknown): StoredRecipe {
  const check = (ok: unknown, why: string) => {
    if (!ok) throw new Error(`This recipe is malformed: ${why}.`);
  };
  check(isRecord(json) && json.version === 1, 'it is not a version 1 recipe');
  const { destination, idls, steps, lookupTables } = json as Record<string, any>;
  check(isRecord(destination) && destination.chain === 'sol' && typeof destination.assetId === 'string' && isKey(destination.tokenAddress), 'its target token is not a Solana token');
  check(isRecord(idls), 'it has no IDLs');
  check(Array.isArray(steps) && steps.length >= 1 && steps.length <= MAX_STEPS, `it needs 1 to ${MAX_STEPS} steps`);
  check(lookupTables === undefined || (listOf(lookupTables, isKey) && lookupTables.length <= MAX_LOOKUP_TABLES), 'its lookup tables are not valid');

  (steps as unknown[]).forEach((step, index) => {
    const at = `step ${index + 1}`;
    check(isRecord(step) && isKey(step.program), `${at} has no program`);
    const { program, ixName, args, inputs, hints, remaining, amountArg } = step as Record<string, any>;
    // prepareSolanaSteps drops these without a word, and the page would then list a step that does not run
    check(program !== COMPUTE_BUDGET, `${at} is a ComputeBudget instruction, which Connect forbids`);
    const idl = Object.hasOwn(idls, program) ? idls[program] : null;
    // buildInstruction targets idl.address, so this is what makes the program on the page the one that runs
    check(isRecord(idl) && idl.address === program && Array.isArray(idl.instructions), `${at} has no IDL for its program`);
    check(idl.instructions.some((ix: { name?: unknown }) => ix?.name === ixName), `${at} names an instruction its IDL does not have`);
    check(isRecord(args), `${at} has no arguments`);
    check(isRecord(inputs) && Object.values(inputs).every(value => typeof value === 'string'), `${at} has bad account inputs`);
    check(hints === undefined || (isRecord(hints) && Object.values(hints).every(value => value === null || typeof value === 'string')), `${at} has bad account hints`);
    check(remaining === undefined || listOf(remaining, row => isRecord(row) && isKey(row.pubkey) && typeof row.isWritable === 'boolean'), `${at} has bad remaining accounts`);
    if (amountArg !== undefined) {
      const field = argFields(idl as Idl, ixName).find(({ name }) => name === amountArg);
      check(field?.kind === 'int' && field.min === '0', `${at} sends the amount to an argument that is not an unsigned integer`);
    }
  });
  return json as StoredRecipe;
}

/** The accounts and arguments of one step for this intermediary and amount. Throws only on a malformed IDL: an unfinished form shows as accounts without an address. */
export function resolveStep(idl: Idl, step: StoredStep, { intermediary, mint, amount }: Context) {
  const swap = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(STAND_IN, intermediary));
  const args: Record<string, unknown> = step.amountArg === undefined ? swap(step.args) : { ...swap(step.args), [step.amountArg]: amount };
  const named: Row[] = resolveAccounts(idl, step.ixName, args, { intermediary, mint, inputs: swap(step.inputs) }, swap(step.hints ?? {}));
  // Connect lets only the intermediary sign and a remaining account is not it, so the flag is not the author's to set
  const extra: Row[] = swap(step.remaining ?? []).map(({ pubkey, isWritable }, index) => ({ name: `remaining ${index + 1}`, pubkey, isSigner: false, isWritable, source: 'input', optional: false }));
  return { args, accounts: [...named, ...extra] };
}

/** One pure function behind what the page shows, what gets simulated and what Connect receives. */
export function buildRecipe(stored: StoredRecipe, intermediary: string, amount: string) {
  const context = { intermediary, mint: stored.destination.tokenAddress, amount };
  return stored.steps.map(step => {
    const idl = stored.idls[step.program];
    const { args, accounts } = resolveStep(idl, step, context);
    return { ...step, idl, args, accounts, instruction: buildInstruction(idl, step.ixName, args, accounts) };
  });
}

const recipeNames = (stored: StoredRecipe) => ({
  id: 'connect-anything',
  intent: 'connect_anything',
  title: stored.steps.map(step => step.ixName).join(', ').slice(0, 120),
});

export const toSolanaRecipe = (stored: StoredRecipe): SolanaRecipe => ({
  ...recipeNames(stored),
  type: 'solana',
  flow: 'bridge-in',
  destination: stored.destination,
  buildSteps: ({ intermediary, amount }) =>
    prepareSolanaSteps(buildRecipe(stored, intermediary, amount).map(step => step.instruction), { intermediary, addressLookupTables: stored.lookupTables }),
});

export const recipeCode = (stored: StoredRecipe) =>
  toRecipeCode(buildRecipe(stored, STAND_IN, '0'), { ...recipeNames(stored), destination: stored.destination, intermediary: STAND_IN, lookupTables: stored.lookupTables });

export const simulationRequest = (stored: StoredRecipe, amount: string) =>
  toSimRequest(buildRecipe(stored, STAND_IN, amount).map(step => step.instruction), {
    intermediary: STAND_IN,
    fund: { mint: stored.destination.tokenAddress, amount },
    lookupTables: stored.lookupTables,
    idls: stored.idls,
  });

/** Whether an address comes out differently for another intermediary, like an associated token account. */
export const followsIntermediary = (row: Pick<Row, 'derived'>, intermediary: string) =>
  !!row.derived && JSON.stringify(row.derived).includes(new PublicKey(intermediary).toBuffer().toString('hex'));

/** Documentation does not run, and an uploaded copy of an IDL can list its keys in another order. */
const canonical = (value: unknown) =>
  JSON.stringify(value, (key, inner) => (key === 'docs' ? undefined : isRecord(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b))) : inner));

/** A stored IDL is the author's word: a step named `repay` can be anything. This compares it with what the program itself publishes. */
export function matchesPublished(stored: StoredRecipe, program: string, published: Idl) {
  const instruction = (idl: Idl, name: string) => idl.instructions.find(ix => ix.name === name);
  const mine = stored.idls[program];
  return (
    canonical(mine.types) === canonical(published.types) &&
    stored.steps.filter(step => step.program === program).every(({ ixName }) => canonical(instruction(mine, ixName)) === canonical(instruction(published, ixName)))
  );
}

export const isByte = (type: FieldType) => type.kind === 'int' && type.type === 'u8';

const fieldsValue = (fields: Field[], budget: { left: number }) => Object.fromEntries(fields.map(field => [field.name, defaultValue(field, budget)]));

/** An empty form value, in the shape the coder takes. An enum holds its variant's name, or { Variant: { ...fields } } if it has fields. */
export function defaultValue(type: FieldType, budget = { left: 2000 }): unknown {
  // a few bytes of IDL can ask for an array of a billion structs
  if (--budget.left < 0) throw new Error('The arguments of this instruction are too large for a form.');
  switch (type.kind) {
    case 'bool':
      return false;
    case 'option':
      return null;
    case 'vec':
      return isByte(type.of) ? '' : [];
    case 'array':
      return isByte(type.of) ? '' : Array.from({ length: type.len }, () => defaultValue(type.of, budget));
    case 'struct':
      return fieldsValue(type.fields, budget);
    case 'enum':
      return variantValue(type.variants[0], budget);
    default:
      return '';
  }
}

export const variantValue = (variant: { name: string; fields: Field[] }, budget = { left: 2000 }) =>
  variant.fields.length ? { [variant.name]: fieldsValue(variant.fields, budget) } : variant.name;
