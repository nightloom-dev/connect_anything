import type { SolanaRecipe } from '@aurora-is-near/intents-connect';
import { prepareSolanaSteps } from '@aurora-is-near/intents-connect-wallet/solana';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

const hex = (bytes: string) => Buffer.from(bytes, 'hex');
const key = (address: string) => new PublicKey(address).toBuffer();
const pda = (program: string, seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, new PublicKey(program))[0].toBase58();
const le = (amount: string, width: number) => {
  if (!/^\d+$/.test(amount) || BigInt(amount) >> BigInt(width * 8)) throw new Error(`Amount ${amount} does not fit ${width} bytes`);
  return Buffer.from(Array.from({ length: width }, (_, i) => Number((BigInt(amount) >> BigInt(8 * i)) & 255n)));
};
const account = (pubkey: string, isSigner: boolean, isWritable: boolean) => ({ pubkey: new PublicKey(pubkey), isSigner, isWritable });

export const recipe: SolanaRecipe = {
  id: "sample",
  intent: "sample",
  title: "Sample",
  type: 'solana',
  flow: "bridge-in",
  destination: {"chain":"sol","assetId":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near","tokenAddress":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"},
  buildSteps: ({ intermediary, amount }) =>
    prepareSolanaSteps(
      [
        // refresh_reserve
        new TransactionInstruction({
          programId: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
          data: hex("02da8aeb4fc91966"),
          keys: [
            account("37Jk2zkz23vkAYBT66HM2gaqJuNg2nYLsCreQAVt5MWK", false, true), // reserve
            account("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF", false, false), // lending_market
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // pyth_oracle
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // switchboard_price_oracle
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // switchboard_twap_oracle
            account("3t4JZcueEzTbVP6kLxXrL3VpWx45jDer4eqysweBchNH", false, false), // scope_prices
          ],
        }),
        // refresh_reserve
        new TransactionInstruction({
          programId: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
          data: hex("02da8aeb4fc91966"),
          keys: [
            account("H3t6qZ1JkguCNTi9uzVKqQ7dvt2cum4XiXWom6Gn5e5S", false, true), // reserve
            account("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF", false, false), // lending_market
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // pyth_oracle
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // switchboard_price_oracle
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // switchboard_twap_oracle
            account("3t4JZcueEzTbVP6kLxXrL3VpWx45jDer4eqysweBchNH", false, false), // scope_prices
          ],
        }),
        // refresh_obligation
        new TransactionInstruction({
          programId: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
          data: hex("218493e497c04859"),
          keys: [
            account("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF", false, false), // lending_market
            account("GoD6qy7kDpJQgkV5cZqdXtJmmjGhNvLzmdJNofjMCCN8", false, true), // obligation
            account("37Jk2zkz23vkAYBT66HM2gaqJuNg2nYLsCreQAVt5MWK", false, true), // remaining_2
            account("H3t6qZ1JkguCNTi9uzVKqQ7dvt2cum4XiXWom6Gn5e5S", false, true), // remaining_3
          ],
        }),
        // repay_obligation_liquidity_v2
        new TransactionInstruction({
          programId: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
          data: Buffer.concat([hex("74aed54cb435d290"), le(amount, 8), hex("")]),
          keys: [
            account(intermediary, true, false), // repay_accounts.owner
            account("GoD6qy7kDpJQgkV5cZqdXtJmmjGhNvLzmdJNofjMCCN8", false, true), // repay_accounts.obligation
            account("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF", false, false), // repay_accounts.lending_market
            account("H3t6qZ1JkguCNTi9uzVKqQ7dvt2cum4XiXWom6Gn5e5S", false, true), // repay_accounts.repay_reserve
            account("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", false, false), // repay_accounts.reserve_liquidity_mint
            account("2Eff8Udy2G2gzNcf2619AnTx3xM4renEv4QrHKjS1o9N", false, true), // repay_accounts.reserve_destination_liquidity
            account(pda("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", [key(intermediary), hex("06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9"), hex("ce010e60afedb22717bd63192f54145a3f965a33bb82d2c7029eb2ce1e208264")]), false, true), // repay_accounts.user_source_liquidity
            account("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", false, false), // repay_accounts.token_program
            account("Sysvar1nstructions1111111111111111111111111", false, false), // repay_accounts.instruction_sysvar_account
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // farms_accounts.obligation_farm_user_state
            account("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", false, false), // farms_accounts.reserve_farm_state
            account("9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo", false, false), // lending_market_authority
            account("FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr", false, false), // farms_program
          ],
        }),
      ],
      { intermediary },
    ),
};
