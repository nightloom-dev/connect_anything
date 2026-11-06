import type { Idl } from '@connect-anything/core';
import { PublicKey } from '@solana/web3.js';
import { parseStored, type StoredRecipe, type StoredStep } from '../../recipe.ts';

// What the builder keeps across a reload. sessionStorage, so a recipe in progress survives a reload of its tab and no
// more; the step is in ?step=. Storage can be off or full, and then the builder only forgets.

const SESSION = 'connect-anything:builder';
/** Set by another page, as /kamino's "Open in the builder", and read once by /build. The value is a StoredRecipe. */
export const IMPORT = 'connect-anything:builder-import';
const RECENT = 'connect-anything:recent-programs';

/** `lookupTables` are those of a recipe handed over with them, kept as long as its steps are. */
export type Saved = { idl?: Idl; idls: Record<string, Idl>; steps: StoredStep[]; target: string; lookupTables?: string[] };

const isRecord = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isIdl = (value: unknown): value is Idl => isRecord(value) && typeof value.address === 'string' && Array.isArray(value.instructions);

/** What parseStored takes as a recipe's lookup tables: 16 Solana addresses at most. */
function isLookupTables(value: unknown): value is string[] {
  try {
    return Array.isArray(value) && value.length <= 16 && value.every(key => typeof key === 'string' && new PublicKey(key).toBase58() === key);
  } catch {
    return false;
  }
}

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // off, or full: a reload then starts over
  }
}

const session = () => sessionStorage;
const local = () => localStorage;

/** The builder as this tab left it, if it left one this page can still read. */
export function readSession(): Saved | undefined {
  try {
    const json = JSON.parse(read(session, SESSION) ?? 'null');
    if (!isRecord(json) || json.version !== 1 || !isRecord(json.idls) || !Array.isArray(json.steps) || typeof json.target !== 'string') return undefined;
    const idls: Record<string, Idl> = Object.fromEntries(Object.entries(json.idls).filter(([address, idl]) => isIdl(idl) && idl.address === address));
    const steps = (json.steps as unknown[]).filter(
      (step): step is StoredStep =>
        isRecord(step) && Object.hasOwn(idls, step.program) && idls[step.program].instructions.some(ix => ix.name === step.ixName) && isRecord(step.args) && isRecord(step.inputs),
    );
    // a recipe with a step dropped would run something else, so a session that lost one is not restored at all
    if (steps.length !== json.steps.length) return undefined;
    // nor one whose lookup tables cannot be read: the recipe would then be sent without them
    if (json.lookupTables !== undefined && !isLookupTables(json.lookupTables)) return undefined;
    const idl = typeof json.idl === 'string' && Object.hasOwn(idls, json.idl) ? idls[json.idl] : undefined;
    return { idl, idls, steps, target: json.target, ...(json.lookupTables?.length ? { lookupTables: json.lookupTables } : {}) };
  } catch {
    return undefined;
  }
}

/** Keeps the IDL on screen and those the steps run, not every program loaded on the way. */
export function saveSession({ idl, idls, steps, target, lookupTables }: Saved) {
  const kept = Object.fromEntries([...(idl ? [idl.address] : []), ...steps.map(step => step.program)].filter(address => idls[address]).map(address => [address, idls[address]]));
  write(session, SESSION, JSON.stringify({ version: 1, idl: idl?.address, idls: kept, steps, target, ...(lookupTables?.length ? { lookupTables } : {}) }));
}

/** A recipe another page handed over, or why it cannot be used. The key stays until `dropImport`. */
export function readImport(): { recipe?: StoredRecipe; problem?: string } | undefined {
  const raw = read(session, IMPORT);
  if (raw === null) return undefined;
  try {
    return { recipe: parseStored(JSON.parse(raw)) };
  } catch (error) {
    return { problem: error instanceof SyntaxError ? 'It is not JSON.' : (error as Error).message };
  }
}

export const dropImport = () => write(session, IMPORT, null);

/** ?step=1 to 4 of this page's address. */
export function stepInUrl(): number | undefined {
  const step = Number(new URLSearchParams(location.search).get('step'));
  return Number.isInteger(step) && step >= 1 && step <= 4 ? step : undefined;
}

/** Puts the step in the address without a new history entry, so Back still leaves the builder. */
export function setStepInUrl(step: number) {
  const url = new URL(location.href);
  if (url.searchParams.get('step') === String(step)) return;
  url.searchParams.set('step', String(step));
  history.replaceState(history.state, '', url);
}

export type Recent = { address: string; name?: string };

export function readRecent(): Recent[] {
  try {
    const list = JSON.parse(read(local, RECENT) ?? '[]');
    return Array.isArray(list) ? list.filter((item): item is Recent => isRecord(item) && typeof item.address === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

/** The program first, once, and six at most. */
export function rememberProgram(idl: Idl): Recent[] {
  const name = typeof idl.metadata?.name === 'string' ? idl.metadata.name : undefined;
  const list = [{ address: idl.address, name }, ...readRecent().filter(item => item.address !== idl.address)].slice(0, 6);
  write(local, RECENT, JSON.stringify(list));
  return list;
}

export function forgetRecent() {
  write(local, RECENT, null);
}
