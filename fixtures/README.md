# Simulation fixtures

Requests to `POST /simulate` (`<name>.sim.json`) and the answers the simulator gave on a fork of mainnet
(`<name>.result.json`). Both follow the contract in `packages/core/src/sim.ts` and `crates/sim/src/types.rs`, and these
files are its source of truth:

- `cargo test -p sim` checks that every pair follows the contract.
- `SOLANA_RPC_URL=... cargo test -p sim --release -- --ignored` runs each request again on a fork of mainnet as it is
  now, and checks the verdict, the error and the size.

The positions and pools are live mainnet accounts, so compute units move from slot to slot. If a position is closed or
repaid, its fixture stops passing and another position has to take its place. Every request delivers 1 USDC
(`1000000`) to `3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7`, the web's stand-in for the intermediary (`STAND_IN` in
`apps/web/src/recipe.ts`).

To run one against a simulator (see [crates/sim/README.md](../crates/sim/README.md)):

```bash
curl -sS localhost:8790/simulate -H 'content-type: application/json' -H "x-sim-token: $SIM_TOKEN" \
  --data-binary @fixtures/klend-repay.sim.json
```

## klend (Kamino Lend)

These requests come from the web: `GET /api/kamino/<wallet>`, then `rescueRecipe`, then `simulationRequest`. Two were
then broken by hand to show a failure. Accounts and measurements are in
[recipes/kamino-rescue/ACCOUNTS.md](../recipes/kamino-rescue/ACCOUNTS.md).

| Fixture                       | What                                                               | Verdict |      CU | Bytes |
| ----------------------------- | ------------------------------------------------------------------ | ------- | ------: | ----: |
| `klend-repay`                 | Repay of a SOL / USDC position on the main market                  | ok      | 115,948 |   934 |
| `klend-repay-farm`            | A JLP / USDC position whose USDC debt has a farm                   | ok      | 129,942 |  1030 |
| `klend-repay-elevation-group` | A USDT / USDC position in elevation group 1, with the repay's remaining accounts | ok | 130,940 | 935 |
| `klend-repay-six-reserves`    | A position with six reserves: over Connect's 200k                  | warn    | 250,028 |  1134 |
| `klend-repay-wrong-market`    | `klend-repay` with the JLP market in the repay: the demo failure   | fail    |  70,330 |   966 |
| `klend-repay-no-refresh`      | The repay of `klend-repay` alone, without the refreshes            | fail    |  21,635 |   821 |
| `klend-repay-lookup-table`    | `klend-repay` with a lookup table from mainnet: a v0 message       | ok      | 115,475 |   722 |

The lookup table, `284iwGtA9X9aLy3KsyV8uT2pXLARhYbiSi5SiM2g47M2`, comes from recent klend transactions on mainnet, and
its owner is not known. If it is closed, the fixture fails with `Lookup table … does not exist on mainnet`, and another
table has to take its place. See [ACCOUNTS.md](../recipes/kamino-rescue/ACCOUNTS.md).

## Three more programs

Each of these swaps the delivered 1 USDC to SOL, which stays with the intermediary as wSOL. Each one went through the
web's own code, with no code written for the program:

1. `GET /api/idl/<program>` reads the IDL on chain.
2. `parseStored` and `checkCompat` check the step.
3. `resolveStep` and `buildInstruction` build it.
4. `simulationRequest` writes the request.

The only things typed in were step data: arguments, the pool's accounts, and the remaining accounts. `recipeCode`
exports each one as a recipe. The Meteora pools come from Jupiter's quote for USDC to SOL, restricted to each DEX. The
Whirlpool comes from Orca's list of pools, chosen for its wide tick spacing.

| Fixture                        | Program and instruction                                               | Verdict |     CU | Bytes |
| ------------------------------ | --------------------------------------------------------------------- | ------- | -----: | ----: |
| `meteora-damm-v2-swap`         | Meteora DAMM v2 (`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`) `swap` | ok      | 31,163 |   872 |
| `meteora-dlmm-swap`            | Meteora DLMM (`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`) `swap`    | ok      | 57,247 |  1038 |
| `orca-whirlpool-swap`          | Orca Whirlpools (`whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc`) `swap_v2` | ok   | 46,712 |   989 |
| `orca-whirlpool-swap-slippage` | The same with a minimum out of 1 SOL                                  | fail    | 39,601 |   989 |

The failing one shows a program error named from that program's IDL:
`Step 1 of 1 (swap_v2) failed: AmountOutBelowMinimum: Amount out below minimum threshold` (6036). With a minimum that is
too high, DAMM v2 fails the same way with `ExceededSlippage` (6002).

