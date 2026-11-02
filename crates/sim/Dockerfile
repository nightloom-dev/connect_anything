# The simulator of Connect Anything. Build from the root of the repository:
#   docker build -f crates/sim/Dockerfile -t connect-anything-sim .
# or let crates/sim/compose.yaml build it. See crates/sim/README.md.

# The image's Rust is the one rust-toolchain.toml pins, and Cargo.lock pins every crate.
# The full image, not slim: OpenSSL is built from source for litesvm's secp256r1 precompile, and that takes perl and make.
FROM rust:1.98.1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
# target/ outlives the build in a cache mount, and cargo trusts file times: a source older than the last build, as rsync -a
# or a tarball leaves it, would keep the old binary. So the simulator's own crate is always compiled again.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo clean --release -p sim && cargo build --release --locked -p sim && cp target/release/sim /usr/local/bin/sim

FROM debian:bookworm-slim
# rustls reads the system's root certificates to reach the RPC endpoint
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/sim /usr/local/bin/sim
USER nobody
# Inside the container it listens on every interface, and the published port decides who reaches it
ENV SIM_HOST=0.0.0.0 SIM_PORT=8790
EXPOSE 8790
ENTRYPOINT ["/usr/local/bin/sim"]
