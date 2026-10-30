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
| `GET /api/tokens`                           | The Solana tokens Intents Connect can deliver                                                                  |
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

- `apps/web`: connect an EVM wallet, preview and run a bridge-in that supplies USDC from Base into the Kamino USDC
  reserve on Solana, with fee preview, statuses, retry and resume.

## Sources

klend publishes only a legacy IDL. The modern copy in `packages/core/test/fixtures/klend.modern-idl.json` comes from
[sava-software/idl-clients](https://github.com/sava-software/idl-clients), Apache-2.0.
