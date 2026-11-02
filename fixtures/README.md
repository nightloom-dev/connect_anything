# Simulation fixtures

Requests to `POST /simulate` (`<name>.sim.json`) and the answers the simulator gave on a fork of mainnet
(`<name>.result.json`). Both follow the contract in `packages/core/src/sim.ts` and `crates/sim/src/types.rs`. These
files are the source of truth for it:

- `cargo test -p sim` checks that every pair follows the contract.
- `SOLANA_RPC_URL=... cargo test -p sim --release -- --ignored` runs each request again on a fork of mainnet as it is
  now. It checks the verdict, the error and the size.

The positions and pools are live mainnet accounts, so compute units move from slot to slot. If a position is closed
or repaid, its fixture stops passing, and another position has to take its place. Every request delivers 1 USDC
(`1000000`) to `3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7`, the web's stand-in for the intermediary (`STAND_IN` in
`apps/web/src/recipe.ts`).

To run one against a simulator, see `crates/sim/README.md`:

```bash
curl -sS localhost:8790/simulate -H 'content-type: application/json' -H "x-sim-token: $SIM_TOKEN" \
  --data-binary @fixtures/klend-repay.sim.json
```

## klend (Kamino Lend)

These requests come from the web: `GET /api/kamino/<wallet>`, then `rescueRecipe`, then `simulationRequest`. Two were
then broken by hand to show a failure. Accounts and measurements are in `recipes/kamino-rescue/ACCOUNTS.md`.

| Fixture                       | What                                                               | Verdict |      CU | Bytes |
| ----------------------------- | ------------------------------------------------------------------ | ------- | ------: | ----: |
| `klend-repay`                 | Repay of a SOL / USDC position on the main market                  | ok      | 115,948 |   934 |
| `klend-repay-farm`            | A JLP / USDC position whose USDC debt has a farm                   | ok      | 129,942 |  1030 |
| `klend-repay-elevation-group` | A USDT / USDC position in elevation group 1, with repay's remaining accounts | ok | 130,940 | 935 |
| `klend-repay-six-reserves`    | A position with six reserves: over Connect's 200k                  | warn    | 250,028 |  1134 |
| `klend-repay-wrong-market`    | `klend-repay` with the JLP market in the repay: the demo failure   | fail    |  70,330 |   966 |
| `klend-repay-no-refresh`      | The repay of `klend-repay` alone, without the refreshes            | fail    |  21,635 |   821 |

## The demo failure

`klend-repay-wrong-market` changes one account. In step 4, `repay_obligation_liquidity_v2`, it replaces
`repay_accounts.lending_market` with the JLP market `DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek`. The obligation
belongs to the main market. The web signs this recipe, Connect delivers the USDC, and the transaction fails on Solana
with an error that does not depend on prices or timing:

```
Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation)
```

Connect then reports `OPERATION_FAILED`, and the web offers Refund. On the screen it is
the simplest failure to explain: the repay points at a market that the position is not in.
`klend-repay-no-refresh` is the other option. It is a single step that is easy to enter by hand, and it fails with
`ReserveStale` (6009).
