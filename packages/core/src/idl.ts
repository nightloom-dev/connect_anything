import { Program, type Idl } from '@coral-xyz/anchor';
import type { Connection } from '@solana/web3.js';

export type IdlInstruction = Idl['instructions'][number];
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

const label = (idl: RawIdl) => `${idl.name ?? idl.metadata?.name ?? 'unnamed'} ${idl.version ?? idl.metadata?.version ?? ''}`.trim();

// Anchor's converter refuses a legacy IDL without the program id in metadata.address.
const withProgramId = (idl: RawIdl, programId: string) => ({ ...idl, metadata: { ...idl.metadata, address: programId } });

export async function loadIdl(programId: string, connection: Connection): Promise<Idl> {
  const json = await Program.fetchIdl(programId, { connection });
  if (!json) throw new Error(`Program ${programId} has no Anchor IDL account. Upload its IDL file instead.`);
  const idl = asRawIdl(json);
  if (!isModern(idl)) {
    throw new LegacyIdlError(
      `The on-chain IDL of ${programId} (${label(idl)}) is in the legacy pre-0.30 format. ` +
        'Pass error.idl to parseIdl to convert it through the /idl/convert service.',
      withProgramId(idl, programId),
    );
  }
  // Instructions and PDAs must target the program that was asked for, even if a fork kept another address in its IDL.
  return { ...idl, address: programId } as unknown as Idl;
}

export type ParseOptions = {
  /** Base URL of the service with POST /idl/convert. Defaults to the SIM_URL environment variable. */
  convertUrl?: string;
  headers?: Record<string, string>;
  /** Needed to convert a legacy file that has no metadata.address of its own. */
  programId?: string;
};

export async function parseIdl(json: unknown, options: ParseOptions = {}): Promise<Idl> {
  const idl = asRawIdl(typeof json === 'string' ? JSON.parse(json) : json);
  if (isModern(idl)) return idl as unknown as Idl;

  const url = options.convertUrl ?? globalThis.process?.env?.SIM_URL;
  if (!url) {
    throw new LegacyIdlError(`IDL ${label(idl)} is in the legacy pre-0.30 format and no converter is set: pass convertUrl or set SIM_URL.`, idl);
  }
  const response = await fetch(`${url.replace(/\/$/, '')}/idl/convert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify(options.programId ? withProgramId(idl, options.programId) : idl),
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
