import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import type { Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import type { Derived } from './accounts.ts';
import { argFields, buildInstruction, findInstruction, flatten, type AccountInput } from './idl.ts';

export type RecipeStep = {
  idl: Idl;
  ixName: string;
  args: Record<string, unknown>;
  /** From resolveAccounts, plus any remaining accounts. */
  accounts: readonly (AccountInput & { name?: string; derived?: Derived })[];
  /** A top-level unsigned integer argument that takes ctx.amount when the recipe runs. */
  amountArg?: string;
};

export type RecipeMeta = Pick<SolanaRecipe, 'id' | 'intent' | 'title' | 'destination'> & {
  flow?: SolanaRecipe['flow'];
  /** The key the steps were resolved with. The code swaps it, and whatever is derived from it, for the real one. */
  intermediary: string;
  lookupTables?: string[];
};

const HELPERS = {
  hex: `const hex = (bytes: string) => Buffer.from(bytes, 'hex');`,
  key: `const key = (address: string) => new PublicKey(address).toBuffer();`,
  pda: `const pda = (program: string, seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, new PublicKey(program))[0].toBase58();`,
  le: `const le = (amount: string, width: number) => {
  if (!/^\\d+$/.test(amount) || BigInt(amount) >> BigInt(width * 8)) throw new Error(\`Amount \${amount} does not fit \${width} bytes\`);
  return Buffer.from(Array.from({ length: width }, (_, i) => Number((BigInt(amount) >> BigInt(8 * i)) & 255n)));
};`,
  account: `const account = (pubkey: string, isSigner: boolean, isWritable: boolean) => ({ pubkey: new PublicKey(pubkey), isSigner, isWritable });`,
};

const literal = (value: unknown) => JSON.stringify(value);
// An IDL is untrusted text and these names end up in code people will run.
const comment = (name: string) => `// ${name.replace(/[^\w.]/g, '_')}`;

// prepareSolanaSteps swaps the intermediary in accounts only, so the code has to write it, and what derives from it,
// into the data itself. `swaps` maps those keys, as hex, to the code that yields them for the real intermediary.
function dataCode({ idl, ixName, args, accounts, amountArg }: RecipeStep, swaps: Map<string, string>): string {
  const encode = (values: Record<string, unknown>) => buildInstruction(idl, ixName, values, accounts).data;
  const spans: { start: number; end: number; code: string }[] = [];
  let data: Buffer;
  if (amountArg === undefined) {
    data = encode(args);
  } else {
    const field = argFields(idl, ixName).find(f => f.name === amountArg);
    if (field?.kind !== 'int' || field.min !== '0') throw new Error(`${ixName}: amountArg "${amountArg}" is not an unsigned integer argument`);
    const seeds = flatten(findInstruction(idl, ixName).accounts).flatMap(({ account: { pda } }) => (pda ? [...pda.seeds, pda.program] : []));
    if (seeds.some(seed => seed?.kind === 'arg' && seed.path === amountArg)) throw new Error(`${ixName}: amountArg "${amountArg}" also seeds an account, whose address could not follow the amount`);
    data = encode({ ...args, [amountArg]: '0' });
    const full = encode({ ...args, [amountArg]: field.max });
    const start = data.findIndex((byte, index) => byte !== full[index]);
    const width = Number(field.type.slice(1)) / 8;
    spans.push({ start, end: start + width, code: `le(amount, ${width})` });
  }
  for (const [hex, code] of swaps) {
    const key = Buffer.from(hex, 'hex');
    for (let at = data.indexOf(key); at !== -1; at = data.indexOf(key, at + key.length)) spans.push({ start: at, end: at + key.length, code });
  }

  const part = (bytes: Buffer) => `hex(${literal(bytes.toString('hex'))})`;
  if (!spans.length) return part(data);
  const parts: string[] = [];
  let done = 0;
  for (const { start, end, code } of spans.sort((a, b) => a.start - b.start)) {
    parts.push(part(data.subarray(done, start)), code);
    done = end;
  }
  return `Buffer.concat([${[...parts, part(data.subarray(done))].join(', ')}])`;
}

/**
 * The steps as a TypeScript module exporting a SolanaRecipe. Frozen steps would not do: the amount is only exact when
 * buildSteps runs (threeRound), and every PDA or ATA derived from the intermediary differs per user. Those are written
 * as code; everything else is a literal, and the result needs only the Aurora SDK, web3.js and a global Buffer.
 */
export function toRecipeCode(steps: readonly RecipeStep[], meta: RecipeMeta): string {
  if (!steps.length) throw new Error('A recipe needs at least one step');
  const intermediary = new PublicKey(meta.intermediary).toBase58();
  const intermediaryHex = new PublicKey(intermediary).toBuffer().toString('hex');

  const derivedCode = (derived: Derived): string => {
    const seeds = derived.seeds.map(seed => {
      if (typeof seed !== 'string') return `key(${derivedCode(seed)})`;
      return seed === intermediaryHex ? 'key(intermediary)' : `hex(${literal(seed)})`;
    });
    return `pda(${literal(derived.program)}, [${seeds.join(', ')}])`;
  };

  // A row whose pubkey was replaced is what got simulated, so `derived` no longer speaks for it.
  const followsIntermediary = ({ pubkey, derived }: RecipeStep['accounts'][number]) =>
    derived && derived.address === pubkey?.toString() && JSON.stringify(derived).includes(intermediaryHex) ? derived : undefined;

  const swaps = new Map([[intermediaryHex, 'key(intermediary)']]);
  for (const row of steps.flatMap(step => step.accounts)) {
    const derived = followsIntermediary(row);
    if (derived) swaps.set(new PublicKey(derived.address).toBuffer().toString('hex'), `key(${derivedCode(derived)})`);
  }

  const instructions = steps.map(step => {
    const data = dataCode(step, swaps); // first, because encoding is what refuses incomplete accounts by name
    const keys = step.accounts.map((row, index) => {
      const { isSigner, isWritable } = row;
      const address = new PublicKey(row.pubkey!).toBase58();
      const name = row.name ?? `remaining_${index}`;
      if (isSigner && address !== intermediary) throw new Error(`${step.ixName}: ${name} signs but is not the intermediary, the only signer Connect allows`);
      const derived = followsIntermediary(row);
      const code = address === intermediary ? 'intermediary' : derived ? derivedCode(derived) : literal(address);
      return `            account(${code}, ${isSigner}, ${isWritable}), ${comment(name)}`;
    });
    return [
      `        ${comment(step.ixName)}`,
      `        new TransactionInstruction({`,
      `          programId: new PublicKey(${literal(new PublicKey(step.idl.address).toBase58())}),`,
      `          data: ${data},`,
      `          keys: [`,
      ...keys,
      `          ],`,
      `        }),`,
    ].join('\n');
  });

  const options = meta.lookupTables?.length ? `{ intermediary, addressLookupTables: ${literal(meta.lookupTables)} }` : '{ intermediary }';
  const recipe = `export const recipe: SolanaRecipe = {
  id: ${literal(meta.id)},
  intent: ${literal(meta.intent)},
  title: ${literal(meta.title)},
  type: 'solana',
  flow: ${literal(meta.flow ?? 'bridge-in')},
  destination: ${literal(meta.destination)},
  buildSteps: ({ intermediary${steps.some(step => step.amountArg !== undefined) ? ', amount' : ''} }) =>
    prepareSolanaSteps(
      [
${instructions.join('\n')}
      ],
      ${options},
    ),
};
`;
  const helpers = Object.entries(HELPERS).filter(([name]) => recipe.includes(`${name}(`)).map(([, code]) => code);
  return `import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import { prepareSolanaSteps } from '@aurora-is-near/intents-connect-wallet/solana';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

${helpers.join('\n')}

${recipe}`;
}
