import type { Idl } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { coerce, fieldType, findInstruction, flatten, type FieldType, type FlatAccount, type IdlAccount, type IdlInstruction } from './idl.ts';

export type AccountSource = 'auto' | 'recipe' | 'input';

/** How an address was derived, so an exported recipe can derive it again for another intermediary. A seed is hex bytes or another derived account. */
export type Derived = { address: string; program: string; seeds: (string | Derived)[] };

export type ResolvedAccount = {
  /** Path in the IDL: `name`, or `group.name` inside an account group. */
  name: string;
  /** null means the form has to ask for it. An absent optional account carries the program id, as Anchor expects. */
  pubkey: string | null;
  isSigner: boolean;
  isWritable: boolean;
  source: AccountSource;
  optional: boolean;
  docs?: string[];
  derived?: Derived;
};

export type ResolveContext = {
  /** A real key: the {INTERMEDIARY} placeholder comes later, from prepareSolanaSteps, and cannot seed a PDA. */
  intermediary: string;
  /** The funded token, for the intermediary's token account when the instruction names no mint. */
  mint?: string;
  /** What the form has collected so far, by account name or path. */
  inputs?: Record<string, string>;
};

/** What a recipe knows, by account name or path. null leaves an optional account out. */
export type AccountHints = Record<string, string | PublicKey | null>;

type Pda = NonNullable<IdlAccount['pda']>;
type Seed = Pda['seeds'][number];
type SeedValue = string | Derived;
type Found = { pubkey: string | null; source: AccountSource; derived?: Derived };

const keyHex = (key: string) => new PublicKey(key).toBuffer().toString('hex');

function checkedKey(value: unknown, what: string): string {
  try {
    return new PublicKey(String(value)).toBase58();
  } catch {
    throw new Error(`${what}: not a public key: ${String(value)}`);
  }
}

function derive(program: SeedValue, seeds: SeedValue[]): Derived | null {
  const bytes = (seed: SeedValue) => (typeof seed === 'string' ? Buffer.from(seed, 'hex') : new PublicKey(seed.address).toBuffer());
  try {
    const programId = new PublicKey(bytes(program));
    return { address: PublicKey.findProgramAddressSync(seeds.map(bytes), programId)[0].toBase58(), program: programId.toBase58(), seeds };
  } catch {
    return null; // a seed over 32 bytes, such as a string argument still being typed
  }
}

// The bytes a program feeds to its seeds, which are not Borsh: a string has no length prefix, an i64 is to_le_bytes().
function seedBytes(type: FieldType, value: unknown): Buffer | null {
  switch (type.kind) {
    case 'int': {
      const bits = Number(type.type.slice(1));
      return new BN(value as number).toTwos(bits).toArrayLike(Buffer, 'le', bits / 8);
    }
    case 'string':
      return Buffer.from(value as string);
    case 'pubkey':
      return (value as PublicKey).toBuffer();
    case 'bytes':
      return value as Buffer;
    case 'array':
      return type.of.kind === 'int' && type.of.type === 'u8' ? Buffer.from(value as number[]) : null;
    default:
      return null;
  }
}

function argSeed(idl: Idl, ix: IdlInstruction, args: Record<string, unknown>, path: string): string | null {
  try {
    const [head, ...rest] = path.split('.');
    let type = fieldType(idl, ix.args.find(arg => arg.name === head)!.type);
    let value = args[head];
    for (const part of rest) {
      if (type.kind !== 'struct') return null;
      type = type.fields.find(field => field.name === part)!;
      value = (value as Record<string, unknown>)[part];
    }
    return seedBytes(type, coerce(type, value, path))?.toString('hex') ?? null;
  } catch {
    return null; // not filled in yet: the account stays open until the form has the argument
  }
}

// ponytail: an IDL does not say which accounts hold tokens, so the intermediary's token account is recognized by its
// name and its mint and token program by the words the names share. A wrong guess shows as auto and fails simulation;
// a miss falls through to hints. Replace with a real marker if IDLs ever carry one.
const OWN_TOKEN_ACCOUNT =
  /^(?:token_owner_account|(?:user|owner|payer|signer|funder|authority|wallet)_(?!.*vault)(?:.*_)?(?:tokens?|ata|liquidity|collateral|source|destination|in|out)(?:_|$))/;
const OUTGOING = /(?:^|_)(?:destination|out)(?:_|$)/;
const MINT = /(?:^|_)mint(?:_|$)/;
const TOKEN_PROGRAM = /^(?!associated).*token.*program/;
const FILLER = new Set(['user', 'owner', 'payer', 'signer', 'funder', 'authority', 'wallet', 'token', 'tokens', 'account', 'ata', 'ta', 'mint', 'source', 'destination', 'in', 'out', 'reserve', 'program']);
const nameWords = (name: string) => name.split('_').filter(word => !FILLER.has(word));

