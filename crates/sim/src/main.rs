//! The simulator of Connect Anything: POST /simulate and POST /idl/convert. See crates/sim/README.md.

mod anchor_errors;
mod convert;
mod errors;
mod fork;
mod rpc;
mod simulate;
mod types;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tokio::sync::Semaphore;
use tracing_subscriber::EnvFilter;

use crate::types::SimRequest;

#[derive(Clone)]
struct App {
    rpc: rpc::Rpc,
    cache: Arc<fork::Cache>,
    token: Option<Arc<str>>,
    /// Forks are memory-heavy: only so many at once.
    permits: Arc<Semaphore>,
}

fn message(status: StatusCode, text: impl Into<String>) -> Response {
    (status, Json(json!({ "message": text.into() }))).into_response()
}

async fn simulate_route(State(app): State<App>, body: Bytes) -> Response {
    let started = Instant::now();
    let request: SimRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return message(StatusCode::BAD_REQUEST, format!("Not a simulation request: {error}")),
    };
    let parsed = match simulate::parse(&request) {
        Ok(parsed) => parsed,
        Err(problem) => return message(StatusCode::BAD_REQUEST, format!("Not a simulation request: {problem}")),
    };
    let Ok(_permit) = app.permits.acquire().await else {
        return message(StatusCode::SERVICE_UNAVAILABLE, "The simulator is shutting down");
    };
    match simulate::simulate(&app.rpc, &app.cache, parsed, request.idls.unwrap_or_default()).await {
        Ok(result) => {
            tracing::info!(ms = started.elapsed().as_millis() as u64, "simulate answered");
            Json(result).into_response()
        }
        Err(problem) => {
            tracing::warn!("simulate could not run: {problem}");
            message(StatusCode::SERVICE_UNAVAILABLE, format!("The simulator could not read mainnet: {problem}"))
        }
    }
}

async fn convert_route(body: Bytes) -> Response {
    match convert::convert(&body) {
        Ok(idl) => Json(idl).into_response(),
        Err(problem) => message(StatusCode::BAD_REQUEST, problem),
    }
}

/// With SIM_TOKEN set, every route but /health wants it in x-sim-token.
async fn require_token(State(app): State<App>, request: Request, next: Next) -> Response {
    if let Some(token) = &app.token {
        let given = request.headers().get("x-sim-token").map(|value| value.as_bytes()).unwrap_or_default();
        if !same(given, token.as_bytes()) {
            return message(StatusCode::UNAUTHORIZED, "Missing or wrong x-sim-token");
        }
    }
    next.run(request).await
}

/// Compares in time that does not depend on where the two differ.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |diff, (x, y)| diff | (x ^ y)) == 0
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("sim=info"))).init();

    let rpc_url = env("SOLANA_RPC_URL").unwrap_or_else(|| {
        tracing::warn!("SOLANA_RPC_URL is not set: using the public endpoint, which rate-limits");
        "https://api.mainnet-beta.solana.com".into()
    });
    let token = env("SIM_TOKEN").map(Arc::from);
    if token.is_none() {
        tracing::warn!("SIM_TOKEN is not set: whoever reaches the port can use the simulator");
    }
    let host = env("SIM_HOST").unwrap_or_else(|| "127.0.0.1".into());
    let port: u16 = env("SIM_PORT").map(|port| port.parse().expect("SIM_PORT is a port number")).unwrap_or(8790);
    let parallel = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).max(2);

    let app = App { rpc: rpc::Rpc::new(rpc_url), cache: Arc::new(fork::Cache::default()), token, permits: Arc::new(Semaphore::new(parallel)) };
    let router = Router::new()
        .route("/simulate", post(simulate_route))
        .route("/idl/convert", post(convert_route))
        .route_layer(middleware::from_fn_with_state(app.clone(), require_token))
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .layer(DefaultBodyLimit::max(16 << 20))
        .with_state(app);

    let address: SocketAddr = format!("{host}:{port}").parse().expect("SIM_HOST and SIM_PORT make an address");
    let listener = tokio::net::TcpListener::bind(address).await.unwrap_or_else(|error| panic!("cannot listen on {address}: {error}"));
    tracing::info!("simulator listening on http://{address}");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("the server");
}

#[cfg(test)]
mod tests {
    use super::same;

    #[test]
    fn compares_tokens() {
        assert!(same(b"secret", b"secret"));
        assert!(!same(b"secret", b"secreT"));
        assert!(!same(b"secret", b"secret!"));
        assert!(!same(b"", b"secret"));
    }
}
