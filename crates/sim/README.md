# crates/sim: the simulator

The service the web's `SIM_URL` points to. It has two endpoints:

- `POST /simulate` runs a recipe's steps on a fork of Solana mainnet, inside the transaction Connect would send. It
  answers whether the recipe would pass, with its compute units, its size, the logs, and the error by name.
- `POST /idl/convert` turns a legacy (pre-0.30) Anchor IDL into the 0.30+ format with Anchor's own converter
  (`anchor-lang-idl`). `loadIdl` and `parseIdl` in `packages/core` call it for a legacy IDL, such as klend's on chain.

The contract is defined in `packages/core/src/sim.ts` and `src/types.rs`, and the examples in `../../fixtures` are its
source of truth. The simulator never sends a transaction: the only RPC method it calls is `getMultipleAccounts`.

## Run it from zero

You need git, a C toolchain with make and perl, Rust from [rustup](https://rustup.rs), and an RPC URL for mainnet. The
public endpoint works but rate-limits, so a Helius URL is better. The C toolchain links the binary and builds OpenSSL
from source for litesvm's secp256r1 precompile, which is why make and perl are needed. `rust-toolchain.toml` makes rustup
fetch Rust 1.98.1, the version litesvm 0.18.1 needs, on the first build. `Cargo.lock` pins every crate, including
Solana's 4.3 line.

On Debian or Ubuntu:

```bash
sudo apt-get install -y build-essential perl git curl jq
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
git clone https://github.com/nightloom-dev/connect_anything.git
cd connect_anything
cp crates/sim/.env.example crates/sim/.env      # fill in SOLANA_RPC_URL and SIM_TOKEN
set -a; . crates/sim/.env; set +a
cargo run --release -p sim                      # the first build takes a few minutes
```

In another terminal, from the same folder:

```bash
set -a; . crates/sim/.env; set +a              # for SIM_TOKEN, without which /simulate answers 401
curl -s localhost:8790/health                   # {"ok":true}
curl -sS localhost:8790/simulate -H 'content-type: application/json' -H "x-sim-token: $SIM_TOKEN" \
  --data-binary @fixtures/klend-repay.sim.json | jq '{verdict, computeUnits, txBytes, warnings, error}'
```

The second call repays a live Kamino position on a fork. Expect `"verdict": "ok"`, about 116k compute units and 934
bytes. Then point the web at the simulator in `apps/web/.env`: `SIM_URL=http://127.0.0.1:8790`, and the same
`SIM_TOKEN`.

| Variable         | Default                               | What it does                                                 |
| ---------------- | ------------------------------------- | ------------------------------------------------------------ |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Mainnet RPC to read accounts from. Errors never show the URL, so a key in it stays out of logs and answers |
| `SIM_TOKEN`      | none                                  | When set, `/simulate` and `/idl/convert` require it in `x-sim-token` and answer 401 without it. `/health` is open |
| `SIM_HOST`       | `127.0.0.1`                           | The address to listen on                                     |
| `SIM_PORT`       | `8790`                                | The port                                                     |
| `RUST_LOG`       | `sim=info`                            | Log filter. Each simulation logs its slot, CU, bytes and verdict, never the RPC URL |

The original spec (`TZ.md`) also names `SURFPOOL_URL`. It is not used; see
[Why LiteSVM and not Surfpool](#why-litesvm-and-not-surfpool).

## Deploy on a VPS

The simulator is one stateless binary that needs outbound HTTPS to the RPC. Each simulation is a fork in memory. The
process uses about 200 MB and runs as many forks at once as the machine has cores, at least two. The limits below keep
a busy or hostile caller from taking more than that. Building takes 4 GB of RAM (or swap) and about 6 GB of disk;
running takes far less. A server too small to build on can load an image built elsewhere:
`docker save connect-anything-sim | ssh vps docker load`.

### Docker compose, next to the web

```bash
git clone https://github.com/nightloom-dev/connect_anything.git
cd connect_anything
cp crates/sim/.env.example crates/sim/.env      # SOLANA_RPC_URL, and SIM_TOKEN from: openssl rand -hex 32
docker compose -f crates/sim/compose.yaml up -d --build
curl -s localhost:8790/health                   # {"ok":true}
```

`compose.yaml` publishes the port on `127.0.0.1` only. The web on the same server reaches it at
`SIM_URL=http://127.0.0.1:8790`, and nothing outside the server can reach it at all. The container is read-only, drops
every capability, runs as `nobody`, is capped at 2 GB, and restarts unless stopped.

- Update: `git pull && docker compose -f crates/sim/compose.yaml up -d --build`
- Logs: `docker compose -f crates/sim/compose.yaml logs -f`

### When the web runs elsewhere

Publish the simulator through a TLS proxy and keep `SIM_TOKEN` set: without TLS the token travels in clear text. With
[Caddy](https://caddyserver.com), which obtains the certificate itself, this is the whole config:

```
sim.example.com {
    reverse_proxy 127.0.0.1:8790
}
```

The web then uses `SIM_URL=https://sim.example.com`.

### systemd, without Docker

The build needs the packages and the Rust toolchain from [Run it from zero](#run-it-from-zero).

```bash
cargo build --release --locked -p sim
sudo install -m 755 target/release/sim /usr/local/bin/connect-anything-sim
sudo install -m 600 -D crates/sim/.env /etc/connect-anything/sim.env
sudo install -m 644 crates/sim/deploy/connect-anything-sim.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now connect-anything-sim
journalctl -u connect-anything-sim -f
```

The unit runs the simulator as a throwaway user with a read-only file system, and restarts it on failure. It listens on
`127.0.0.1:8790` unless `sim.env` sets `SIM_HOST` and `SIM_PORT`.

## What a simulation does

1. **Checks the request.** A malformed one gets a 400 with `{message}`, which the web shows as is.
2. **Refuses what Connect refuses**, with a `fail` verdict: a ComputeBudget step, a durable nonce step, a step without
   accounts, or a signer other than the intermediary. Steps with more than 128 accounts between them get the same,
   since no transaction can lock that many.
3. **Reads mainnet at one slot** with `getMultipleAccounts`, 100 accounts per call. A recipe's accounts fit in one call,
   so they all come from the same slot. It reads every account of the steps, the mint, the intermediary's token accounts
   and the lookup tables, together with the sysvars Clock, Rent, EpochSchedule, SlotHashes, EpochRewards and
   LastRestartSlot. It also reads the binary of each upgradeable program and caches it until the program is redeployed.
   Mainnet's feature gates are read once an hour.
4. **Forks.** A new LiteSVM instance gets those accounts, mainnet's clock and its feature gates. The intermediary gets an
   associated token account of `fund.mint` holding `fund.amount` plus one unit for Connect's fee. It gets no SOL,
   because Connect delivers only the token.
5. **Builds the transaction Connect would send**, in this order:
   - `AdvanceNonceAccount`, with the fee payer as the nonce authority.
   - `SetComputeUnitLimit` and `SetComputeUnitPrice`.
   - An opening of each missing token account of the intermediary that a step writes and whose mint the same step
     references.
   - The steps. A token account that a step opens with the intermediary as funder is paid for by the fee payer.
   - Connect's fee: a `TransferChecked` of the delivered token from the intermediary to the relayer.

   The message is legacy, or v0 when the request has lookup tables, with two signatures: the fee payer's and the
   intermediary's.
6. **Answers.** `computeUnits` and `txBytes` cover the whole transaction. Over 200,000 CU or 1232 bytes adds a warning,
   and the warning on bytes says whether the steps alone would fit. The verdict is `fail` when there is an error, `warn`
   when there are only warnings, and `ok` otherwise.

A step whose program does not exist on mainnet, is not a program, or is closed fails before the fork, named by its
index. When there is no verdict, the answer is a `{message}` with one of these statuses:

| Status | When |
| ------ | ---- |
| 400 | The request is malformed, or larger than the limits below allow |
| 401 | `SIM_TOKEN` is set and `x-sim-token` is missing or wrong |
| 413 | The body is over 4 MB. Answered in plain text; the web refuses such a body itself |
| 422 | The transaction reaches more upgradeable programs than one fork loads |
| 503 | Mainnet could not be read, or not within 50 s, or the simulator is busy. Worth another try |
| 500 | The simulator itself failed |

### Limits

Each limit caps what a single request can cost, well above what a recipe needs.

| What | Limit | Past it |
| ---- | ----- | ------- |
| Request body | 4 MB, the same as the web's | 413 |
| Steps | 50 | 400 |
| Accounts in a step | 255, the runtime's limit | 400 |
| Data of a step | 1232 bytes, a whole transaction | 400 |
| Lookup tables | 16 | 400 |
| Accounts across the steps | 128, what a transaction can lock | `fail` |
| Upgradeable programs in the transaction, token programs included | 16, each a binary of up to 10 MB to read and load | 422 |
| Time for a simulation | 50 s, before the web gives up at 60 s | 503 |
| Simulations at once | one per core, at least two | wait |
| Waiting for a turn | 4 per running slot, each for at most 20 s | 503, busy |
| Program binaries kept | 256 MB, least recently used dropped first | read again |

An error is located and named as precisely as the request allows, for example
`Step 4 of 4 (repay_obligation_liquidity_v2) failed: ConstraintHasOne: A has one constraint was violated (account obligation)`.
The failing program is the deepest one in the logs, so an error inside a CPI is attributed to the program that raised
it. The name comes from these sources, in order:

1. The program's IDL in `idls`, for codes from 6000 up.
2. Anchor's table, for codes below 6000.
3. The `AnchorError` line in the logs, which also names the account.
4. The SPL Token and System programs.

If none of these names the error, the message gives the code and the last log lines. An error in one of Connect's own
instructions or in its fee says so, for example when the steps spent the whole token and left nothing for the fee.

### The model of Connect

Connect's docs (Solana as destination) list what it adds: a durable nonce, the compute budget, the opening of the
intermediary's missing token accounts, and its relayer's fee in the delivered token. The 200k CU and 1232 bytes limit
that whole transaction. The docs do not name the exact instructions, so the four above are the simulator's assumption.
`src/simulate.rs` keeps them in one place, `assemble`. With them, the repay of a plain Kamino position measures 116k CU
and 934 bytes, of which Connect's part is about 555 CU and 200 bytes.

## Why LiteSVM and not Surfpool

The original spec asks for Surfpool and allows LiteSVM as the fallback, which is what this uses. Surfpool keeps the
first copy of every account it reads. Within minutes the oracle prices on the fork go stale, and klend's
`refresh_reserve` rejects them, so a repay that passes on mainnet fails there. Concurrent requests would also share, and
race on, the intermediary's balance. A new fork per request reads prices, reserves and the clock at one slot. That takes
0.3–0.4 s once program binaries are cached and about 2 s cold, with nothing else to run next to the binary.

## Tests

```bash
cargo test -p sim                                                  # offline
SOLANA_RPC_URL=... cargo test -p sim --release -- --ignored        # every fixture again, on mainnet as it is now
```

The offline tests check that:

- every fixture follows the contract;
- the on-chain klend IDL converts into `recipes/kamino-rescue/klend.idl.json`;
- errors are named;
- bytes are counted as on the wire;
- a lookup table is used only if it is live: a wallet, a deactivated table or a missing account is refused;
- malformed requests are refused, and so are requests that no transaction can hold;
- what Connect refuses is a `fail`, a step without accounts included;
- a step runs on a fork built without mainnet, from the programs LiteSVM ships with, with every instruction Connect adds;
- an account of the intermediary that holds only SOL is still opened, before the steps or in the transaction;
- a step whose program is missing, not a program, or closed is named by its index;
- both routes require `x-sim-token`, and a full queue answers busy at once.

One fixture passes a lookup table, so the fork test also runs a v0 message.
