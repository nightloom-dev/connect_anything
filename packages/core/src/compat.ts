import type { Idl } from '@coral-xyz/anchor';
import { flatten, type FlatAccount } from './idl.ts';

/** Why Connect cannot run an instruction, and the account at fault if there is one. */
export type CompatIssue = { account?: string; reason: string };

// What a wallet fills: one key can sign as all of these at once, so a payer and an owner that both sign are both the intermediary.
const WALLET =
  /(?:^|_)(?:payer|funder|user|owner|authority|signer|admin|creator|sender|receiver|recipient|maker|taker|trader|depositor|withdrawer|borrower|lender|liquidator|delegate|operator|initializer|buyer|seller|staker|voter|wallet|manager|claimant|beneficiary)$/;

const ONLY_INTERMEDIARY = 'and Connect signs only as the intermediary';

/**
 * Whether Connect can run this instruction, by its IDL alone. Connect signs as the intermediary and nothing else, so
 * every account that signs has to be the intermediary. [] means nothing in the IDL stands in the way. The simulation
 * checks the rest, such as a compute budget instruction or an account the intermediary would pay for.
 *
 * An IDL does not mark `init`, so a new keypair account is inferred: a writable signer that is not a PDA and is not
 * named like a wallet. An optional signer can be left out of the recipe, so it is never an issue.
 */
export function checkCompat(idl: Idl, ixName: string): CompatIssue[] {
  const ix = idl.instructions.find(i => i.name === ixName);
  if (!ix) return [{ reason: `${ixName} is not an instruction of program ${idl.address}` }];

  const issues: CompatIssue[] = [];
  const open: FlatAccount[] = [];
  for (const flat of flatten(ix.accounts)) {
    const { path, account } = flat;
    if (!account.signer || account.optional) continue;
    if (account.pda) issues.push({ account: path, reason: `a PDA has to sign, which only a program that calls this one can do, ${ONLY_INTERMEDIARY}` });
    else if (account.address) issues.push({ account: path, reason: `only ${account.address} can sign, ${ONLY_INTERMEDIARY}` });
    else open.push(flat);
  }

  // One signer is the intermediary whatever its name. Of several, those named like a wallet are, or else the first.
  const wallets = open.filter(({ account }) => WALLET.test(account.name));
  const intermediary = new Set(open.length < 2 ? open : wallets.length ? wallets : open.slice(0, 1));
  for (const flat of open.filter(flat => !intermediary.has(flat))) {
    issues.push(
      flat.account.writable
        ? { account: flat.path, reason: `creating a keypair account is not supported: the new account would have to sign, ${ONLY_INTERMEDIARY} (inferred from the IDL: a writable signer that is not a PDA)` }
        : { account: flat.path, reason: `a second signer, ${ONLY_INTERMEDIARY}` },
    );
  }
  return issues;
}
