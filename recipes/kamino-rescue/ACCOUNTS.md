# The repay of someone else's position on a fork

What the recipe of `rescueSteps` does on a fork of mainnet. These are the accounts each instruction takes, where each one
comes from, and what it costs. Measured by `crates/sim` on 02.11.2026. Each request and its answer are in
`fixtures/klend-repay*.sim.json` and `*.result.json`. Rerun them with
`SOLANA_RPC_URL=... cargo test -p sim --release -- --ignored`.

The order in `rescueSteps` holds. All five recipes below pass with the accounts exactly as `index.ts` and
`GET /api/kamino` give them. The intermediary signs the repay of a position it does not own: klend checks the
obligation only for `has_one = lending_market`.

## The transaction

1. `refresh_reserve`, once for each reserve of the position: deposits first, then borrows, each reserve only once.
2. `refresh_obligation`, plus its remaining accounts.
3. `repay_obligation_liquidity_v2(liquidity_amount)`, plus its remaining accounts.

Every reserve has to be refreshed in the same slot as `refresh_obligation`, which in practice means the same
transaction. A recipe that is too heavy cannot be split into two executions.

Connect adds instructions around the steps. Before them: `AdvanceNonceAccount`, `SetComputeUnitLimit` and
`SetComputeUnitPrice`, together 450 CU. After them: its fee, a `TransferChecked` of the delivered token from the
intermediary, 105 CU. The figures below include all four. Connect's docs do not name these instructions, so this is the
simulator's model of them (see `crates/sim/src/simulate.rs`).

## refresh_reserve

| #   | Account                    | Flags                   | From                                                       |
| --- | -------------------------- | ----------------------- | ---------------------------------------------------------- |
| 0   | `reserve`                  | writable                | `ObligationRow.reserve`                                    |
| 1   | `lending_market`           |                         | `Obligation.market`, the reserve's own market              |
| 2   | `pyth_oracle`              | optional                | the reserve's `config.tokenInfo`, or the klend id when unset |
| 3   | `switchboard_price_oracle` | optional                | the same                                                   |
| 4   | `switchboard_twap_oracle`  | optional                | the same                                                   |
| 5   | `scope_prices`             | optional                | the same                                                   |

An optional account that is not set is passed as the klend program id, as Anchor expects.

## refresh_obligation

| #   | Account          | Flags    | From                |
| --- | ---------------- | -------- | ------------------- |
| 0   | `lending_market` |          | `Obligation.market` |
| 1   | `obligation`     | writable | the position        |

Remaining accounts, in this order:

1. The deposit reserves, in the order of the obligation's deposit slots.
2. The borrow reserves, in the order of its borrow slots.
3. Only when the obligation has a referrer: the referrer token state of each borrow.

The count has to be exact (klend `ObligationRemainingAccounts::parse`), otherwise the step fails with
`InvalidAccountInput` (6006). `refreshRemaining` is klend-sdk's `getRefreshObligationIx().accounts.slice(2)`, which
follows this order. `rescueSteps` marks every remaining account writable, and it should stay that way. klend writes to
the referrer token states, and its code can write to a borrow reserve as well (the elevation group accounting and the
referral fees). Read-only reserves did pass on the fork for the first position below, but that depends on the state
of the reserve at that slot.

## repay_obligation_liquidity_v2

