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
/** The line under the Deposit of an execution past its window, which a late deposit still revives. */
export const LATE_NOTE = 'Waiting for a late deposit';
