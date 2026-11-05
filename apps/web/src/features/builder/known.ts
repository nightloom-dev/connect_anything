/** An address to fill in with one click, and what it is. */
export type QuickPick = { label: string; address: string };

export const KNOWN: QuickPick[] = [
  { label: 'System', address: '11111111111111111111111111111111' },
  { label: 'Token', address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
  { label: 'Token-2022', address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
  { label: 'Associated Token', address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' },
  { label: 'Sysvar Instructions', address: 'Sysvar1nstructions1111111111111111111111111' },
  { label: 'Rent', address: 'SysvarRent111111111111111111111111111111111' },
  { label: 'Clock', address: 'SysvarC1ock11111111111111111111111111111111' },
];

const pick = (...labels: string[]) => KNOWN.filter(known => labels.includes(known.label));

/**
 * The known addresses an account's name points at, to offer first. Only a suggestion: the person picks, and the
 * simulation checks. A mint is offered as the token the recipe receives, the one mint this page knows.
 */
export function suggestionsFor(name: string, mint?: QuickPick): QuickPick[] {
  const last = name.split('.').pop()!.toLowerCase();
  if (/associated_token_program|^ata_program$/.test(last)) return pick('Associated Token');
  if (/^token(_[a-z0-9]+)?_program$|^token_program(_[a-z0-9]+)?$/.test(last)) return pick('Token', 'Token-2022');
  if (/^system_program$|^system$/.test(last)) return pick('System');
  if (/instructions?_sysvar|sysvar_instructions?|^instructions?$/.test(last)) return pick('Sysvar Instructions');
  if (/^rent(_sysvar)?$|^sysvar_rent$/.test(last)) return pick('Rent');
  if (/^clock(_sysvar)?$|^sysvar_clock$/.test(last)) return pick('Clock');
  if (mint && /(^|_)mint(_[a-z0-9]+)?$/.test(last)) return [mint];
  return [];
}
