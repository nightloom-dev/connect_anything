# Connect Anything

Connect Anything turns an Anchor program on Solana into a "do it from any EVM chain" button on Aurora Intents Connect.
The flagship flow repays a Kamino debt on Solana with one signature from Base.

Built for the Encode Solana Hackathon 2026, Aurora Intents track. Everything in this repository was written during the
hackathon.

## Links

- **Live app:** <!-- FILL: live app URL -->
- **Demo video:** <!-- FILL: demo video URL (2–4 minutes) -->
- **Mainnet run of 2026-11-03:** deposit on Base <!-- FILL: Basescan URL of the deposit transaction -->, execution on
  Solana <!-- FILL: Solscan URL of the transaction that ran the steps -->
- **Fork measurements:** [fixtures/README.md](fixtures/README.md)

## The problem

A borrower on Kamino keeps their USDC on Base, and their Kamino position on Solana is close to liquidation. To repay it
today they need a bridge or an exchange, a Solana wallet, SOL for fees, and several transactions in several apps.

Aurora Intents Connect can already do this: it bridges the money and runs Solana instructions, signed by the user's
intermediary account. But each Connect integration is written by hand: the instruction
discriminator, the account order, the argument encoding, the compute budget. Aurora's own examples, Kamino included,
are written that way.

Connect Anything does that work from the program's IDL. A Solana protocol team gets a "pay from an EVM chain" flow for
its Anchor program without writing an integration. Its users sign once in the EVM wallet they already have.

## How it works

The flagship flow, end to end:

```
EVM wallet on Base, Arbitrum or Ethereum
  │  one signature, then the deposit
  ▼
apps/web: browser and server                      crates/sim
  the builder or /kamino makes the recipe ──────▶  LiteSVM fork of mainnet
  the server adds x-api-key to the create calls    compute units, bytes, logs, verdict
  │
  ▼
Aurora Intents Connect: quote, bridge, relayer
  │  delivers USDC to the user's intermediary and runs the steps
  ▼
Solana mainnet (the intermediary is the only signer)
  refresh_reserve × n ─▶ refresh_obligation ─▶ repay_obligation_liquidity_v2 ─▶ Kamino debt repaid
```

From a program ID to an executed instruction takes seven steps. The first five are Connect Anything's own code. The last
two build on Aurora's SDK and on Connect itself.

1. **IDL.** The app reads the program's Anchor IDL account on chain, or takes an uploaded IDL file. It reads the 0.30+
   format directly. A legacy (pre-0.30) IDL, such as klend's on-chain one, goes through Anchor's own converter in the
   simulator service.
2. **Form.** Each argument of the chosen instruction becomes a typed field: integers, floats, booleans, public keys,
   strings, bytes, options, vectors, arrays, structs and enums. Anchor's `BorshCoder` encodes the instruction data.
3. **Accounts.** The resolver fills in what it can. The signer becomes the user's intermediary. PDAs are derived from the
   seeds in the IDL, fixed addresses come from the IDL, and the intermediary's associated token accounts follow from the
   mint and its token program. The rest comes from the form or from the recipe. The form shows where each account came
   from.
4. **Recipe.** An ordered list of instructions: the main one and the ones that must run before it. For klend these are a
   `refresh_reserve` for each reserve and a `refresh_obligation` before the repay. The amount Connect delivers can feed
   one unsigned integer argument.
5. **Simulation.** The recipe runs on a fork of Solana mainnet in LiteSVM, inside the transaction Connect would send,
   with the intermediary holding the delivered token. The result gives compute units, transaction size, logs, and the
   error by name. Over 200,000 CU or 1232 bytes is a warning.
6. **Export.** The recipe becomes a `SolanaRecipe` whose steps pass through the SDK's `prepareSolanaSteps` for whichever
   intermediary runs them. It exports as TypeScript or as a shareable `/r/:id` link.
