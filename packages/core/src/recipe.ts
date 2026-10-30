import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import type { Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import type { Derived } from './accounts.ts';
import { argFields, buildInstruction, type AccountInput } from './idl.ts';

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

function dataCode({ idl, ixName, args, accounts, amountArg }: RecipeStep): string {
  const encode = (values: Record<string, unknown>) => buildInstruction(idl, ixName, values, accounts).data;
  if (amountArg === undefined) return `hex(${literal(encode(args).toString('hex'))})`;

  const field = argFields(idl, ixName).find(f => f.name === amountArg);
  if (field?.kind !== 'int' || field.min !== '0') throw new Error(`${ixName}: amountArg "${amountArg}" is not an unsigned integer argument`);
  const zero = encode({ ...args, [amountArg]: '0' });
  const full = encode({ ...args, [amountArg]: field.max });
  const start = zero.findIndex((byte, index) => byte !== full[index]);
  const width = Number(field.type.slice(1)) / 8;
  const part = (bytes: Buffer) => `hex(${literal(bytes.toString('hex'))})`;
  return `Buffer.concat([${part(zero.subarray(0, start))}, le(amount, ${width}), ${part(zero.subarray(start + width))}])`;
}

/**
 * The steps as a TypeScript module exporting a SolanaRecipe. Frozen steps would not do: the amount is only exact when
 * buildSteps runs (threeRound), and every PDA or ATA derived from the intermediary differs per user. Those are written
 * as code; everything else is a literal, and the result needs only the Aurora SDK and web3.js.
 */
export function toRecipeCode(steps: readonly RecipeStep[], meta: RecipeMeta): string {
  const intermediary = new PublicKey(meta.intermediary).toBase58();
  const intermediaryHex = new PublicKey(intermediary).toBuffer().toString('hex');

  const derivedCode = (derived: Derived): string => {
    const seeds = derived.seeds.map(seed => {
      if (typeof seed !== 'string') return `key(${derivedCode(seed)})`;
      return seed === intermediaryHex ? 'key(intermediary)' : `hex(${literal(seed)})`;
    });
    return `pda(${literal(derived.program)}, [${seeds.join(', ')}])`;
  };

  const instructions = steps.map(step => {
    const data = dataCode(step); // first, because encoding is what refuses incomplete accounts by name
    const keys = step.accounts.map(({ name, pubkey, isSigner, isWritable, derived }, index) => {
      const address = new PublicKey(pubkey!).toBase58();
      const code =
        address === intermediary
          ? 'intermediary'
          : derived && JSON.stringify(derived).includes(intermediaryHex)
            ? derivedCode(derived)
            : literal(address);
      return `            account(${code}, ${isSigner}, ${isWritable}), ${comment(name ?? `remaining_${index}`)}`;
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
  buildSteps: ({ intermediary, amount }) =>
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
