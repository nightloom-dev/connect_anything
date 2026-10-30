import { BorshInstructionCoder, Program, type Idl } from '@coral-xyz/anchor';
import { PublicKey, TransactionInstruction, type Connection } from '@solana/web3.js';
import BN from 'bn.js';

export type IdlInstruction = Idl['instructions'][number];
type IdlType = IdlInstruction['args'][number]['type'];
type IdlDefinedFields = Extract<NonNullable<Idl['types']>[number]['type'], { kind: 'struct' }>['fields'];
type IdlAccountItem = IdlInstruction['accounts'][number];
export type IdlAccount = Exclude<IdlAccountItem, { accounts: unknown }>;

export type FlatAccount = { path: string; scope: string[]; account: IdlAccount };

// Account groups exist only in the IDL: on the wire they are one ordered list.
export function flatten(items: readonly IdlAccountItem[], scope: string[] = []): FlatAccount[] {
  return items.flatMap(item =>
    'accounts' in item
      ? flatten(item.accounts, [...scope, item.name])
      : [{ path: [...scope, item.name].join('.'), scope, account: item }],
  );
}

export function findInstruction(idl: Idl, name: string): IdlInstruction {
  const ix = idl.instructions.find(i => i.name === name);
  if (!ix) throw new Error(`Instruction "${name}" is not in the IDL of ${idl.address}`);
  return ix;
}

/** A pre-0.30 IDL: nothing here can read it until the converter has. `idl` is what to pass to parseIdl. */
export class LegacyIdlError extends Error {
  readonly idl: unknown;
  constructor(message: string, idl: unknown) {
    super(message);
    this.name = 'LegacyIdlError';
    this.idl = idl;
  }
}

type RawIdl = Record<string, any> & { instructions: any[] };

function asRawIdl(json: unknown): RawIdl {
  const idl = json as RawIdl | null;
  if (typeof idl !== 'object' || idl === null || !Array.isArray(idl.instructions)) {
    throw new Error('Not an Anchor IDL: there is no instructions array');
  }
  return idl;
}

// 0.30+ has the program address at the root and a discriminator on every instruction.
const isModern = (idl: RawIdl) =>
  typeof idl.address === 'string' && idl.address !== '' && idl.instructions.every(ix => Array.isArray(ix.discriminator));

const label = (idl: RawIdl) =>
  [idl.name ?? idl.metadata?.name ?? 'unnamed', idl.version ?? idl.metadata?.version, idl.metadata?.address && `of ${idl.metadata.address}`].filter(Boolean).join(' ');

// Anchor's converter refuses a legacy IDL without the program id in metadata.address.
const withProgramId = (idl: RawIdl, programId: string) => ({ ...idl, metadata: { ...idl.metadata, address: programId } });

// Instructions and PDAs must target the program that was asked for, even if a fork kept another address in its IDL:
// at the root, on its own accounts (the `program` of an event CPI) and as a const seed or PDA program.
function retarget(idl: RawIdl, programId: string): RawIdl {
  if (idl.address === programId) return idl;
  const newBytes = [...new PublicKey(programId).toBytes()];
  return JSON.parse(
    JSON.stringify(idl, (key, value) => {
      if (key === 'address' && value === idl.address) return programId;
      const isOldBytes = key === 'value' && Array.isArray(value) && value.length === 32 && new PublicKey(value).toBase58() === idl.address;
      return isOldBytes ? newBytes : value;
    }),
  );
}

export type ParseOptions = {
  /** Base URL of the service with POST /idl/convert. Defaults to the SIM_URL environment variable. */
  convertUrl?: string;
  headers?: Record<string, string>;
  /** The program this IDL is for: it replaces the address a modern file carries, and a legacy file needs it unless it has metadata.address. */
  programId?: string;
};

/** A legacy on-chain IDL goes through the converter like a legacy file, and without one throws LegacyIdlError. */
export async function loadIdl(programId: string, connection: Connection, options: ParseOptions = {}): Promise<Idl> {
  const json = await Program.fetchIdl(programId, { connection });
  if (!json) throw new Error(`Program ${programId} has no Anchor IDL account. Upload its IDL file instead.`);
  return parseIdl(json, { ...options, programId });
}

