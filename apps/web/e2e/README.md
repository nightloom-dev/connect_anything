# End-to-end tests

Characterization tests: they pin what the UI does today, above all where money moves, so that a redesign can change how
it looks and nothing else. Every request of the page is answered by a mock, so the suite runs offline, and the wallet is
a mock too. On top of them: axe, the keyboard, the
layout at 360 px, layout shifts and screenshots.

| File                   | What it pins                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`        | every page renders, with no console error and no request the mocks do not know                |
| `builder.spec.ts`      | IDL upload and lookup, the accounts form, simulation verdicts, export and the shared link     |
| `kamino.spec.ts`       | positions, the target LTV and its amount, every warning, the watcher's deep link              |
| `shared.spec.ts`       | `/r/:id`: who made it, what will run, the published-IDL check, links that lead nowhere        |
| `run-states.spec.ts`   | the payment panel, one test per state, `state 01` to `state 27`                               |
| `a11y.spec.ts`         | axe on every page                                                                             |
| `a11y-states.spec.ts`  | axe and the heading outline on every scene of `scenes.ts`: the states a page reaches after a few clicks |
| `gallery.spec.ts`      | axe on every section of `/dev/states`, one group of sections per test, and each group's heading outline |
| `keyboard.spec.ts`     | `/kamino` and `/build` from the keyboard alone, the focus seen at every stop                  |
| `layout.spec.ts`       | no sideways scroll at 360 px; a CLS of at most 0.01 while a page loads from its link          |
| `wallet-network.spec.ts` | what the app asks of the wallet's network: a wallet on Base is asked for no switch        |
| `pages.visual.ts`      | a whole-page screenshot of every scene, at 1440, 820 (some) and 390 px                        |
| `gallery.visual.ts`    | a screenshot of every section of `/dev/states`, at 1440 and 390 px                            |

| Helper              | What it is                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `support.ts`        | the `test` of every spec: the mocks, the mock wallet, and what fails a test (below)            |
| `console.ts`        | the console lines that are not the app's, each with its reason                                 |
| `axe.ts`            | the one axe audit: a page or a part of it, serious and critical violations fail                |
| `scenes.ts`         | fifteen states of the five pages, each reached as a person reaches it                          |
| `gallery.ts`        | the groups of `/dev/states` and how to open one                                                |
| `look.ts`           | a page that holds still (clock, fonts, images, its origin), and the measures of its layout     |
| `focus.ts`          | the keyboard walk: presses keys and judges every stop of the focus                             |
| `headings.ts`       | the heading outline: one h1, the page's title, and no level skipped                            |
| `servers.ts`        | the two servers and their ports                                                                |
| `visual.css`        | what a screenshot hides: the toasts                                                            |

## Running

From the repository root:

```sh
npm run e2e                 # behaviour, axe, keyboard, layout: the desktop, mobile and dev projects, about 5 minutes
npm run e2e:visual          # the screenshots: the visual-* projects, about 2 minutes
npm run e2e:update          # draws the screenshots that changed, to review before committing (below)
cd apps/web
npx playwright test -c e2e/playwright.config.ts run-states -g "state 13"   # one test
npx playwright test -c e2e/playwright.config.ts --project desktop --headed  # watch it
npx playwright test -c e2e/playwright.config.ts --ui                       # step through
npx playwright show-report e2e/report
npm run e2e:types           # tsc over the specs
npm run e2e:check           # Playwright, playwright-core and the Chromium build agree
```

| Variable               | Default            | What it does                                                                        |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `E2E_PORT`             | 5182               | the dev server's port                                                               |
| `E2E_PREVIEW_PORT`     | `E2E_PORT` + 1     | the preview server's port (the production build)                                    |
| `E2E_TARGET=dev`       |                    | the page tests on the dev server too, as before the build: slower, React's warnings |
| `E2E_REUSE=1`          |                    | takes a preview server already up, as it is: rebuild it yourself                    |
| `A11Y_STRICT=0`        | strict             | serious and critical axe violations are listed as annotations instead of failing    |
| `E2E_PIXEL_TOLERANCE`  | 0                  | the share of a screenshot's pixels that may differ (CI: 0.01)                       |

Several checkouts on one machine each take their own ports: `E2E_PORT=5391 E2E_PREVIEW_PORT=5384 npm run e2e`. Add
`-- --workers=2` while other suites run beside it.

The config starts its servers and stops them at the end: the dev server (`AURORA_KEY=test npx vite`), which outside CI
it reuses if one listens on the port, and the production build, built into `e2e/.dist` for every run and served by
`vite preview`. The key is fake: no test reaches a server's `/api`.

Chromium comes from `PLAYWRIGHT_BROWSERS_PATH` and must be the build of `@playwright/test` 1.63.0. The root
`package.json` pins `playwright-core` to that version (`@axe-core/playwright` would pull a newer one); `npm run
e2e:check` says whether the parts agree. Do not run `playwright install` to fix a mismatch on a machine whose browsers
are given; change the versions together.

A failure leaves, in `e2e/.results/`, a screenshot, `error-context.md` (the page as an ARIA tree, the quickest read) and a
trace with the actions, a screencast, the console and the network. The trace has no DOM snapshots: they store the 56 MB
of JavaScript the dev page loads, every test, and doubled the suite's time.

### Projects, servers and time

| Project          | Server      | What                                                                                       |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `desktop`        | build       | every spec but the gallery's, 1440×900                                                     |
| `mobile`         | build       | the tests tagged `@mobile`, Pixel 7: every page, axe, the AppKit modal, the deep link, a run |
| `dev`            | dev server  | `smoke.spec.ts` (React's warnings) and `gallery.spec.ts` (`/dev/states` is only there)     |
| `warm-dev`       | dev server  | opens every page once, so that the first tests there meet a warm server                    |
| `visual-desktop` | both        | the screenshots at 1440 px: pages from the build, the gallery from the dev server          |
| `visual-tablet`  | build       | the scenes marked `tablet`, at 820 px                                                      |
| `visual-mobile`  | both        | the screenshots at 390 px                                                                  |

A page of the build is ready in well under a second, where the dev server spends 5 to 20 s of CPU on each fresh browser:
that is why the page tests moved to the build. The dev server stays for what only it has. `mobile-webkit` (the in-app
browser of Telegram on iOS) is commented out until there is a WebKit for 1.63.0.

Time, on a 4-CPU machine shared with other suites (load average 7 to 12), 2 workers: `npm run e2e` (162 tests) 5 to 6
minutes, and `npm run e2e:visual` (44 tests) 2. Before the build, the 89 tests of then took 6.9 minutes on the dev
server. In CI (2 workers) the same commands run in the `e2e` and `visual` jobs of `.github/workflows/ci.yml`.

## What fails a test

Beyond its own assertions, `support.ts` fails every test that:

- printed a console error, warning or failed assert, or threw an uncaught exception. React prints its warnings as console
  errors of its development build, so the `dev` project catches them. `console.ts` lists the lines that are not the
  app's (Lit's dev mode, AppKit, the mocked `/api` answers, three lines of the SDK), each with its reason. Never add a
  line of the app's own there: fix it, or mark the test as a known bug (below).
- sent a request that no mock answered.

## Screenshots

`pages.visual.ts` takes every scene of `scenes.ts` as a whole page; `gallery.visual.ts` takes every section of
`/dev/states` on its own. The baselines are `__screenshots__/<project>/<file>/<name>.png`, 157 of them, drawn on Linux
with Playwright's Chromium. A picture is taken once the page holds still: the clock stopped at `look.ts` `FROZEN`, the
fonts and images in, animations and the caret off, the toasts hidden (`visual.css`), and the page's own origin, where it
is text, written as `https://connect.example` so that the ports of the machine do not show.

