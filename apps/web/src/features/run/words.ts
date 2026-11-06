import type { ExecutionStatus } from '@aurora-is-near/intents-connect';
import type { UseExecutionResult } from '@aurora-is-near/intents-connect/react';

// What the run card says, kept apart so that the /dev/states gallery shows the same words.

export const TIME_NOTE = 'After the deposit, execution takes about 150 seconds plus the MPC signature.';
export const CANCEL_NOTE = 'Cancelling only deletes the execution. It does not call back a deposit already sent, and this page stops following that deposit: if one is on its way, wait instead. If it reaches your intermediary, Refund here sends it back.';

export const PHASE_TEXT: Partial<Record<UseExecutionResult['phase'], string>> = {
  'resolving-identity': 'Looking up your intermediary…',
  planning: 'Working out the exact amounts…',
  creating: 'Creating the execution…',
  'awaiting-signature': 'Sign the message in your wallet.',
  submitting: 'Submitting your signature…',
  'awaiting-deposit': 'Confirm the deposit in your wallet.',
  settling: `Waiting for the bridge and the execution. ${TIME_NOTE}`,
  expired: 'The deposit window has passed. A late deposit can still revive this execution, or you can cancel it.',
  success: 'Done: the instructions ran on Solana.',
  cancelled: 'The execution was cancelled.',
};

/** The success of a Refund, whose steps send the intermediary's money back over the bridge and run nothing else. */
export const REFUND_DONE = 'Done: the Refund went through, and the money is sent back to your wallet.';

/** What each status of an execution means, in words. Its name as Connect writes it follows, small. */
export const STATUS_WORDS: Record<ExecutionStatus, string> = {
  CREATED: 'Created, not signed yet',
  DEPOSIT_PENDING: 'Waiting for the deposit',
  EXPIRED: 'Deposit window passed',
  DEPOSIT_PROCESSING: 'Crossing the bridge',
  OPERATION_PENDING: 'Waiting to run on Solana',
  OPERATION_PROCESSING: 'Running on Solana',
  SUCCESS: 'Done',
  DEPOSIT_FAILED: 'Deposit failed',
  OPERATION_FAILED: 'Failed on Solana',
};
/** The status in words once the signature is in, while the page still holds the CREATED it read before it. */
export const SIGNED_WAITING = 'Signed, waiting for the deposit';

/** What each stage is doing while it is the one in progress. */
export const DOING = ['One message in your wallet, no gas', 'Your transfer to the deposit address', 'The bridge delivers it to Solana', 'Your intermediary runs the instructions', ''];
/** The same for a Refund, which deposits nothing, runs its transfer on Solana and crosses the bridge last. */
export const REFUND_DOING = [DOING[0], '', 'The bridge delivers it to your wallet', 'Your intermediary sends it to the bridge', ''];

/** The line under the stage where a run broke. */
export const BROKE_NOTE = {
  deposit: 'The deposit failed, so nothing ran',
  instructions: 'The instructions failed on Solana',
  refund: 'The transfer back failed on Solana',
};
/** The line under the Result once the instructions failed: where the money is now. */
export const HELD_NOTE = { run: 'Money is with your intermediary', refund: 'Money is still with your intermediary' };
/**
 * Why the SDK refused to resume an unsigned execution. It signs one only once it has checked that the instructions spend no
 * more than the quote delivers, from the amount a create records in the execution's metadata, and says so as a moved quote.
 * By whether the execution has that record.
 */
export const REFUSED_RESUME = {
  elsewhere: 'It was made outside this app, without a record of what its instructions spend, so this page cannot check it before your wallet signs.',
  moved: 'Its instructions spend more than its quote delivers, so this page will not ask your wallet to sign it.',
};

/** What the quote button waits for, under it. */
export const QUOTING = 'Getting the exact amount and fee…';
/** What an execution left unsigned does to the next payment from the same wallet. */
export const BLOCKS_WALLET = 'It blocks new payments from this wallet until you delete it.';

/** What the intermediary is, where the card first names it. */
export const INTERMEDIARY_NOTE = 'A Solana account that Intents Connect controls for your EVM wallet. It runs the instructions, and what they do not spend stays there.';

/** The line under the Deposit of an execution past its window, which a late deposit still revives. */
export const LATE_NOTE = 'Waiting for a late deposit';