The intermediary has no wSOL account, so Connect opens one: the step references the wSOL mint and the intermediary's
account of it, and that is what makes Connect add the opening. It accounts for 16.5k of each CU figure above.

### What it took

- **Pools that tolerate a price move.** The first DLMM pool had a bin step of 2. Between reading the pool and running
  the swap, its active bin moved out of the three bin arrays given, and the swap failed with `AccountNotEnoughKeys` on
  `bin_array`. The fixture now uses a pool with a bin step of 8 and five bin arrays around the active one; DLMM takes
  them in any order. The Whirlpool fixture uses a tick spacing of 64, so one tick array spans 5632 ticks. Measured from
  SOL at 94 USDC, the DLMM fixture stays valid within about 13% either way, and the Whirlpool fixture from 36% below to
  12% above. Past that, the arrays have to be given again.
- **`swap_v2`, not `swap`, on Whirlpools.** `swap` does not reference the mints, so Connect would not open the
  intermediary's wSOL account and the swap would have nowhere to send its output.
- **A fixed amount on DAMM v2.** Its amounts are fields of a struct argument (`_params.amount_in`), and `amountArg` takes
  only a top-level integer, so the step spends exactly 1 USDC. DLMM's `amount_in` and Whirlpool's `amount` take the
  amount delivered.
- **A minimum out of 1.** `min_amount_out`, `other_amount_threshold` and `minimum_amount_out` are 1 lamport here, so the
  fixtures do not depend on the price. A real recipe sets a real minimum.

### Open: the intermediary's output accounts

`resolveAccounts` finds every account of the intermediary on Whirlpools (`token_owner_account_a` and `_b`, through
`token_mint_a` and `_b`), so that recipe works for any intermediary. On the other two it leaves some accounts open. The
fixtures have the stand-in's accounts typed in: its wSOL account `ADKjaG2T4AqDPrpSGFvAjYRioN6GvgJZvwFxQr4Xdmgi` on both,
and on DAMM v2 also its USDC account `E9yZFuPob5nB8ZnviNS7TrmAwE2sNgixNvHjPN6gcWYU`. That is correct for the simulation,
but run by another intermediary, such a recipe would still name the stand-in's accounts and fail.

- DLMM `user_token_out`: two mints fit (`token_x_mint`, `token_y_mint`). When the funded mint is one of the two, the
  outgoing account could take the other.
- DAMM v2 `input_token_account` and `output_token_account`: `OWN_TOKEN_ACCOUNT` expects a prefix such as `user_` or
  `owner_`, so these names are not recognized at all.

## The demo failure

`klend-repay-wrong-market` changes one account: in step 4, `repay_obligation_liquidity_v2`, it replaces
`repay_accounts.lending_market` with the JLP market `DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek`, while the obligation
belongs to the main market. The web signs this recipe, Connect delivers the USDC, and the transaction fails on Solana
with an error that does not depend on prices or timing:

```
Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation)
```

Connect then reports `OPERATION_FAILED`, and the web offers Refund. On screen it is the simplest failure to explain: the
repay points at a market the position is not in. `klend-repay-no-refresh` is the alternative: a single step that is
easy to enter by hand, failing with `ReserveStale` (6009).

`klend-repay-wrong-market.recipe.json` is the same failure as a whole recipe, in the form the web stores, ready for the
demo. The web's `rescueRecipe` built it for wallet `2APx2UH73Vnwua5sUpSfrEmGkxE4v33Y5y4GKACTHATf` and obligation
`2WAWpMP739iZuLPAwGqx9mwPCAbDurYMPHuaDj28qnMt`, with the JLP market in the repay's `repay_accounts.lending_market`, and
`parseStored` accepts it. To put it on the web (port 5180 with `npm run dev`):

```bash
curl -sS localhost:5180/api/recipes -H 'content-type: application/json' \
  --data-binary @fixtures/klend-repay-wrong-market.recipe.json          # {"id":"..."}
```

Then open `/r/<id>` and run it. Nothing on the way stops it. The shared run page `/r/:id` does not simulate (the builder
and the fork check on `/kamino` do), and Connect does not simulate a bridge-in before it signs, since the money arrives
after the signature (its Kamino guide, "Bridge-in risk"). So the run reaches Solana, fails there, and ends in
`OPERATION_FAILED` and the Refund. Beforehand, the simulator says `fail`, about 89k CU and 966 bytes. To show it, send
`klend-repay-wrong-market.sim.json` to the web's `/api/simulate`. The obligation is someone else's live position. If it
is closed, `rescueRecipe` can build the same recipe for another position, with only the market in the repay changed.