7. **Execution.** Aurora's SDK runs it: the bridge-in flow with the `threeRound` fee, the only fee strategy Connect
   accepts for Solana. The page shows the exact amount and fee before the signature and the execution's status after it.
   If the steps fail on Solana, it offers Retry and Refund.

### The Kamino rescue

`/kamino` repays anyone's USDC debt on Kamino. Enter a wallet, pick a position and set a target LTV. The page computes
the repay as `x = B - t*C`, clamped to `[0, B]`, where `B` is the debt in dollars, `C` the collateral in dollars and `t`
the target. The transaction runs `refresh_reserve` for every reserve of the position, then `refresh_obligation`, then
`repay_obligation_liquidity_v2` for exactly the amount delivered. Whatever the repay does not use stays with the
intermediary, and Refund sends it back. The owner of the position signs nothing: klend checks a repay's obligation only
against its lending market. A debt in anything other than USDC is shown as not supported yet. The recipe lives in
`recipes/kamino-rescue`, and the accounts, measurements and failure modes are in
[recipes/kamino-rescue/ACCOUNTS.md](recipes/kamino-rescue/ACCOUNTS.md).

### Running through Connect

- **Fees.** `threeRound` only. If Connect answers `QUOTE_MOVED`, the page recalculates and shows the figures again before
  any signature.
- **One execution per wallet.** A 409 blocks a second run. The page reads the execution holding the slot and lists it.
- **Executions made by others.** Anyone with an API key can create an execution for any wallet. The wallet signs or funds
  one only if its steps are the recipe on the page. Only an unsigned execution can be deleted without a warning.
- **503.** A 503 on a create means Connect has no durable nonce free; the page retries 3 times, 2.5 s apart. A 503 on
  anything else may mean the execution is still running, so the page says so and holds a second run until it has
  followed the first one to its end.
- **`OPERATION_FAILED`.** The page offers Refund, and Retry on the page of the recipe whose steps failed. In SDK 7.28.0
  `deriveExecutionRecovery` has no kind for this status and the runner has no flow for an out-operation, so both follow
  the status, and Refund goes through the API directly. A failed Refund offers Refund again.
- **The delivered token.** Connect refuses a recipe that references neither the token it receives nor the
  intermediary's account of it. The builder and the run screens stop such a recipe before it is sent.

## How it uses Solana

Every instruction runs on Solana mainnet; the EVM chain only pays. Connect Anything reads a program's interface from its
Anchor IDL account on chain, converting pre-0.30 IDLs with Anchor's own converter, and encodes instruction data with
Anchor's Borsh coder. It derives PDAs from the seeds the IDL declares, and the intermediary's associated token accounts
from the mint and its token program. Connect signs on Solana with one key, the user's intermediary, so every signer
must resolve to it, and an instruction that needs any other signer is marked unsupported with the reason. The Kamino
recipe is klend's full refresh chain in one transaction: `refresh_reserve` for each reserve of the position,
`refresh_obligation`, then `repay_obligation_liquidity_v2`, because klend rejects a repay against stale reserves and
wants every reserve refreshed in the same slot as the obligation. Before anyone pays, a Rust service reads the accounts
at one slot with `getMultipleAccounts`, forks mainnet into LiteSVM, gives the intermediary the delivered token, and runs
the steps inside the transaction Connect would send: a durable nonce advance, the compute budget, any token account
openings, and the relayer's fee. It reports compute units and wire size against Connect's 200,000 CU and Solana's
1232-byte transaction limit, and names a failing error from the program's IDL. A recipe can carry up to 16 address
lookup tables; the simulator then builds a v0 message and refuses any table that is not live.

## What has been verified

### On a fork of mainnet

Four programs, each simulated by `crates/sim` on a fork of mainnet inside the transaction Connect would send. The klend
request comes from the `/kamino` recipe. The three swaps went through the builder's generic code, with no code written
for the program: only step data was typed (arguments, pool accounts, remaining accounts). Each swap turns the delivered
1 USDC into SOL, and its figures include about 16.5k CU for Connect opening the intermediary's wSOL account.