function sibling(accounts: FlatAccount[], pattern: RegExp, words: string[]): FlatAccount | undefined {
  const fits = accounts.filter(({ account: { name } }) => {
    if (!pattern.test(name)) return false;
    const own = nameWords(name);
    return !words.length || !own.length || (own.length === words.length && own.every(word => words.includes(word)));
  });
  return fits.length === 1 ? fits[0] : undefined;
}

/**
 * Finds every account it can, in this order: signer is the intermediary; address in the IDL; pda from seeds; the
 * intermediary's token account by mint; hints; otherwise the form's input. It reads nothing from chain, so a seed that
 * is a field inside account data (`pool.creator`) falls through to hints, and `relations` are not followed.
 * An optional account that can be derived counts as present even if it does not exist yet; a null hint leaves it out.
 */
export function resolveAccounts(idl: Idl, ixName: string, args: Record<string, unknown>, ctx: ResolveContext, hints: AccountHints = {}): ResolvedAccount[] {
  const ix = findInstruction(idl, ixName);
  const accounts = flatten(ix.accounts);
  const byPath = new Map(accounts.map(account => [account.path, account]));
  const intermediary = checkedKey(ctx.intermediary, 'ctx.intermediary');
  const fundedMint = ctx.mint === undefined ? null : keyHex(checkedKey(ctx.mint, 'ctx.mint'));

  // A seed path is relative to its own group and may also start from any group around it.
  const lookup = (path: string, scope: string[]) => {
    const parts = path.split('.');
    for (let depth = scope.length; depth >= 0; depth--) {
      for (let end = parts.length; end > 0; end--) {
        const account = byPath.get([...scope.slice(0, depth), ...parts.slice(0, end)].join('.'));
        if (account) return { account, rest: parts.slice(end) };
      }
    }
    return null;
  };

  const accountSeed = (account: FlatAccount | undefined): SeedValue | null => {
    if (!account) return null;
    const { pubkey, derived } = resolve(account);
    return pubkey && (derived ?? keyHex(pubkey));
  };

  const seedValue = (seed: Seed, scope: string[]): SeedValue | null => {
    if (seed.kind === 'const') return Buffer.from(seed.value).toString('hex');
    if (seed.kind === 'arg') return argSeed(idl, ix, args, seed.path);
    const found = lookup(seed.path, scope);
    return found && !found.rest.length ? accountSeed(found.account) : null;
  };

  const pda = (spec: Pda, scope: string[]): Derived | null => {
    const seeds = spec.seeds.map(seed => seedValue(seed, scope));
    const program = spec.program ? seedValue(spec.program, scope) : keyHex(idl.address);
    return program === null || seeds.includes(null) ? null : derive(program, seeds as SeedValue[]);
  };

  const ownTokenAccount = ({ name }: IdlAccount): Derived | null => {
    if (!OWN_TOKEN_ACCOUNT.test(name)) return null;
    const words = nameWords(name);
    // The funded mint is what the intermediary holds, so it says nothing about where an output goes.
    const mint = accountSeed(sibling(accounts, MINT, words)) ?? (OUTGOING.test(name) ? null : fundedMint);
    if (!mint) return null;
    // An unresolved token program means the classic one until the form says otherwise.
    const tokenProgram = accountSeed(sibling(accounts, TOKEN_PROGRAM, words)) ?? keyHex(TOKEN_PROGRAM_ID.toBase58());
    return derive(keyHex(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()), [keyHex(intermediary), tokenProgram, mint]);
  };

  const find = ({ path, scope, account }: FlatAccount): Found => {
    const hint = path in hints ? hints[path] : hints[account.name];
    if (account.optional && hint === null) return { pubkey: null, source: 'recipe' };
    if (account.signer) return { pubkey: intermediary, source: 'auto' };
    if (account.address) return { pubkey: checkedKey(account.address, path), source: 'auto' };
    const derived = (account.pda ? pda(account.pda, scope) : null) ?? ownTokenAccount(account);
    if (derived) return { pubkey: derived.address, source: 'auto', derived };
    if (hint) return { pubkey: checkedKey(hint, path), source: 'recipe' };
    const input = ctx.inputs?.[path] ?? ctx.inputs?.[account.name];
    return { pubkey: input ? checkedKey(input, path) : null, source: 'input' };
  };

  const memo = new Map<FlatAccount, Found>();
  function resolve(account: FlatAccount): Found {
    const known = memo.get(account);
    if (known) return known;
    memo.set(account, { pubkey: null, source: 'input' }); // what a seed cycle reads, so it stays open instead of looping
    const found = find(account);
    memo.set(account, found);
    return found;
  }

  return accounts.map(flat => {
    const { pubkey, source, derived } = resolve(flat);
    const { signer, writable, optional, docs } = flat.account;
    const absent = !pubkey && !!optional;
    return {
      name: flat.path,
      pubkey: absent ? idl.address : pubkey,
      isSigner: !absent && !!signer,
      isWritable: !absent && !!writable,
      source,
      optional: !!optional,
      docs,
      derived,
    };
  });
}