| #   | Account                                        | Flags              | From                                                                                         |
| --- | ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| 0   | `repay_accounts.owner`                         | signer             | the intermediary: it signs the transfer of its USDC, it does not own the position             |
| 1   | `repay_accounts.obligation`                    | writable           | the position                                                                                 |
| 2   | `repay_accounts.lending_market`                |                    | `Obligation.market`, the obligation's own market (`has_one`)                                  |
| 3   | `repay_accounts.repay_reserve`                 | writable           | the USDC borrow's `reserve`                                                                  |
| 4   | `repay_accounts.reserve_liquidity_mint`        |                    | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`                                          |
| 5   | `repay_accounts.reserve_destination_liquidity` | writable           | the reserve's supply vault, `ObligationRow.supplyVault`                                      |
| 6   | `repay_accounts.user_source_liquidity`         | writable           | the intermediary's USDC account (its ATA), where Connect delivers                           |
| 7   | `repay_accounts.token_program`                 |                    | `ObligationRow.tokenProgram`, Tokenkeg for USDC                                              |
| 8   | `repay_accounts.instruction_sysvar_account`    |                    | `Sysvar1nstructions1111111111111111111111111`                                                |
| 9   | `farms_accounts.obligation_farm_user_state`    | writable, optional | PDA `["user", reserve_farm_state, obligation]` of the farms program, or the klend id with no debt farm |
| 10  | `farms_accounts.reserve_farm_state`            | writable, optional | the reserve's debt farm, `ObligationRow.debtFarm`, or the klend id with none                 |
| 11  | `lending_market_authority`                     |                    | PDA `["lma", lending_market]` of klend                                                       |
| 12  | `farms_program`                                |                    | `FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr`                                               |

Remaining accounts: only when the obligation is in an elevation group (`elevationGroup > 0`), its deposit reserves in
the order of the deposit slots. Without them, a position in an elevation group fails with `InvalidAccountInput` (6006).
This was checked on the fork. They passed both writable, as `repayRemaining` gives them, and read-only.

A debt farm that the position never joined has no user state, and the repay fails. `rescuable` already refuses that
case.

## Compute units and bytes

The transaction as Connect would send it, with its four instructions and two signatures. It is a legacy message,
with no lookup table.

| Position (fixture)                     | Reserves | Debt farm | Elevation group |                  CU | Bytes |
| -------------------------------------- | -------: | :-------: | :-------------: | ------------------: | ----: |
| SOL / USDC (`klend-repay`)             |        2 |    no     |       no        |     115,373–115,948 |   934 |
| JLP / USDC (`klend-repay-farm`)        |        2 |    yes    |       no        |     129,393–129,942 |  1030 |
| USDT / USDC (`klend-repay-elevation-group`) |   2 |    no     |       yes       |     129,221–130,940 |   935 |
| six reserves (`klend-repay-six-reserves`) |     6 |    no     |       no        | 250,028–268,490 (warn) | 1134 |

Each instruction, from the logs:

| Instruction           | CU                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `refresh_reserve`     | 21–30k each. 11–15k when the reserve has already accrued in the same slot. 30k for a Switchboard price |
| `refresh_obligation`  | 30.6–31.9k with 2 reserves and 84.5k with 6, about 5k plus 13k per reserve                            |
| `repay_obligation_liquidity_v2` | 38.3k. 51.0k with a debt farm (the farms CPI). 51.7k with an elevation group. 42.8k for the six-reserve position |
| Connect's four        | 555                                                                                                   |

The figures move by up to 19k between slots on the same position. A reserve that someone else has refreshed in the
same slot is cheaper to refresh again.

`refresh_reserves_batch` in place of the separate `refresh_reserve`s was measured too. It saves about 5k CU and 10
bytes on two reserves and nothing on six, so it is not worth it.

### For `estimateCu`

`estimateCu` is now `n × 24k + 32k + (debt farm ? 67k : 37k)`. That gives 213k for the six-reserve position, which
measures 250–268k, because it leaves out how `refresh_obligation` grows with each reserve. A fit to the measurements,
on the safe side:

```
n × 38_000 + 42_000 + (debt farm ? 13_000 : 0) + (elevation group ? 13_000 : 0)
```

Here n is the number of distinct reserves. The fit gives 118k for the first position (measured 116k), 131k for the
farm and for the elevation group (130k and 131k), and 270k for the six-reserve position (250–268k). It goes over 200k
from 5 reserves, or from 4 with a debt farm or an elevation group. Such a position does not fit in one Connect
transaction.

## How it fails

Checked on the fork. Each of these runs until the failing step, so Connect would run it too and report
`OPERATION_FAILED`.

| What is wrong                                                                  | Error                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| The repay names another market (`klend-repay-wrong-market`, the demo failure)  | step 4, `ConstraintHasOne` (2001) on `obligation`                                          |
| The repay alone, with no refresh (`klend-repay-no-refresh`)                    | step 1, `ReserveStale` (6009)                                                              |
| A position in an elevation group without the repay's remaining accounts        | step 4, `InvalidAccountInput` (6006)                                                       |
| Less USDC delivered than the repay's `liquidity_amount`                        | step 4, `InsufficientFunds` in the Token program. `amountArg` prevents this unless edited by hand |
