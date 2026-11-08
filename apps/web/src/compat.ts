import type { CompatIssue } from '@connect-anything/core';

// The compatibility check of packages/core. An empty list means the step was checked and can run through Connect.
export { checkCompat, type CompatIssue } from '@connect-anything/core';
export const issueText = ({ account, reason }: CompatIssue) => (account ? `${account}: ${reason}` : reason);
