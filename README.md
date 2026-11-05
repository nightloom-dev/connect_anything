# Connect Anything

Turns an Anchor program on Solana into a "do it from any chain" button, built on Aurora Intents Connect.
Encode Solana Hackathon 2026, Aurora Intents track. Everything here was written during the hackathon.
Plan and roles: [TZ.md](TZ.md), [tz/](tz/README.md).

## Run from zero

A clean machine needs git and Node 22.18 or newer, which comes with npm and runs the TypeScript of `packages/core`,
`recipes/` and `apps/web/server` as it is. There is no database, and nothing to install globally.

```bash
git clone https://github.com/nightloom-dev/connect_anything.git
cd connect_anything
npm install
cp apps/web/.env.example apps/web/.env
```

Put your key from https://studio.aurora.dev into `AURORA_KEY` in `apps/web/.env`: the server does not start without it.
Aurora turns on the Solana routes of a new key on request, and until then the run screen says so. Then:

```bash
npm run dev
```

and open http://localhost:5180. Reading a program or a position takes no wallet. Paying takes an EVM wallet with funds
on Base, Arbitrum or Ethereum.

The key stays on the server: the browser sends the two create calls to `/api/intents-connect/*`, and the server
adds `x-api-key` and forwards them to Intents Connect.

### Environment

Read from `apps/web/.env` or from the environment.

| Name                   | What it is                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `AURORA_KEY`           | Required, the server never lets it reach the browser                                 |
| `CONNECT_API_URL`      | Optional, the Intents Connect deployment                                             |
| `SIM_URL`, `SIM_TOKEN` | The service of role R, `SIM_TOKEN` goes out as `x-sim-token`. Unset, screen 3 says the simulator is offline and still exports |
| `SOLANA_RPC_URL`       | Optional, the public mainnet endpoint otherwise, which rate-limits                   |
| `RECIPES_DIR`          | Optional, where shared recipes are kept, `apps/web/data/recipes` otherwise           |

### Pages

| Path      | What it is                                              |
| --------- | ------------------------------------------------------- |
| `/`       | The landing page: what it does, and the two ways in     |
| `/build`  | Screens 1 to 4: program, form, simulation, run          |
| `/r/:id`  | Run a recipe someone shared                             |
| `/kamino` | Repay a Kamino debt, `?wallet=&obligation=` fills it in |

### Server routes

`apps/web/server/api.ts` holds every route, and a small plugin mounts it into both `vite` and `vite preview`.

