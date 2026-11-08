import type { Idl } from '@connect-anything/core';
import { parseStored, type StoredRecipe } from '../../recipe.ts';

/**
 * Programs to start from, with IDLs that ship with the page so that the demo does not wait on Solana or the converter.
 * Nothing here is written by hand. Kamino Lend (klend) publishes only a legacy IDL, so its modern copy is
 * recipes/kamino-rescue/klend.idl.json, what the server answers once the converter has run. The other three IDLs are
 * those of their ready recipes, read from chain by GET /api/idl. Each loads as its own chunk, on a click.
 *
 * A ready recipe is fixtures/<fixture>.recipe.json: every account and argument filled in, and it builds exactly the
 * instructions of fixtures/<fixture>.sim.json, which ran on a fork of mainnet (examples.test.ts checks both).
 */
export type Example = {
  /** The name the program goes by, as the landing page writes it. */
  name: string;
  /** What kind of program it is, in two or three words, with the short name it is known by when it has one. */
  kind: string;
  program: string;
  load: () => Promise<Idl>;
  ready: {
    /** What the recipe does, as the landing page writes it. */
    what: string;
    /** The name of its files in /fixtures. */
    fixture: string;
    steps: number;
    load: () => Promise<unknown>;
  };
};

export const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
export const WHIRLPOOLS = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
export const DLMM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
export const DAMM_V2 = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

const json = (module: { default: unknown }) => module.default;
const idlOf = (program: string) => (recipe: unknown) => (recipe as StoredRecipe).idls[program];

const ORCA_RECIPE = () => import('../../../../../fixtures/orca-whirlpool-swap.recipe.json').then(json);
const DLMM_RECIPE = () => import('../../../../../fixtures/meteora-dlmm-swap.recipe.json').then(json);
const DAMM_RECIPE = () => import('../../../../../fixtures/meteora-damm-v2-swap.recipe.json').then(json);

export const EXAMPLES: Example[] = [
  {
    name: 'Kamino Lend',
    kind: 'Lending (klend)',
    program: KLEND,
    load: () => import('../../../../../recipes/kamino-rescue/klend.idl.json').then(module => module.default as unknown as Idl),
    ready: { what: 'Repay a USDC debt', fixture: 'klend-repay', steps: 4, load: () => import('../../../../../fixtures/klend-repay.recipe.json').then(json) },
  },
  {
    name: 'Orca Whirlpools',
    kind: 'Concentrated liquidity',
    program: WHIRLPOOLS,
    load: () => ORCA_RECIPE().then(idlOf(WHIRLPOOLS)),
    ready: { what: 'Swap USDC to SOL', fixture: 'orca-whirlpool-swap', steps: 1, load: ORCA_RECIPE },
  },
  {
    name: 'Meteora DLMM',
    kind: 'Liquidity bins',
    program: DLMM,
    load: () => DLMM_RECIPE().then(idlOf(DLMM)),
    ready: { what: 'Swap USDC to SOL', fixture: 'meteora-dlmm-swap', steps: 1, load: DLMM_RECIPE },
  },
  {
    name: 'Meteora DAMM v2',
    kind: 'Constant product',
    program: DAMM_V2,
    load: () => DAMM_RECIPE().then(idlOf(DAMM_V2)),
    ready: { what: 'Swap USDC to SOL', fixture: 'meteora-damm-v2-swap', steps: 1, load: DAMM_RECIPE },
  },
];

export const exampleOf = (program: string) => EXAMPLES.find(example => example.program === program);

/** The example's IDL, checked to be the program it says it is. */
export async function loadExample(example: Example): Promise<Idl> {
  const idl = await example.load();
  if (idl?.address !== example.program || !Array.isArray(idl.instructions)) throw new Error(`The bundled IDL of ${example.name} could not be read. Enter its program ID instead.`);
  return idl;
}

/** The example's ready recipe, checked as any recipe handed to the builder is. */
export async function loadReady(example: Example): Promise<StoredRecipe> {
  const recipe = parseStored(await example.ready.load());
  if (!recipe.steps.every(step => step.program === example.program)) throw new Error(`The ready recipe of ${example.name} runs another program.`);
  return recipe;
}
