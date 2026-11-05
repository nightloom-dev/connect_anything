# End-to-end tests

Characterization tests: they pin what the UI does today, above all where money moves, so that a redesign can change how
it looks and nothing else. Every request of the page is answered by a mock, so the suite runs offline, and the wallet is
a mock too.

| File                  | What it pins                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`       | every page renders, with no console error and no request the mocks do not know                 |
| `builder.spec.ts`     | IDL upload and lookup, the accounts form, simulation verdicts, export and the shared link      |
| `kamino.spec.ts`      | positions, the target LTV and its amount, every warning, the watcher's deep link               |
| `shared.spec.ts`      | `/r/:id`: who made it, what will run, the published-IDL check, links that lead nowhere         |
| `run-states.spec.ts`  | the payment panel, one test per state, `state 01` to `state 27`                                |
| `a11y.spec.ts`        | axe on every page                                                                              |

## Running

From the repository root:

```sh
npm run e2e -w apps/web                      # everything, about 2 minutes
cd apps/web
npx playwright test -c e2e/playwright.config.ts run-states -g "state 13"   # one test
npx playwright test -c e2e/playwright.config.ts --project desktop --headed  # watch it
npx playwright test -c e2e/playwright.config.ts --ui                       # step through
npx playwright show-report e2e/report
A11Y_STRICT=1 npm run e2e -w apps/web        # serious and critical axe violations fail
```

The config starts its own dev server (`AURORA_KEY=test npx vite --port 5182 --strictPort`) and stops it at the end.
Outside CI it reuses one already listening on 5182. The key is fake: nothing reaches the dev server's `/api`.

Chromium comes from `PLAYWRIGHT_BROWSERS_PATH` and must be the build of `@playwright/test` 1.63.0. The root
`package.json` pins `playwright-core` to that version (`@axe-core/playwright` would pull a newer one). Do not run
`playwright install` to fix a mismatch; change the versions together.

A failure leaves, in `e2e/.results/`, a screenshot, `error-context.md` (the page as an ARIA tree, the quickest read) and a
trace with the actions, a screencast, the console and the network. The trace has no DOM snapshots: they store the 56 MB
of JavaScript the dev page loads, every test, and doubled the suite's time.

### Projects and time

- `desktop`, 1440×900: every test.
- `mobile`, Pixel 7: only tests tagged `@mobile` (every page, a11y, the AppKit modal, the Kamino deep link, a quote and a
  successful run). Each test loads the dev page into a fresh browser, seconds of CPU, so running everything twice would
  break the 3-minute budget. Add `{ tag: '@mobile' }` to a test to run it there too.
- `mobile-webkit` (the in-app browser of Telegram on iOS) is commented out until there is a WebKit for 1.63.0.

## What answers the page

`support.ts` routes every request of a test's browser context:

| Request                                                      | Answered by                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `/api/intents-connect/*`, and `/api/v1/executions*` anywhere | `connect`, the fake Intents Connect (`mocks/connect.ts`)    |
| any other `/api/*`                                           | `api`, the app's own server (`mocks/api.ts`)                |
| AppKit, fonts, public RPCs                                   | stubs in `mocks/external.ts`                                |
| the page, its modules, Vite's socket                         | the dev server                                              |
| anything else                                                | aborted, and the test fails: "requests no mock answered"    |

Tests set a variant on a fixture before the page asks for it, and can hold a request open to see what the page shows
meanwhile:

```ts
test('…', async ({ page, api, connect, wallet }) => {
  api.kamino = 'near';                      // tokens, idl, simulate, kamino, balance: see the fields of ApiMocks
  connect.script = ['DEPOSIT_PROCESSING', 'SUCCESS'];
  const held = connect.hold('create');      // or api.hold('kamino'), …
  // … click …
  await held.reached();                     // the page sent it
  await expect(statusOf(page, 'Creating the execution…')).toBeVisible();
  held.release();
});
```

### The app's API (`mocks/api.ts`)

Answers in the shapes and words of `server/api.ts`. Variants: `tokens` (`normal`, `empty`, `error`, `no-arbitrum`,
`no-usdc`), `idl` (`converted`, `recipe`, `legacy`, `missing`, `error`), `simulate` (`ok`, `warn`, `fail`, `offline`,
from the simulator fixtures in `/fixtures`), `kamino` (see `mocks/kamino.ts`), `balance` (atomic units). The recipe store
starts with `RECIPES.demo`, `corrupt`, `unbuildable` and `foreignToken`; a POST adds `e2e000…1`, `e2e000…2`, and so on.

`mocks/data/kamino.json` is the real answer for wallet `8FKDyH8g…` (two positions), recorded by running `server/api.ts`
over the RPC fixture: `cd apps/web && node e2e/mocks/record-kamino.ts`. The other Kamino variants are built from it.

### The fake Intents Connect (`mocks/connect.ts`)

The wire format of SDK 7.28.0, with the rules the app depends on: one execution in flight per wallet (409), a deletion
needs a signature, a bridge-in plays its script only once its deposit is in. The quote keeps `bridgeBps` (2%) and the
app's 1% slippage, and states `networkFee` (0.02 USDC), so 800 USDC on Base is "at least 776.16 USDC" and the recipe
spends 774.19965 USDC. Knobs:

- `intermediary = null`: Solana is not enabled for the key.
- `lookupFailures`, `lookupStatus`: the next lookups of the intermediary fail.
- `failCreates`: the next creates answer 503, no durable nonce (the app retries three times, 2.5 s apart).
- `failReads`: the next polls answer 503. Five in a row and the runner gives up.
- `moveOnCreate`: the real create finds the market this many basis points lower: QUOTE_MOVED.
- `script`, `scripts`: the statuses the next executions move through, one per poll once funded.
- `down`: every request answers this status.
- `seed({ wallet, status, signed, steps?, script? })`: an execution from another tab or someone else. Its steps are those
  of the page's last quote unless given, so it is the recipe on the page. Needs a quote first.
- `then(id, …statuses)`, `get(id).funded = true`: move an execution on, or let a deposit arrive from elsewhere.
- `list()`, `requests`: what exists, and every request in order.

The runner polls every 3 s. A test that needs many polls calls `page.clock.install()` before loading the page and
`pollUntil(page, done)`, which skips the sleeps (state 17).

### The mock wallet (`wallet.ts`)

"E2E Wallet" is an EIP-1193 provider announced over EIP-6963, on Base, at `WALLET`. AppKit lists it in its modal like any
browser wallet, and `wallet.connect()` clicks through it: the app needs no test hook. After a reload AppKit reconnects it
by itself. It signs anything and its transactions succeed; `rejectSignatures(n)` and `rejectTransactions(n)` make the
next ones fail with 4001, as a click on Reject does, and `hold('personal_sign' | 'eth_sendTransaction')` keeps a prompt
open. `calls(method)` lists what the app asked. These live in the page, so a reload resets them.

`MockSolanaWallet` is a Wallet Standard wallet that AppKit's Solana adapter lists. It connects and signs nothing (state 02).

## Selectors

By role and accessible name, or by the words on the screen, never by class or DOM structure: the redesign changes those.
A `Notice` is a `status` (info, warn, ok) or an `alert` (error), so `statusOf(page, phrase)` and `alertOf(page, phrase)`
find one by a phrase of it. Page paths are in `paths.ts`.

## Adding a state

1. Find the knobs that reach it: a variant of `api`, a script or a failure of `connect`, a rejection in `wallet`.
2. Add `test('state NN what the person sees', …)` to `run-states.spec.ts`; `rescue(page, wallet)` and `quote(page)` get
   a connected wallet and a quote on `/kamino`.
3. Assert the words that tell the person what happened, then what happened behind them: `connect.list()`,
   `connect.requests`, `wallet.calls(…)`. A state is about money, so check the money: who signs what, what is sent where.
4. A state no knob can reach gets `test.fixme(…)` with the reason in its body, never a skipped assertion.

## After a deliberate change of words

The specs pin the words of the money flows on purpose: changing one is a change to review. When the change is meant:

1. `grep -rn "the old phrase" apps/web/e2e` and change it there, in the same commit as the UI.
2. If a page moved, change `paths.ts`.
3. If a role changed (a `status` that became an `alert`), change the helper call, not the phrase.

The suite has no screenshot comparisons, so `npm run e2e:update -w apps/web` has nothing to update unless one is added.

The words the specs lean on most: "Connect EVM wallet", "Get exact amount and fee", "Sign and run", "Done: the
instructions ran on Solana.", "Your intermediary on Solana:", the phase texts of `PHASE_TEXT` in `src/features/run/execute.tsx`, "This
wallet already has an execution in flight…", "You started an execution from this browser:", "Resume it", "Delete it (a
signature that moves no money)", "Your intermediary holds … USDC.", "Refund", "Sign and refund", the figures of the quote
card ("at least 776.16 USDC, …"), and on `/kamino` "Read positions", "Target LTV, %" and "Repay $800.00, which is 800 USDC."
