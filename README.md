# Connect Anything

Turns an Anchor program on Solana into a "do it from any chain" button, built on Aurora Intents Connect.
Encode Solana Hackathon 2026, Aurora Intents track. Everything here was written during the hackathon.
Plan and roles: [TZ.md](TZ.md), [tz/](tz/README.md).

## Run

Needs Node 22.18 or newer, which runs the TypeScript of `packages/core` and `apps/web/server` as it is.

```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev
```

Put your key from https://studio.aurora.dev into `AURORA_KEY` in `apps/web/.env`, then open http://localhost:5180.

The key stays on the server: the browser sends the two create calls to `/api/intents-connect/*`, and the server
adds `x-api-key` and forwards them to Intents Connect.

Deployed, the same server runs with `npm run build && npm run preview -w apps/web -- --host`. `vite preview` answers
403 to a host it does not know, so the domain has to be in `preview.allowedHosts` in `apps/web/vite.config.ts`.

## Server

`apps/web/server/api.ts` holds every route, and a small plugin mounts it into both `vite` and `vite preview`.

| Route                                       | What it does                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/idl/:programId`                   | The IDL of a program and its instructions. A legacy IDL needs the converter of role R and asks for a file until then |
| `POST /api/idl/parse`                       | The same for an uploaded file, `?programId=` points it at a fork                                               |
| `POST /api/simulate`                        | Forwards to the simulator of role R, 503 while it is not set or not answering                                  |
| `POST /api/recipes`, `GET /api/recipes/:id` | Keeps a recipe as a JSON file in `apps/web/data/recipes`, gives it back by id                                  |
| `GET /api/kamino/:wallet`                   | A wallet's obligations with deposits, borrows, LTV and liquidation LTV, through `@kamino-finance/klend-sdk`    |
| `GET /api/tokens`                           | The Solana tokens Intents Connect can deliver, and what it takes on Base, Arbitrum and Ethereum                |
| `GET /api/balance/:owner/:mint`             | What a wallet holds of a token, which sizes Retry and Refund                                                   |
| `/api/intents-connect/*`                    | Forwards to Intents Connect with the key                                                                       |

| Environment            | What it is                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `AURORA_KEY`           | Required, the server never lets it reach the browser                       |
| `CONNECT_API_URL`      | Optional, the Intents Connect deployment                                   |
| `SIM_URL`, `SIM_TOKEN` | The service of role R, `SIM_TOKEN` goes out as `x-sim-token`               |
| `SOLANA_RPC_URL`       | Optional, the public mainnet endpoint otherwise, which rate-limits         |

## Tests

```bash
npm test -w packages/core
npm test -w apps/web
```

The Kamino test replays one read of a real wallet from mainnet, in `apps/web/server/fixtures`. Public data.

## What works now

`apps/web`, a switch on the path:

- `/`: load a program by ID or an IDL file, pick an instruction, fill the form generated from its arguments and see
  where each account comes from (found automatically, from the recipe, input). Simulate it, export it as TS code or a
  `/r/:id` link, and run it from Base, Arbitrum or Ethereum with one signature and a deposit: exact amount and fee
  before signing, statuses, transaction links.
- `/r/:id`: the same run for a recipe someone shared. Before anything can be signed the page lists its programs,
  instructions and accounts, says that whoever shared the link made it, and compares it with the IDL the program
  publishes where there is one.
- `/kamino`: the USDC supply into the Kamino reserve on the same screen.

The limits of Connect are in `tz/ts.agent.md`. `threeRound` only. `QUOTE_MOVED` recalculates and shows the figures again
before any signature. A 409 blocks a second run and offers resume or cancel. A 503 on a create is retried 3 times, 2.5 s
apart. `OPERATION_FAILED` offers Retry and Refund: in SDK 7.28.0 `deriveExecutionRecovery` has no kind for that status
and the runner has no flow for an out-operation, so both follow the status and Refund goes through the API directly.

Still open:

- From role R: the simulator (screen 3 says it is offline and still exports), the legacy IDL converter (on-chain klend
  asks for a file) and `checkCompat`, whose seam `apps/web/src/compat.ts` finds nothing until then.
- Run, Retry and Refund have run only against an in-memory backend, not with real money on mainnet.

## Sources

klend publishes only a legacy IDL. The modern copy in `packages/core/test/fixtures/klend.modern-idl.json` comes from
[sava-software/idl-clients](https://github.com/sava-software/idl-clients), Apache-2.0.