| Program         | Instructions                                                         | Fixture                | Verdict | CU recorded | Bytes recorded | CU on 2026-11-08 |
| --------------- | -------------------------------------------------------------------- | ---------------------- | ------- | ----------: | -------------: | ---------------: |
| Kamino Lend     | `refresh_reserve` ×2, `refresh_obligation`, `repay_obligation_liquidity_v2` | `klend-repay`   | ok      |     115,948 |            934 |          115,872 |
| Orca Whirlpools | `swap_v2`                                                            | `orca-whirlpool-swap`  | ok      |      46,712 |            989 |           46,718 |
| Meteora DLMM    | `swap`                                                               | `meteora-dlmm-swap`    | ok      |      57,247 |           1038 |           56,634 |
| Meteora DAMM v2 | `swap`                                                               | `meteora-damm-v2-swap` | ok      |      31,163 |            872 |           31,167 |

The limits are 200,000 CU and 1232 bytes. Compute units move a little from slot to slot because the accounts are live.
On 2026-11-08 all 11 fixtures ran again on a fork of that day's mainnet and kept their recorded verdicts, including the
failing ones (wrong market, missing refresh, slippage) and the six-reserve position that exceeds 200k CU. Details,
program IDs and the failure cases are in [fixtures/README.md](fixtures/README.md).

### On mainnet

One run with real money, on 2026-11-03, from `/kamino`: 0.786044 USDC paid from Base, 0.514635 USDC of Kamino debt
repaid on Solana, status `SUCCESS` about 2.5 minutes after the signature. The bridge kept 34% of a payment that small,
so the run screen now shows what will arrive on Solana before the signature.

- Deposit on Base: <!-- FILL: Basescan URL of the deposit transaction -->
- Execution on Solana: <!-- FILL: Solscan URL of the transaction that ran the steps -->

### Against real transactions

The rescue recipe built for a recorded mainnet position produces the same klend instructions as two real repay
transactions, with and without a debt farm. `packages/core` also checks its encoding and account resolution against
recorded mainnet transactions of klend, pump_amm, Meteora DLMM and Jupiter. On 2026-11-08 all unit tests, the
simulator's tests and the 200 end-to-end tests pass; see [Tests](#tests).

## Run from zero

A clean machine needs git and Node 22.18 or newer. npm comes with Node, and Node runs the TypeScript of `packages/core`,
`recipes/` and `apps/web/server` as it is. There is no database and nothing to install globally.

```bash
git clone https://github.com/nightloom-dev/connect_anything.git
cd connect_anything
npm install
cp apps/web/.env.example apps/web/.env
```

Put your API key from https://studio.aurora.dev into `AURORA_KEY` in `apps/web/.env`. The server does not start without
it. Aurora enables the Solana routes of a new key on request, and until then the run screen says so. Then:

```bash
npm run dev
```

Open http://localhost:5180. Reading a program or a position needs no wallet. Paying needs an EVM wallet with funds on
Base, Arbitrum or Ethereum.

The app runs without the simulator. The builder then says the simulator is offline and still exports, and a legacy IDL
such as klend's on-chain one asks for a file instead. To simulate, start `crates/sim` as described in
[crates/sim/README.md](crates/sim/README.md) and set `SIM_URL` and `SIM_TOKEN`.

The Aurora key stays on the server. The browser sends the two create calls, `POST /api/v1/executions/{wallet}` and
`POST /api/v1/executions/{wallet}/steps`, to `/api/intents-connect/*`, and the server adds `x-api-key` and forwards them
to Intents Connect. Any other method or path there gets a 404 and never reaches Connect. All other Connect calls go from
the browser straight to `CONNECT_API_URL`, without a key.

### Environment

Read from `apps/web/.env` or from the environment.

