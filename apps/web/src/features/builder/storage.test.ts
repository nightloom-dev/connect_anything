import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';
import type { Idl } from '@connect-anything/core';
import type { StoredRecipe } from '../../recipe.ts';
import { IMPORT, dropImport, forgetRecent, readImport, readRecent, readSession, rememberProgram, saveSession, setStepInUrl, stepInUrl, type Saved } from './storage.ts';

// Node has no sessionStorage, localStorage, location or history: each test gets fresh ones that keep what a tab would.

const RECIPE: StoredRecipe = JSON.parse(readFileSync(new URL('../../../../../fixtures/klend-repay-wrong-market.recipe.json', import.meta.url), 'utf8'));
const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
const KLEND_IDL = RECIPE.idls[KLEND];
const OTHER: Idl = { ...KLEND_IDL, address: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', metadata: { name: 'whirlpool', version: '0.3.0', spec: '0.1.0' } };
/** The table the klend repay of fixtures/klend-repay-lookup-table.sim.json was simulated with. */
const TABLE = '284iwGtA9X9aLy3KsyV8uT2pXLARhYbiSi5SiM2g47M2';
const USDC = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
const SESSION = 'connect-anything:builder';

/** Storage as a tab has it; `broken` makes every call throw, as when storage is off or full. */
class Memory {
  items = new Map<string, string>();
  broken = false;
  getItem(key: string) {
    if (this.broken) throw new Error('SecurityError');
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.broken) throw new Error('QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string) {
    if (this.broken) throw new Error('SecurityError');
    this.items.delete(key);
  }
}

let session: Memory;
let local: Memory;
let address: URL;
let replaced: string[];

const stub = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

beforeEach(() => {
  session = new Memory();
  local = new Memory();
  address = new URL('http://localhost/build');
  replaced = [];
  stub('sessionStorage', session);
  stub('localStorage', local);
  stub('location', {
    get href() {
      return address.href;
    },
    get search() {
      return address.search;
    },
  });
  stub('history', {
    state: null,
    replaceState(_state: unknown, _unused: string, url: string | URL) {
      address = new URL(String(url), address);
      replaced.push(address.href);
    },
  });
});

/** What the builder holds after the Kamino page handed its recipe over. */
const saved = (more: Partial<Saved> = {}): Saved => ({ idl: KLEND_IDL, idls: { [KLEND]: KLEND_IDL }, steps: RECIPE.steps, target: USDC, ...more });
const stored = () => JSON.parse(session.items.get(SESSION)!);
const store = (value: unknown) => session.items.set(SESSION, typeof value === 'string' ? value : JSON.stringify(value));

describe('readSession and saveSession', () => {
  test('nothing stored is nothing restored', () => {
    assert.equal(readSession(), undefined);
  });

  test('a saved session comes back as it was', () => {
    saveSession(saved());
    assert.deepEqual(readSession(), saved());
    assert.equal(stored().version, 1);
    assert.equal(stored().idl, KLEND);
  });

  test('lookup tables come back with the steps they were handed over with', () => {
    saveSession(saved({ lookupTables: [TABLE] }));
    assert.deepEqual(stored().lookupTables, [TABLE]);
    assert.deepEqual(readSession(), saved({ lookupTables: [TABLE] }));
  });

  test('without lookup tables the session is written as before them, and none come back', () => {
    for (const lookupTables of [undefined, []]) {
      saveSession(saved({ lookupTables }));
      assert.equal(Object.hasOwn(stored(), 'lookupTables'), false);
      assert.equal(Object.hasOwn(readSession()!, 'lookupTables'), false);
    }
  });

  test('a session written before lookup tables were kept is restored', () => {
    store({ version: 1, idl: KLEND, idls: { [KLEND]: KLEND_IDL }, steps: RECIPE.steps, target: USDC });
    assert.deepEqual(readSession(), saved());
  });

  test('only the IDL on screen and those the steps run are kept', () => {
    saveSession(saved({ idl: undefined, idls: { [KLEND]: KLEND_IDL, [OTHER.address]: OTHER } }));
    assert.deepEqual(Object.keys(stored().idls), [KLEND]);
    saveSession(saved({ idl: OTHER, idls: { [KLEND]: KLEND_IDL, [OTHER.address]: OTHER }, steps: [] }));
    assert.deepEqual(Object.keys(stored().idls), [OTHER.address]);
    assert.deepEqual(readSession(), { idl: OTHER, idls: { [OTHER.address]: OTHER }, steps: [], target: USDC });
  });

  test('what is not JSON, or not this format, is not restored', () => {
    const good = { version: 1, idl: KLEND, idls: { [KLEND]: KLEND_IDL }, steps: RECIPE.steps, target: USDC };
    for (const value of [
      '{"version": 1,',
      'null',
      '[]',
      { ...good, version: 2 },
      { ...good, version: undefined },
      { ...good, idls: [KLEND_IDL] },
      { ...good, steps: 'all of them' },
      { ...good, target: 7 },
    ]) {
      store(value);
      assert.equal(readSession(), undefined, JSON.stringify(value).slice(0, 80));
    }
  });

  test('a session that would lose a step is not restored at all', () => {
    const [first, ...rest] = RECIPE.steps;
    for (const step of [
      { ...first, ixName: 'no_such_instruction' },
      { ...first, program: OTHER.address },
      { ...first, args: 'none' },
      { ...first, inputs: null },
      'refresh_reserve',
    ]) {
      store({ version: 1, idl: KLEND, idls: { [KLEND]: KLEND_IDL }, steps: [step, ...rest], target: USDC });
      assert.equal(readSession(), undefined, JSON.stringify(step).slice(0, 80));
    }
    // an IDL kept under an address that is not its own is no IDL for that program, so its steps go with it
    store({ version: 1, idl: KLEND, idls: { [KLEND]: OTHER }, steps: RECIPE.steps, target: USDC });
    assert.equal(readSession(), undefined);
  });

  test('an IDL on screen that was not kept is left out, and the rest restored', () => {
    store({ version: 1, idl: OTHER.address, idls: { [KLEND]: KLEND_IDL }, steps: RECIPE.steps, target: USDC });
    assert.deepEqual(readSession(), saved({ idl: undefined }));
  });

  test('lookup tables that cannot be read leave the session out, so the recipe is not sent without them', () => {
    const good = { version: 1, idl: KLEND, idls: { [KLEND]: KLEND_IDL }, steps: RECIPE.steps, target: USDC };
    for (const lookupTables of [TABLE, [TABLE.slice(0, 20)], [`0${TABLE.slice(1)}`], ['not a key'], [7], Array.from({ length: 17 }, () => TABLE), null]) {
      store({ ...good, lookupTables });
      assert.equal(readSession(), undefined, JSON.stringify(lookupTables).slice(0, 80));
    }
  });

  test('storage that is off or full only forgets', () => {
    session.broken = true;
    assert.doesNotThrow(() => saveSession(saved()));
    assert.equal(readSession(), undefined);
  });
});

describe('readImport', () => {
  test('nothing handed over is nothing to open', () => {
    assert.equal(readImport(), undefined);
  });

  test('a recipe handed over opens with its lookup tables, and stays until it is dropped', () => {
    session.items.set(IMPORT, JSON.stringify({ ...RECIPE, lookupTables: [TABLE] }));
    assert.deepEqual(readImport(), { recipe: { ...RECIPE, lookupTables: [TABLE] } });
    assert.deepEqual(readImport()?.recipe?.lookupTables, [TABLE]);
    dropImport();
    assert.equal(readImport(), undefined);
    assert.equal(session.items.has(IMPORT), false);
  });

  test('what cannot be opened says why', () => {
    session.items.set(IMPORT, 'not JSON');
    assert.deepEqual(readImport(), { problem: 'It is not JSON.' });
    session.items.set(IMPORT, JSON.stringify({ version: 2, steps: 'all of them' }));
    assert.deepEqual(readImport(), { problem: 'This recipe is malformed: it is not a version 1 recipe.' });
    session.items.set(IMPORT, JSON.stringify({ ...RECIPE, lookupTables: ['not a key'] }));
    assert.deepEqual(readImport(), { problem: 'This recipe is malformed: its lookup tables are not valid.' });
  });

  test('storage that is off hands nothing over', () => {
    session.items.set(IMPORT, JSON.stringify(RECIPE));
    session.broken = true;
    assert.equal(readImport(), undefined);
    assert.doesNotThrow(dropImport);
  });
});

describe('stepInUrl and setStepInUrl', () => {
  test('?step= is 1 to 4, and anything else is no step', () => {
    for (const [search, step] of [
      ['?step=1', 1],
      ['?step=3', 3],
      ['?step=4', 4],
      ['?x=1&step=2', 2],
      ['', undefined],
      ['?step=', undefined],
      ['?step=0', undefined],
      ['?step=5', undefined],
      ['?step=2.5', undefined],
      ['?step=-1', undefined],
      ['?step=two', undefined],
    ] as const) {
      address = new URL(`http://localhost/build${search}`);
      assert.equal(stepInUrl(), step, search);
    }
  });

  test('the step replaces the one in the address, keeps the rest, and adds no history entry when it is there', () => {
    address = new URL('http://localhost/build?x=1#top');
    setStepInUrl(2);
    assert.deepEqual(replaced, ['http://localhost/build?x=1&step=2#top']);
    assert.equal(stepInUrl(), 2);
    setStepInUrl(2);
    assert.equal(replaced.length, 1);
    setStepInUrl(3);
    assert.deepEqual(replaced.at(-1), 'http://localhost/build?x=1&step=3#top');
  });
});

describe('recent programs', () => {
  test('a program goes first, once, and six are kept at most', () => {
    assert.deepEqual(readRecent(), []);
    rememberProgram(KLEND_IDL);
    rememberProgram(OTHER);
    assert.deepEqual(rememberProgram(KLEND_IDL), [
      { address: KLEND, name: KLEND_IDL.metadata?.name },
      { address: OTHER.address, name: 'whirlpool' },
    ]);
    for (let n = 0; n < 8; n++) rememberProgram({ ...OTHER, address: `${n}`.repeat(32), metadata: undefined } as unknown as Idl);
    assert.equal(readRecent().length, 6);
    forgetRecent();
    assert.deepEqual(readRecent(), []);
    local.items.set('connect-anything:recent-programs', '{"not": "a list"}');
    assert.deepEqual(readRecent(), []);
  });
});