| Route                                       | What it does                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/idl/:programId`                   | The IDL of a program and its instructions. A legacy IDL goes through the simulator's converter, and asks for a file without `SIM_URL` |
| `POST /api/idl/parse`                       | The same for an uploaded file, `?programId=` points it at a fork                                               |
| `POST /api/simulate`                        | Forwards to the simulator of role R, 503 while it is not set or not answering                                  |
| `POST /api/recipes`, `GET /api/recipes/:id` | Keeps a recipe as a JSON file in `apps/web/data/recipes`, gives it back by id                                  |
| `GET /api/kamino/:wallet`                   | A wallet's obligations with deposits, borrows, LTV and liquidation LTV, and the accounts a repay of each takes, through `@kamino-finance/klend-sdk` |
| `GET /api/tokens`                           | The Solana tokens Intents Connect can deliver, and what it takes on Base, Arbitrum and Ethereum                |
| `GET /api/balance/:owner/:mint`             | What a wallet holds of a token, which sizes Retry and Refund                                                   |
| `/api/intents-connect/*`                    | Forwards to Intents Connect with the key                                                                       |

### Deployed

One command puts the whole app on a server with Docker: the web, the simulator from `crates/sim`, and Caddy in front,
which gets the certificate for the domain by itself. The domain's A record points at the server, ports 80 and 443 are open.

```bash
cp apps/web/.env.example apps/web/.env && cp crates/sim/.env.example crates/sim/.env   # then fill both in
DOMAIN=connect.example.com docker compose up -d --build
```

The web reaches the simulator inside compose, so `SIM_URL` in `apps/web/.env` does not matter there, and `SIM_TOKEN`
has to be the same in both files. Shared recipes are kept in a Docker volume. The Telegram watcher joins with
`--profile watch` once `TELEGRAM_BOT_TOKEN` is in `apps/watch/.env`, and its alerts link to `https://$DOMAIN`.

Without Docker it is `npm run build && ALLOWED_HOSTS=<domain> npm run preview -w apps/web -- --host`, on port 4173:
`vite preview` answers 403 to a host that is not in `ALLOWED_HOSTS`.

### Telegram watcher

`apps/watch` watches the LTV of Kamino positions and sends a link to `/kamino` that repays from Base. It reads positions
through `GET /api/kamino/:wallet` of the web app, so it needs only a bot token from @BotFather:

```bash
cd apps/watch
echo 'TELEGRAM_BOT_TOKEN=...' > .env   # APP_URL defaults to http://localhost:5180, WATCH_EVERY_S to 60
npm start
```

In the chat with the bot, `/watch <wallet>` rings 10 points under the position's liquidation LTV, `/watch <wallet> 65`
at 65%. A repay lands about 3 minutes after the tap, so the line sits well before the edge. A position rings once, and
again only after it falls 3 points under its line. Watches live in `apps/watch/data/watches.json`.

## Tests

```bash
npm test -w packages/core
npm test -w apps/web
npm test -w recipes/kamino-rescue
npm test -w apps/watch
```

The Kamino tests replay one read of a real wallet from mainnet, in `apps/web/server/fixtures`, and compare the rescue
recipe with two real repay transactions, in `packages/core/test/fixtures`. Public data.

## What works now

`apps/web`, a switch on the path:

- `/build`: load a program by ID or an IDL file, pick an instruction, fill the form generated from its arguments and see
  where each account comes from (found automatically, from the recipe, input). Simulate it, export it as TS code or a
  `/r/:id` link, and run it from Base, Arbitrum or Ethereum with one signature and a deposit: exact amount and fee
  before signing, statuses, transaction links.
- `/r/:id`: the same run for a recipe someone shared. Before anything can be signed the page lists its programs,
  instructions and accounts, says that whoever shared the link made it, and compares it with the IDL the program
  publishes where there is one.
- `/kamino`: repay anyone's USDC debt on Kamino. Enter a wallet, pick a position, set a target LTV, and the page works
  out the amount as `x = B - t*C` clamped to `[0, B]`, with `B` the debt in dollars, `C` the collateral in dollars and
  `t` the target. The run screen then pays for `refresh_reserve` of every reserve, `refresh_obligation` and
  `repay_obligation_liquidity_v2` of exactly the amount delivered. What the repay does not need stays with the
  intermediary, and Refund takes it back. A debt in anything but USDC says it is not supported yet. The recipe lives in
  `recipes/kamino-rescue`.

The limits of Connect: `threeRound` only. `QUOTE_MOVED` recalculates and shows the figures again
before any signature. A 409 blocks a second run, reads the execution holding the slot and lists it. Anyone with an API key
can create an execution for any wallet, so the wallet signs or funds one only if its steps are the recipe on the page, and
only an unsigned one can be deleted without a warning. A 503 on a create is retried 3 times, 2.5 s apart. A 503 on
anything else says the execution may still be running, and the page holds a second run until it has followed the first
to its end. `OPERATION_FAILED` offers Refund, and Retry on the page of the recipe whose steps failed: in SDK 7.28.0
`deriveExecutionRecovery` has no kind for that status and the runner has no flow for an out-operation, so both follow the
status and Refund goes through the API directly. A failed Refund offers Refund again. A recipe that references neither
the token it receives nor the intermediary's account of it is stopped on screen 2 and on the run screens, since Connect
refuses it.

Still open:

- The simulator and the legacy IDL converter of role R run as a separate service, `crates/sim`. Without `SIM_URL`
  screen 3 says the simulator is offline and still exports, and a legacy IDL such as klend's on chain asks for a file.
- Run has gone once on mainnet with real money, at `/kamino` on 03.11: 0.786044 USDC paid from Base, 0.514635 USDC
  of debt repaid, SUCCESS about 2.5 minutes after the signature. The bridge kept 34% of a payment that small, and the run
  screen now shows what arrives on Solana before the signature. Retry and Refund have run only against an in-memory
  backend.
- Connect's rule on the delivered token is documented for steps-only and was seen on its dry steps route. The create with
  a bridge quote has not been tried against it. Nor is it known what Connect does with a deposit that arrives after a
  delete, so the page says only that a delete does not call one back.
- The compute units on `/kamino` are an estimate from real repays, and it warns but does not refuse, until the simulator
  can measure them.

## Plan

| Date     | What                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| 01.11    | Interim submission: project on Encode, this README, a one-minute video of a repay from Base |
| 02–03.11 | Compatibility checks, the simulation report, three or more Anchor programs go through |
| 04.11    | Retry and Refund after `OPERATION_FAILED` on mainnet                                  |
| 05.11    | Stretch: a Telegram watcher, or Solana and NEAR as source chains                      |
| 06.11    | Every path on mainnet: success, failure, refund, three source chains                  |
| 07.11    | Deployment, README, the three-minute video                                            |
| 08.11    | Final submission                                                                      |

## Sources

klend publishes only a legacy IDL. The modern copy in `recipes/kamino-rescue/klend.idl.json` comes from
[sava-software/idl-clients](https://github.com/sava-software/idl-clients), Apache-2.0.
