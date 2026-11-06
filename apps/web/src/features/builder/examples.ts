import type { Idl } from '@connect-anything/core';

/**
 * Programs to start from, with IDLs that ship with the page so that the demo does not wait on Solana or the converter.
 * Nothing here is written by hand: each IDL is a file the repository already has. Kamino Lend (klend) publishes only a
 * legacy IDL, so its modern copy is recipes/kamino-rescue/klend.idl.json, what the server answers once the converter
 * has run. The other three are the IDLs read from chain by GET /api/idl for the simulator fixtures (fixtures/README.md,
 * "Three more programs"). Each loads as its own chunk, on a click.
 */
export type Example = {
  /** The name the program goes by, as the landing page writes it. */
  name: string;
  /** What kind of program it is, in two or three words, with the short name it is known by when it has one. */
  kind: string;
  program: string;
  load: () => Promise<Idl>;
};

export const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
export const WHIRLPOOLS = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
export const DLMM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
export const DAMM_V2 = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

type Fixture = { idls: Record<string, unknown> };
const fromFixture = (module: { default: unknown }, program: string) => (module.default as Fixture).idls[program] as Idl;

export const EXAMPLES: Example[] = [
  {
    name: 'Kamino Lend',
    kind: 'Lending (klend)',
    program: KLEND,
    load: () => import('../../../../../recipes/kamino-rescue/klend.idl.json').then(module => module.default as unknown as Idl),
  },
  {
    name: 'Orca Whirlpools',
    kind: 'Concentrated liquidity',
    program: WHIRLPOOLS,
    load: () => import('../../../../../fixtures/orca-whirlpool-swap.sim.json').then(module => fromFixture(module, WHIRLPOOLS)),
  },
  {
    name: 'Meteora DLMM',
    kind: 'Liquidity bins',
    program: DLMM,
    load: () => import('../../../../../fixtures/meteora-dlmm-swap.sim.json').then(module => fromFixture(module, DLMM)),
  },
  {
    name: 'Meteora DAMM v2',
    kind: 'Constant product',
    program: DAMM_V2,
    load: () => import('../../../../../fixtures/meteora-damm-v2-swap.sim.json').then(module => fromFixture(module, DAMM_V2)),
  },
];

export const exampleOf = (program: string) => EXAMPLES.find(example => example.program === program);

/** The example's IDL, checked to be the program it says it is. */
export async function loadExample(example: Example): Promise<Idl> {
  const idl = await example.load();
  if (idl?.address !== example.program || !Array.isArray(idl.instructions)) throw new Error(`The bundled IDL of ${example.name} could not be read. Enter its program ID instead.`);
  return idl;
}
