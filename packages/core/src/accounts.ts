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
  /** The funded token, for the one token account of the intermediary that the instruction's mints leave without one. */
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

function keyOrNull(value: unknown): string | null {
  try {
    return new PublicKey(String(value)).toBase58();
  } catch {
    return null;
  }
}

function checkedKey(value: unknown, what: string): string {
  const key = keyOrNull(value);
  if (!key) throw new Error(`${what}: not a public key: ${String(value)}`);
  return key;
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

// Known limit: an IDL does not say which accounts hold tokens, so the intermediary's token account is recognized by its
// name and its mint and token program by the words the names share. Names that leave more than one answer get none and
// stay open. A wrong answer shows as auto and fails simulation, and a hint or input corrects it. Replace with a real
// marker if IDLs ever carry one.
const OWN_TOKEN_ACCOUNT =
  /^(?:token_owner_account(?:_.+)?|(?:input|output)_token_account|(?:user|owner|payer|signer|funder|authority|wallet)_(?!.*vault)(?:.*_)?(?:tokens?(?:_(?:account|[abxy]))?|ata(?:_acc)?|ta|liquidity|collateral|source|destination|in|out))$/;
const OUTGOING = /(?:^|_)(?:destination|out|output)(?:_|$)/;
const INCOMING = /(?:^|_)(?:source|in|input)(?:_|$)/;
const MINT = /(?:^|_)mint(?:_(?:[a-z0-9]|input|intermediate|output))?$/;
const TOKEN_PROGRAM = /^(?!associated)(?!.*metadata).*token.*program/;
const FILLER = new Set(['user', 'owner', 'payer', 'signer', 'funder', 'authority', 'wallet', 'token', 'tokens', 'account', 'ata', 'ta', 'mint', 'source', 'destination', 'in', 'out', 'input', 'output', 'reserve', 'program']);
const nameWords = (name: string) => name.split('_').filter(word => !FILLER.has(word));

// By full path or by plain name. hasOwn, because an IDL can name an account anything, `constructor` included.
const entryFor = <T>(record: Record<string, T> | undefined, { path, account }: FlatAccount): T | undefined => {
  if (!record) return undefined;
  return Object.hasOwn(record, path) ? record[path] : Object.hasOwn(record, account.name) ? record[account.name] : undefined;
};

// The accounts that share the name's words and do not face the other way: those in the name's own group if there are any.
function siblings(accounts: FlatAccount[], pattern: RegExp, { scope, account: { name } }: FlatAccount): FlatAccount[] {
  const words = nameWords(name);
  const opposite = OUTGOING.test(name) ? INCOMING : INCOMING.test(name) ? OUTGOING : null;
  const fits = accounts.filter(({ account: other }) => {
    if (!pattern.test(other.name) || opposite?.test(other.name)) return false;
    const own = nameWords(other.name);
    return !words.length || !own.length || (own.length === words.length && own.every(word => words.includes(word)));
  });
  const near = fits.filter(other => other.scope.join() === scope.join());
  return near.length ? near : fits;
}

// The one sibling, if there is only one.
function sibling(accounts: FlatAccount[], pattern: RegExp, flat: FlatAccount): FlatAccount | undefined {
  const [only, more] = siblings(accounts, pattern, flat);
  return more ? undefined : only;
}

/**
 * Finds every account it can, in this order: signer is the intermediary; address in the IDL; pda from seeds; hints;
 * the form's input; the intermediary's token account by name and mint; and the `program` of an event CPI. It reads
 * nothing from chain, so a seed that is a field inside account data (`pool.creator`) falls through to hints, and
 * `relations` are not followed. An input that is not a key yet counts as not filled in.
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
    for (let depth = scope.length; depth >= 0; depth--) {
      const account = byPath.get([...scope.slice(0, depth), path].join('.'));
      if (account) return account;
    }
    return undefined;
  };

  const accountSeed = (account: FlatAccount | undefined): SeedValue | null => {
    if (!account) return null;
    const { pubkey, derived } = resolve(account);
    return pubkey && (derived ?? keyHex(pubkey));
  };

  const seedValue = (seed: Seed, scope: string[]): SeedValue | null => {
    if (seed.kind === 'const') return Buffer.from(seed.value).toString('hex');
    if (seed.kind === 'arg') return argSeed(idl, ix, args, seed.path);
    return accountSeed(lookup(seed.path, scope));
  };

  const pda = (spec: Pda, scope: string[]): Derived | null => {
    const seeds = spec.seeds.map(seed => seedValue(seed, scope));
    const program = spec.program ? seedValue(spec.program, scope) : keyHex(idl.address);
    return program === null || seeds.includes(null) ? null : derive(program, seeds as SeedValue[]);
  };

  // `owner_token_x` next to an `owner` who does not sign belongs to that owner, not to the intermediary.
  const isOwnTokenAccount = ({ account: { name, signer, address, pda: seeds } }: FlatAccount) =>
    OWN_TOKEN_ACCOUNT.test(name) && !signer && !address && !seeds && !accounts.some(({ account }) => account.name === name.split('_')[0] && !account.signer);

  // The funded mint is what the intermediary holds, so it says nothing about where an output goes or which side of a
  // pair a name picks (`_a`, `_base_`), and it can only be the mint of one account.
  const wantsFundedMint = (flat: FlatAccount) =>
    isOwnTokenAccount(flat) &&
    !OUTGOING.test(flat.account.name) &&
    nameWords(flat.account.name).every(word => word === 'liquidity' || word === 'collateral') &&
    !accountSeed(sibling(accounts, MINT, flat));

  // `user_token_out` between two mints, one of them the funded mint: a swap pays out the other one.
  const otherOfPair = (flat: FlatAccount): SeedValue | null => {
    if (!fundedMint || !OUTGOING.test(flat.account.name)) return null;
    const pair = siblings(accounts, MINT, flat).map(accountSeed);
    if (pair.length !== 2) return null;
    const [a, b] = pair;
    return a === fundedMint && b !== fundedMint ? b : b === fundedMint && a !== fundedMint ? a : null;
  };

  const ownTokenAccount = (flat: FlatAccount): Derived | null => {
    if (!isOwnTokenAccount(flat)) return null;
    const funded = fundedMint ? accounts.filter(wantsFundedMint) : [];
    const mint = accountSeed(sibling(accounts, MINT, flat)) ?? (funded.length === 1 && funded[0] === flat ? fundedMint : null) ?? otherOfPair(flat);
    if (!mint) return null;
    // `user_token_in` next to token_x_program and token_y_program: the mint it turned out to hold says which side it is.
    const held = accounts.find(other => MINT.test(other.account.name) && accountSeed(other) === mint);
    const tokenProgram = sibling(accounts, TOKEN_PROGRAM, flat) ?? (held && sibling(accounts, TOKEN_PROGRAM, held));
    if (!tokenProgram && accounts.some(({ account }) => TOKEN_PROGRAM.test(account.name))) return null; // its ATA depends on which one
    // An unresolved token program means the classic one until the form says otherwise.
    return derive(keyHex(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()), [keyHex(intermediary), accountSeed(tokenProgram) ?? keyHex(TOKEN_PROGRAM_ID.toBase58()), mint]);
  };

  const find = (flat: FlatAccount): Found => {
    const { path, scope, account } = flat;
    const hint = entryFor(hints, flat);
    if (account.optional && hint === null) return { pubkey: null, source: 'recipe' };
    if (account.signer) return { pubkey: intermediary, source: 'auto' };
    if (account.address) return { pubkey: checkedKey(account.address, path), source: 'auto' };
    const stated = account.pda && pda(account.pda, scope);
    if (stated) return { pubkey: stated.address, source: 'auto', derived: stated };
    if (hint) return { pubkey: checkedKey(hint, path), source: 'recipe' };
    const input = keyOrNull(entryFor(ctx.inputs, flat) ?? '');
    if (input) return { pubkey: input, source: 'input' };
    // Last of what can be known: a name is a guess, so whatever was stated above corrects it.
    const guessed = ownTokenAccount(flat);
    if (guessed) return { pubkey: guessed.address, source: 'auto', derived: guessed };
    // Anchor's #[event_cpi] appends event_authority and the program itself, and the IDL often gives the latter no address.
    if (account.name === 'program' && accounts.some(({ account: other }) => other.name === 'event_authority')) return { pubkey: idl.address, source: 'auto' };
    return { pubkey: null, source: 'input' };
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
