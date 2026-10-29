# Connect Anything

Turns an Anchor program on Solana into a "do it from any chain" button, built on Aurora Intents Connect.
Encode Solana Hackathon 2026, Aurora Intents track. Everything here was written during the hackathon.
Plan and roles: [TZ.md](TZ.md), [tz/](tz/README.md).

## Run

```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev
```

Put your key from https://studio.aurora.dev into `AURORA_KEY` in `apps/web/.env`, then open http://localhost:5180.

The key stays on the server: the browser sends the two create calls to `/api/intents-connect/*`, and the dev server
adds `x-api-key` and forwards them to Intents Connect.

## What works now

- `apps/web`: connect an EVM wallet, preview and run a bridge-in that supplies USDC from Base into the Kamino USDC
  reserve on Solana, with fee preview, statuses, retry and resume.