export async function parseIdl(json: unknown, options: ParseOptions = {}): Promise<Idl> {
  const parsed = asRawIdl(typeof json === 'string' ? JSON.parse(json) : json);
  if (isModern(parsed)) return (options.programId ? retarget(parsed, options.programId) : parsed) as unknown as Idl;
  const idl = options.programId ? withProgramId(parsed, options.programId) : parsed;

  const url = options.convertUrl ?? globalThis.process?.env?.SIM_URL;
  if (!url) {
    throw new LegacyIdlError(`IDL ${label(idl)} is in the legacy pre-0.30 format and no converter is set: pass convertUrl or set SIM_URL.`, idl);
  }
  const response = await fetch(`${url.replace(/\/$/, '')}/idl/convert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify(idl),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`The IDL converter answered ${response.status}: ${body?.message ?? 'no message'}`);
  const converted = asRawIdl(body);
  if (!isModern(converted)) throw new Error('The IDL converter answered with an IDL that is still not 0.30+');
  return converted as unknown as Idl;
}

export type IxInfo = { name: string; docs?: string[]; args: number; accounts: number };

export const listInstructions = (idl: Idl): IxInfo[] =>
  idl.instructions.map(ix => ({ name: ix.name, docs: ix.docs, args: ix.args.length, accounts: flatten(ix.accounts).length }));

/**
 * The form for one value, as data. What each kind takes from the form: int a decimal string or a number
 * (big ones become BN), float the same, bytes and u8 lists a hex string, an enum its variant name or
 * { Variant: { ...fields } }, an empty option null, a tuple its fields named "0", "1".
 */
export type FieldType =
  | { kind: 'int'; type: string; big: boolean; min: string; max: string }
  | { kind: 'float'; type: 'f32' | 'f64' }
  | { kind: 'bool' | 'pubkey' | 'string' | 'bytes' }
  | { kind: 'option' | 'vec'; of: FieldType }
  | { kind: 'array'; of: FieldType; len: number }
  | { kind: 'struct'; type?: string; fields: Field[] }
  | { kind: 'enum'; type?: string; variants: { name: string; fields: Field[] }[] };

export type Field = FieldType & { name: string; docs?: string[] };

function intField(type: string, sign: string, bits: bigint): FieldType {
  const signed = sign === 'i';
  return {
    kind: 'int',
    type,
    big: bits > 32n,
    min: (signed ? -(1n << (bits - 1n)) : 0n).toString(),
    max: ((1n << (signed ? bits - 1n : bits)) - 1n).toString(),
  };
}

// The largest arguments among 35 real mainnet IDLs expand to 260 nodes. A type used twice per level doubles per level,
// so a few KB of IDL could otherwise take a gigabyte to expand.
const MAX_TYPE_NODES = 10_000;

const definedFields = (idl: Idl, fields: IdlDefinedFields, seen: string[], budget: { left: number }): Field[] =>
  (fields ?? []).map((field, index) =>
    typeof field === 'object' && 'name' in field
      ? { ...fieldType(idl, field.type, seen, budget), name: field.name, docs: field.docs }
      : { ...fieldType(idl, field, seen, budget), name: String(index) },
  );

// ponytail: no generic types and no COption, none of the 8 modern mainnet IDLs surveyed uses them in arguments;
// BorshCoder has no COption layout at all. Both fail with a clear error, add generics when a program needs them.
export function fieldType(idl: Idl, type: IdlType, seen: string[] = [], budget = { left: MAX_TYPE_NODES }): FieldType {
  if (--budget.left < 0) throw new Error(`IDL type expands past ${MAX_TYPE_NODES} fields`);
  if (typeof type === 'string') {
    const int = /^([ui])(8|16|32|64|128)$/.exec(type);
    if (int) return intField(type, int[1], BigInt(int[2]));
    if (type === 'f32' || type === 'f64') return { kind: 'float', type };
    if (type === 'bool' || type === 'pubkey' || type === 'string' || type === 'bytes') return { kind: type };
  } else if ('option' in type) {
    return { kind: 'option', of: fieldType(idl, type.option, seen, budget) };
  } else if ('vec' in type) {
    return { kind: 'vec', of: fieldType(idl, type.vec, seen, budget) };
  } else if ('array' in type && typeof type.array[1] === 'number') {
    return { kind: 'array', of: fieldType(idl, type.array[0], seen, budget), len: type.array[1] };
  } else if ('defined' in type) {
    const { name } = type.defined;
    if (seen.includes(name)) throw new Error(`Recursive IDL type ${name} is not supported`);
    const definition = idl.types?.find(t => t.name === name);
    if (!definition) throw new Error(`Type ${name} is missing from the IDL`);
    if (definition.generics?.length || type.defined.generics?.length) throw new Error(`Generic IDL type ${name} is not supported`);
    const inner = [...seen, name];
    if (definition.type.kind === 'struct') return { kind: 'struct', type: name, fields: definedFields(idl, definition.type.fields, inner, budget) };
    if (definition.type.kind === 'enum') {
      const variants = definition.type.variants.map(v => ({ name: v.name, fields: definedFields(idl, v.fields, inner, budget) }));
      return { kind: 'enum', type: name, variants };
    }
    return fieldType(idl, definition.type.alias, inner, budget);
  }
  throw new Error(`Unsupported IDL type ${JSON.stringify(type)}`);
}

export function argFields(idl: Idl, ixName: string): Field[] {
  const budget = { left: MAX_TYPE_NODES };
  return findInstruction(idl, ixName).args.map(arg => ({ ...fieldType(idl, arg.type, [], budget), name: arg.name, docs: arg.docs }));
}

function toBigInt(value: unknown): bigint | null {
  if (BN.isBN(value)) return BigInt(value.toString());
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  // BigInt('') is 0n, and a blank amount must not become zero.
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

function toBytes(value: unknown): Buffer | null {
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return value.every(b => Number.isInteger(b) && b >= 0 && b <= 255) ? Buffer.from(value) : null;
  if (typeof value !== 'string') return null;
  const hex = value.replace(/^0x/, '');
  return hex.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

const isByte = (type: FieldType) => type.kind === 'int' && type.type === 'u8';

/**
 * Checks a form value and shapes it for the coder. The layouts cannot be left to catch this: they encode a negative
 * u64 as its magnitude, the string 'false' as true and an array of the wrong length without complaint.
 */
export function coerce(type: FieldType, value: unknown, path: string): unknown {
  const invalid = (why: string) => new Error(`${path}: ${why}`);
  if (value === undefined && type.kind !== 'option') throw invalid('missing');

  switch (type.kind) {
    case 'int': {
      const int = toBigInt(value);
      if (int === null) throw invalid(`not an integer: ${String(value)}`);
      if (int < BigInt(type.min) || int > BigInt(type.max)) throw invalid(`${int} is out of range for ${type.type}`);
      return type.big ? new BN(int.toString()) : Number(int);
    }
    case 'float': {
      // Number() also reads '0x10', and a double past the f32 range would go on the wire as infinity.
      const float = typeof value === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : value;
      if (typeof float !== 'number' || !Number.isFinite(float)) throw invalid(`not a number: ${String(value)}`);
      if (type.type === 'f32' && !Number.isFinite(Math.fround(float))) throw invalid(`${float} is out of range for f32`);
      return float;
    }
    case 'bool':
      if (typeof value !== 'boolean') throw invalid(`not a boolean: ${String(value)}`);
      return value;
    case 'pubkey':
      try {
        return new PublicKey(String(value));
      } catch {
        throw invalid(`not a public key: ${String(value)}`);
      }
    case 'string':
      if (typeof value !== 'string') throw invalid('not a string');
      return value;
    case 'bytes': {
      const bytes = toBytes(value);
      if (!bytes) throw invalid('not hex or bytes');
      return bytes;
    }
    case 'option':
      return value === null || value === undefined ? null : coerce(type.of, value, path);
    case 'vec':
    case 'array': {
      const list = isByte(type.of) && !Array.isArray(value) ? toBytes(value) : value;
      if (list === null) throw invalid('not hex or bytes');
      if (!Array.isArray(list) && !Buffer.isBuffer(list)) throw invalid('not a list');
      if (type.kind === 'array' && list.length !== type.len) throw invalid(`expected ${type.len} items, got ${list.length}`);
      return Array.from(list, (item, index) => coerce(type.of, item, `${path}[${index}]`));
    }
    case 'struct': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid('not an object');
      const object = value as Record<string, unknown>;
      const stranger = Object.keys(object).find(key => !type.fields.some(f => f.name === key));
      if (stranger !== undefined) throw invalid(`unknown field "${stranger}"`);
      return Object.fromEntries(type.fields.map(f => [f.name, coerce(f, Object.hasOwn(object, f.name) ? object[f.name] : undefined, `${path}.${f.name}`)]));
    }
    case 'enum': {
      const isName = typeof value === 'string';
      const keys = isName ? [value] : typeof value === 'object' && value !== null ? Object.keys(value) : [];
      const variant = keys.length === 1 ? type.variants.find(v => v.name === keys[0]) : undefined;
      if (!variant) throw invalid(`not a variant of ${type.type ?? 'the enum'}`);
      const inner = isName ? {} : ((value as Record<string, unknown>)[variant.name] ?? {});
      return { [variant.name]: coerce({ kind: 'struct', fields: variant.fields }, inner, `${path}.${variant.name}`) };
    }
  }
}

export type AccountInput = { pubkey: string | PublicKey | null; isSigner: boolean; isWritable: boolean };

/** `accounts` follow the IDL order, as resolveAccounts returns them; any extra ones go last as remaining accounts. */
export function buildInstruction(idl: Idl, ixName: string, args: Record<string, unknown>, accounts: readonly AccountInput[]): TransactionInstruction {
  const ix = findInstruction(idl, ixName);
  const names = flatten(ix.accounts).map(account => account.path);
  if (accounts.length < names.length) throw new Error(`${ixName}: expected ${names.length} accounts, got ${accounts.length}`);
  const missing = accounts.flatMap((account, index) => (account.pubkey ? [] : [names[index] ?? `remaining account ${index - names.length}`]));
  if (missing.length) throw new Error(`${ixName}: no address for ${missing.join(', ')}`);

  const values = coerce({ kind: 'struct', fields: argFields(idl, ixName) }, args, ixName);
  return new TransactionInstruction({
    programId: new PublicKey(idl.address),
    keys: accounts.map(({ pubkey, isSigner, isWritable }) => ({ pubkey: new PublicKey(pubkey!), isSigner, isWritable })),
    data: encodeArgs(idl, ix, values),
  });
}

// buffer-layout's Structure.encode answers (last offset + last written) - first offset, which for a struct with no
// fields is minus its own offset, and whatever holds that struct then loses bytes. A zero-length field makes it 0.
const ZERO_SIZED: Extract<NonNullable<Idl['types']>[number]['type'], { kind: 'struct' }> = { kind: 'struct', fields: [{ name: 'empty', type: { array: ['u8', 0] } }] };

function encodeArgs(idl: Idl, ix: IdlInstruction, values: unknown): Buffer {
  const types = idl.types?.map(t => (t.type.kind === 'struct' && !t.type.fields?.length ? { ...t, type: ZERO_SIZED } : t));
  try {
    // BorshCoder's own instruction half. The whole BorshCoder also builds every account, event and type layout up
    // front, so one unsupported type anywhere in a program would break forms that never touch it.
    return new BorshInstructionCoder({ ...idl, instructions: [ix], types }).encode(ix.name, values);
  } catch (error) {
    // ponytail: the coder allocates 1000 bytes, and a transaction could carry about 1014 of arguments. Encode through
    // IdlCoder.fieldLayout in a bigger buffer if a program ever needs those last bytes.
    if (error instanceof RangeError) throw new Error(`${ix.name}: arguments exceed the 1000 bytes the Anchor coder allocates`);
    throw error;
  }
}