| Name                   | What it is                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `AURORA_KEY`           | Required. The server never sends it to the browser                                                 |
| `CONNECT_API_URL`      | The Intents Connect deployment. Defaults to `https://intents-connect-api.aurora.dev`               |
| `SIM_URL`, `SIM_TOKEN` | The simulator service, `crates/sim`. `SIM_TOKEN` is sent as `x-sim-token`. Unset, the builder says the simulator is offline and still exports |
| `SOLANA_RPC_URL`       | Mainnet RPC. Defaults to the public endpoint, which rate-limits                                    |
| `RECIPES_DIR`          | Where shared recipes are stored. Defaults to `apps/web/data/recipes`                               |
| `VITE_PUBLIC_URL`      | The site's public address, where the example watcher alert on the landing page links. Defaults to the address the page is opened at |
| `ALLOWED_HOSTS`        | `vite preview` only: the comma-separated hosts it serves. Any other host gets 403                  |

### Pages

| Path      | What it is                                                                  |
| --------- | --------------------------------------------------------------------------- |
| `/`       | The landing page: what the project does, and the two ways in                |
| `/build`  | The builder in four screens: program, form, simulation, run                 |
| `/r/:id`  | Run a recipe someone shared                                                 |
| `/kamino` | Repay a Kamino debt. `?wallet=&obligation=` fills it in                     |

On `/r/:id`, before anything can be signed, the page lists the recipe's programs, instructions and accounts, says that
whoever shared the link made it, and compares it with the IDL the program publishes, where there is one.

### Server routes

`apps/web/server/api.ts` holds every route. A small Vite plugin mounts it into both `vite` and `vite preview`.

| Route                                       | What it does                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/idl/:programId`                   | The program's IDL and its instructions. A legacy IDL goes through the simulator's converter; without `SIM_URL` the page asks for a file |
| `POST /api/idl/parse`                       | The same for an uploaded file. `?programId=` sets the program address, such as a fork's         |
| `POST /api/simulate`                        | Forwards to the simulator. 503 while it is not set or not answering                             |
| `POST /api/recipes`, `GET /api/recipes/:id` | Stores a recipe as a JSON file in `RECIPES_DIR` and returns it by id                            |
| `GET /api/kamino/:wallet`                   | A wallet's obligations with deposits, borrows, LTV and liquidation LTV, and the accounts a repay of each needs, through `@kamino-finance/klend-sdk` |
| `GET /api/tokens`                           | The Solana tokens Intents Connect can deliver, and what it accepts on Base, Arbitrum and Ethereum |
| `GET /api/balance/:owner/:mint`             | How much of a token a wallet holds, which sizes Retry and Refund                                |
| `POST /api/intents-connect/api/v1/executions/{wallet}[/steps]` | Forwards the two create calls to Intents Connect with the key. Anything else under `/api/intents-connect/` gets a 404 |

## Deployment

One command puts the whole app on a server with Docker: the web, the simulator from `crates/sim`, and Caddy in front,
which obtains the TLS certificate for the domain. Point the domain's A record at the server and open ports 80 and 443.

```bash
cp apps/web/.env.example apps/web/.env
cp crates/sim/.env.example crates/sim/.env   # then fill in both
DOMAIN=connect.example.com docker compose up -d --build
```

Inside compose the web reaches the simulator at `http://sim:8790`, so `SIM_URL` in `apps/web/.env` does not matter
there. `SIM_TOKEN` must be the same in both files. Shared recipes are kept in a Docker volume. Add `--profile watch` to
start the Telegram watcher once `TELEGRAM_BOT_TOKEN` is in `apps/watch/.env`; its alerts link to `https://$DOMAIN`.

Without Docker, run `npm run build && ALLOWED_HOSTS=<domain> npm run preview -w apps/web -- --host`, which serves on
port 4173. `vite preview` answers 403 to any host that is not in `ALLOWED_HOSTS`.

