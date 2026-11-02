import type { CompatIssue } from '@connect-anything/core';

// Role R's checkCompat from packages/core, behind the seam the web was built on. An empty list now means checked and fine.
export { checkCompat, type CompatIssue } from '@connect-anything/core';
export const issueText = ({ account, reason }: CompatIssue) => (account ? `${account}: ${reason}` : reason);