A baseline changes only with a person looking at it:

1. `npm run e2e:update` (or `-- pages.visual.ts -g kamino` for some) draws the pictures that differ and the missing ones.
2. Look at every changed picture in the diff of the commit (`git difftool`, or the pull request's image diff): it is
   what the judges will see. A change nobody meant is a bug, not a new baseline.
3. Commit the pictures with the change that made them, saying why they changed.

A scene or a section
that is gone leaves its picture behind: delete it by hand.

Locally a single pixel counts: the same machine draws the same pixels, run after run. Another machine rasterizes font
edges a little differently, so CI runs the screenshots with `E2E_PIXEL_TOLERANCE=0.01` in a job that does not block,
and uploads the diffs. If the runner's pictures differ beyond that, run that job by hand with `update-screenshots`: it
uploads the runner's own pictures, to review and commit as above.

## The keyboard

`keyboard.spec.ts` walks `/kamino` (an address, its positions, a target by the slider's arrows, the wallet in AppKit's
modal, a quote, the signature) and `/build` (an example, the instruction search, the accounts, the recipe, a simulation,
the export) with Tab, Shift+Tab, Enter, Space and the arrows alone. `focus.ts` judges every stop: before each key it notes
how every element that can take the focus looks (outline, shadow, border, colours, of the element and four ancestors,
pseudo elements, a slider's thumb), and after it, whether the element that took the focus looks different and whether
any part of it can be seen. The whole path is attached to the test, `UNSEEN` and `HIDDEN` marking the bad stops.

## Layout

`layout.spec.ts` opens every scene at 360 px and fails if the page scrolls sideways, naming the elements past the edge.
It also opens each scene that a link opens by itself (marked `link` in `scenes.ts`) at 1440 and 390 px and sums its
layout shifts (PerformanceObserver, the shifts no input caused): at most 0.01. The network gets 150 ms of latency, so
that what arrives first is the same every run.

## Known bugs

A new check that finds a bug gets `test.fixme(…, '…')` that says what is wrong; an existing test
is never loosened. When the fix lands, remove the fixme in the same change.

| Bug   | Test                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------- |
| QA-02 | `keyboard.spec.ts`: the run card keeps the focus on its buttons while they work                         |
| QA-09 | `wallet-network.spec.ts`: a wallet on Base stays on Base                                                |
| QA-08 | `gallery.spec.ts`: axe on the gallery section `kamino-fork`                                             |

## What answers the page

`support.ts` routes every request of a test's browser context:

| Request                                                      | Answered by                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `/api/intents-connect/*`, and `/api/v1/executions*` anywhere | `connect`, the fake Intents Connect (`mocks/connect.ts`)    |
| any other `/api/*`                                           | `api`, the app's own server (`mocks/api.ts`)                |
| AppKit, fonts, public RPCs                                   | stubs in `mocks/external.ts`                                |
| the page, its modules, Vite's socket                         | the preview server (the build) or the dev server            |
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
5. If a judge or a person will see the state, add it to `scenes.ts` as well: axe, the 360 px check and the screenshots
   then cover it. Its baseline comes from `npm run e2e:update`.

## After a deliberate change of words

The specs pin the words of the money flows on purpose: changing one is a change to review. When the change is meant:

1. `grep -rn "the old phrase" apps/web/e2e` and change it there, in the same commit as the UI.
2. If a page moved, change `paths.ts`.
3. If a role changed (a `status` that became an `alert`), change the helper call, not the phrase.

4. Run `npm run e2e:update` and review the pictures the new words changed (Screenshots, above).

The words the specs lean on most: "Connect wallet" (the run card's in `main`, the header's in the `banner`), "Get
exact amount and fee", "Sign and run", "Done: the instructions ran on Solana.", "Your intermediary on Solana:", the
phase texts of `PHASE_TEXT` in `src/features/run/execute.tsx`, "This wallet already has an execution in flight…", "You
started an execution from this browser:", "Resume it", "Delete it (a signature that moves no money)", "Your
intermediary holds … USDC.", "Refund", "Sign and refund", the figures of the quote card ("at least 776.16 USDC, …"),
and on `/kamino` "Read positions", "Target LTV, %" and "Repay $800.00, which is 800 USDC."