To run the simulator on its own server, with Docker or systemd, see
[crates/sim/README.md](crates/sim/README.md#deploy-on-a-vps).

## Telegram watcher

`apps/watch` is a Telegram bot that watches the LTV of Kamino positions. When a position crosses its line, the bot sends
a link to `/kamino` that opens the repay of that position, payable from Base, Arbitrum or Ethereum. It reads positions
through `GET /api/kamino/:wallet` of the web app, so it needs the web app running and a bot token from @BotFather, and
nothing else:

```bash
cd apps/watch
echo 'TELEGRAM_BOT_TOKEN=...' > .env
npm start
```

| Variable             | Default                        | What it is                      |
| -------------------- | ------------------------------ | ------------------------------- |
| `TELEGRAM_BOT_TOKEN` | none, required                 | The bot's token from @BotFather |
| `APP_URL`            | `http://localhost:5180`        | Where the watcher reads positions |
| `PUBLIC_URL`         | `APP_URL`                      | The address the alert links to  |
| `WATCH_EVERY_S`      | `60`                           | Seconds between checks          |
| `WATCH_FILE`         | `apps/watch/data/watches.json` | Where the watches are kept      |

In the chat with the bot:

- `/watch <wallet>` alerts when a position of the wallet comes within 10 points of its liquidation LTV.
- `/watch <wallet> 65` alerts at 65% LTV instead.
- `/unwatch <wallet>` stops, and `/list` shows what the chat watches.

A repay lands about 3 minutes after the tap, so the line sits well before liquidation. A position alerts once, and again
only after its LTV falls 3 points under the line.

## Repository layout

| Path                    | What it holds                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/core`         | The generator: IDL loading and conversion, the form's fields, Borsh encoding, account resolution, Connect compatibility checks, TypeScript export, simulation requests |
| `recipes/kamino-rescue` | The Kamino recipe: the refresh chain and the repay, the amount for a target LTV, the compute estimate, klend's modern IDL |
| `apps/web`              | The web app (Vite and React) and its server routes in `server/api.ts`. The Playwright suite is in `e2e/` |
| `apps/watch`            | The Telegram watcher                                                                                   |
| `crates/sim`            | The simulator: a Rust service that forks mainnet into LiteSVM, and the legacy IDL converter            |
| `fixtures`              | Simulation requests and the simulator's recorded answers, the source of truth for its contract         |
| `compose.yaml`          | The web, the simulator and Caddy on one server, with the watcher as an optional profile                |
| `TZ.md`, `tz/`          | The team's original spec and role split, in Russian. Planning notes from the first days; parts are out of date |

The JavaScript side is one npm workspace (`apps/*`, `packages/*`, `recipes/*`). The Rust side is one Cargo workspace
(`crates/*`), with the toolchain pinned in `rust-toolchain.toml`.

## Tests

```bash
npm test                     # unit tests of every workspace
cargo test -p sim            # the simulator, offline
npm run e2e                  # end-to-end, in Chromium
```

| Suite                   | Command                             | Tests on 2026-11-08 |
| ----------------------- | ----------------------------------- | ------------------: |
| `packages/core`         | `npm test -w packages/core`         |                  53 |
| `apps/web`              | `npm test -w apps/web`              |                 133 |
| `recipes/kamino-rescue` | `npm test -w recipes/kamino-rescue` |                  16 |
| `apps/watch`            | `npm test -w apps/watch`            |                   4 |
| `crates/sim`            | `cargo test -p sim`                 |                  24 |
| End-to-end              | `npm run e2e`                       |                 200 |

The unit tests run offline. The Kamino tests replay one read of a real mainnet wallet, kept in
`apps/web/server/fixtures`, and compare the rescue recipe with two real repay transactions, kept in
`packages/core/test/fixtures`. All of it is public data.

`cargo test -p sim` needs the Rust toolchain described in [crates/sim/README.md](crates/sim/README.md). To run every
fixture again on a fork of mainnet as it is now, give it an RPC URL:

```bash
SOLANA_RPC_URL=... cargo test -p sim --release -- --ignored
```

The end-to-end suite pins what the UI does, above all where money moves. It answers every request with a mock and uses a
mock wallet, so it runs offline and spends nothing. It also runs axe, a keyboard-only walk, a layout check at 360 px,
and layout shift limits. `npm run e2e:visual` compares screenshots. On a new machine, install Chromium first with
`npx playwright install --with-deps chromium`, as CI does. The suite, its servers and its variables are described in
[apps/web/e2e/README.md](apps/web/e2e/README.md).

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push and pull request. Blocking: the unit tests,
the build, the bundle budget, the simulator (`cargo fmt --check`, clippy with `-D warnings`, `cargo test -p sim`) and
the end-to-end tests. The screenshots and Lighthouse run without blocking.

## Still open

- **Retry and Refund on mainnet.** Both have run only against an in-memory backend, not with real money.
- **Source chains.** The app offers Base, Arbitrum and Ethereum, but only Base has paid for a run on mainnet: the one
  run of 2026-11-03. Solana and NEAR as source chains are not implemented.
- **Packaging.** There is no npm package and no CLI. A recipe leaves the app as TypeScript code or as a `/r/:id` link.
- **Connect's rule on the delivered token.** It is documented for steps-only executions and was seen on Connect's dry
  steps route. A create with a bridge quote has not been tried against it. It is also not known what Connect does with
  a deposit that arrives after a delete, so the page says only that a delete does not call the deposit back.
- **Connect's own instructions.** The simulator models what Connect adds around the steps (durable nonce, compute
  budget, token account openings, the relayer's fee) from Connect's docs, which do not name the exact instructions. The
  model is in one place, `assemble` in `crates/sim/src/simulate.rs`.
- **Compute units on `/kamino`.** The warning before the signature comes from an estimate based on real repays. It warns
  and does not refuse. The fork check beside it shows the simulator's measured figures when a simulator is connected,
  but the run does not wait for it. The estimate undercounts positions with many reserves; a better fit is in
  [ACCOUNTS.md](recipes/kamino-rescue/ACCOUNTS.md#for-estimatecu).
- **Large Kamino positions.** By that fit, a position with 5 reserves, or 4 with a debt farm or an elevation group,
  goes over 200k CU and does not fit one Connect transaction. klend needs every reserve refreshed in the same slot as
  the obligation, so the work cannot be split into two executions. Only USDC debts are supported.
- **Simulation is optional.** Without `SIM_URL` the builder cannot simulate, and a legacy IDL such as klend's on-chain
  one needs an uploaded file. The shared run page `/r/:id` does not simulate.
- **Account resolution.** On Meteora DLMM and DAMM v2 the resolver does not find all of the intermediary's token
  accounts, so they are typed in, and such a recipe fails when another intermediary runs it. See
  [fixtures/README.md](fixtures/README.md#open-the-intermediarys-output-accounts).
- **Open server.** Anyone who can reach the web server can create executions with its key, and the recipe store has no
  rate limit: once it holds 1000 recipes, new ones get 507.

## Team

<!-- FILL: team members, roles and contacts -->

## License

MIT, see [LICENSE](LICENSE).

`recipes/kamino-rescue/klend.idl.json` comes from
[sava-software/idl-clients](https://github.com/sava-software/idl-clients) under Apache-2.0.

## Credits

- Aurora Intents Connect and its SDK, `@aurora-is-near/intents-connect` and `@aurora-is-near/intents-connect-wallet`
  7.28.0, which bridge the money and run the steps.
- Anchor: `@coral-xyz/anchor` 0.32.1 reads IDLs and encodes instructions, and `anchor-lang-idl` 0.2.0 converts legacy
  IDLs.
- [LiteSVM](https://github.com/LiteSVM/litesvm) 0.18.1 runs the mainnet fork.
- `@kamino-finance/klend-sdk` reads Kamino positions.
- Reown AppKit connects the EVM wallets.
- klend publishes only a legacy IDL on chain. The modern copy in `recipes/kamino-rescue/klend.idl.json` comes from
  [sava-software/idl-clients](https://github.com/sava-software/idl-clients), Apache-2.0.
