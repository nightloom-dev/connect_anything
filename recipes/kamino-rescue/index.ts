import type { Idl } from '@connect-anything/core';
import { PublicKey } from '@solana/web3.js';
import modern from './klend.idl.json' with { type: 'json' };

export const KLEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
export const FARMS = 'FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr';
const REPAY = 'repay_obligation_liquidity_v2';

const seedText = (text: string) => ({ kind: 'const', value: [...Buffer.from(text)] });

// No klend IDL anywhere has seeds or fixed addresses: the on-chain one has none and conversion cannot add them. These
// come from the public klend source (handler_repay_obligation_liquidity.rs, seeds.rs), and the comparisons with real
// transactions in the tests are what prove them. Without them these accounts stay form inputs.
const REPAY_NOTES: Record<string, object> = {
  lending_market_authority: { pda: { seeds: [seedText('lma'), { kind: 'account', path: 'repay_accounts.lending_market' }] } },
  'repay_accounts.instruction_sysvar_account': { address: 'Sysvar1nstructions1111111111111111111111111' },
  'farms_accounts.obligation_farm_user_state': {
    pda: {
      seeds: [seedText('user'), { kind: 'account', path: 'reserve_farm_state' }, { kind: 'account', path: 'repay_accounts.obligation' }],
      program: { kind: 'const', value: [...new PublicKey(FARMS).toBuffer()] },
    },
  },
  farms_program: { address: FARMS },
};

function annotated(idl: Idl, ixName: string, notes: Record<string, object>): Idl {
  const copy = structuredClone(idl);
  const visit = (items: any[], prefix: string) => {
    for (const item of items) {
      if (item.accounts) visit(item.accounts, `${prefix}${item.name}.`);
      else Object.assign(item, notes[`${prefix}${item.name}`]);
    }
  };
  visit(copy.instructions.find(ix => ix.name === ixName)!.accounts, '');
  return copy;
}

/** The modern klend IDL with what a repay needs written into it. */
export const KLEND_IDL = annotated(modern as unknown as Idl, REPAY, REPAY_NOTES);
