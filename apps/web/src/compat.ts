import type { Idl } from '@connect-anything/core';

export type CompatIssue = { account?: string; reason: string };

// The one seam for role R's checkCompat: its packages/core/src/compat.ts replaces this function, same signature.
export function checkCompat(_idl: Idl, _ixName: string): CompatIssue[] {
  return [];
}

export const issueText = ({ account, reason }: CompatIssue) => (account ? `${account}: ${reason}` : reason);
