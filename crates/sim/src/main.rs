//! The simulator of Connect Anything: POST /simulate and POST /idl/convert. See crates/sim/README.md.

mod anchor_errors;
mod convert;
mod errors;
mod fork;
mod rpc;
mod simulate;
mod types;

use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tracing_subscriber::EnvFilter;

use crate::simulate::Failure;
use crate::types::SimRequest;

/// A simulation takes a few seconds. Past this, mainnet is too slow to read, and the answer is 503, before the web's
/// own 60 s run out.
const DEADLINE: Duration = Duration::from_secs(50);
/// How long a request waits for a free slot.
const WAIT: Duration = Duration::from_secs(20);
/// As the web's own limit: klend's IDL, one of the largest, is 240 KB.
const MAX_BODY: usize = 4 << 20;

#[derive(Clone)]
struct App {
    rpc: rpc::Rpc,
    cache: Arc<fork::Cache>,
    token: Option<Arc<str>>,
    /// Forks are memory-heavy: only so many at once, and only so many waiting for one.
    slots: Arc<Semaphore>,
    waiting: Arc<AtomicUsize>,
    queue: usize,
}

impl App {
    fn new(rpc_url: String, token: Option<Arc<str>>, parallel: usize) -> Self {
        let slots = Arc::new(Semaphore::new(parallel));
        App { rpc: rpc::Rpc::new(rpc_url), cache: Arc::default(), token, slots, waiting: Arc::default(), queue: 4 * parallel }
    }

    /// A slot to run a fork in, or None when the simulator is busy: the queue is full, or no slot came free in time.
    async fn slot(&self) -> Option<OwnedSemaphorePermit> {
        if let Ok(slot) = self.slots.clone().try_acquire_owned() {
            return Some(slot);
        }
        let _waiting = Waiting::join(&self.waiting, self.queue)?;
        tokio::time::timeout(WAIT, self.slots.clone().acquire_owned()).await.ok()?.ok()
    }
}

/// A request in the queue, counted until it leaves, also when its client goes away first.
struct Waiting<'a>(&'a AtomicUsize);

impl<'a> Waiting<'a> {
    fn join(count: &'a AtomicUsize, queue: usize) -> Option<Self> {
        if count.fetch_add(1, Ordering::SeqCst) >= queue {
            count.fetch_sub(1, Ordering::SeqCst);
            return None;
        }
        Some(Waiting(count))
    }
}

impl Drop for Waiting<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn json_error(status: StatusCode, text: impl Into<String>) -> Response {
    (status, Json(json!({ "message": text.into() }))).into_response()
}

async fn simulate_route(State(app): State<App>, body: Bytes) -> Response {
    let started = Instant::now();
    let request: SimRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, format!("Not a simulation request: {error}")),
    };
    let parsed = match simulate::parse(&request) {
        Ok(parsed) => parsed,
        Err(problem) => return json_error(StatusCode::BAD_REQUEST, format!("Not a simulation request: {problem}")),
    };
    let Some(slot) = app.slot().await else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "The simulator is busy: try again in a few seconds");
    };
    let run = simulate::simulate(&app.rpc, &app.cache, parsed, request.idls.unwrap_or_default(), slot);
    match tokio::time::timeout(DEADLINE, run).await {
        Ok(Ok(result)) => {
            tracing::info!(ms = started.elapsed().as_millis() as u64, "simulate answered");
            Json(result).into_response()
        }
        Ok(Err(Failure::Mainnet(problem))) => {
            tracing::warn!("simulate could not read mainnet: {problem}");
            json_error(StatusCode::SERVICE_UNAVAILABLE, format!("The simulator could not read mainnet: {problem}"))
        }
        Ok(Err(Failure::Unsupported(problem))) => json_error(StatusCode::UNPROCESSABLE_ENTITY, problem),
        Ok(Err(Failure::Internal(problem))) => {
            tracing::error!("simulate failed: {problem}");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, problem)
        }
        Err(_) => {
            tracing::warn!("simulate gave up after {} s", DEADLINE.as_secs());
            json_error(StatusCode::SERVICE_UNAVAILABLE, format!("The simulator gave up after {} s: mainnet was too slow to read", DEADLINE.as_secs()))
        }
    }
}

async fn convert_route(body: Bytes) -> Response {
    match convert::convert(&body) {
        Ok(idl) => Json(idl).into_response(),
        Err(problem) => json_error(StatusCode::BAD_REQUEST, problem),
    }
}

/// With SIM_TOKEN set, every route but /health wants it in x-sim-token.
async fn require_token(State(app): State<App>, request: Request, next: Next) -> Response {
    if let Some(token) = &app.token {
        let given = request.headers().get("x-sim-token").map(|value| value.as_bytes()).unwrap_or_default();
        if !constant_time_eq(given, token.as_bytes()) {
            return json_error(StatusCode::UNAUTHORIZED, "Missing or wrong x-sim-token");
        }
    }
    next.run(request).await
}

/// Compares two tokens in constant time, so the time taken does not reveal where they differ.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
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

    let address: SocketAddr = format!("{host}:{port}").parse().expect("SIM_HOST and SIM_PORT make an address");
    let listener = tokio::net::TcpListener::bind(address).await.unwrap_or_else(|error| panic!("cannot listen on {address}: {error}"));
    tracing::info!("simulator listening on http://{address}, {parallel} simulations at once");
    axum::serve(listener, router(App::new(rpc_url, token, parallel)))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("the server stopped with an error");
}

fn router(app: App) -> Router {
    Router::new()
        .route("/simulate", post(simulate_route))
        .route("/idl/convert", post(convert_route))
        .route_layer(middleware::from_fn_with_state(app.clone(), require_token))
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .layer(DefaultBodyLimit::max(MAX_BODY))
        .with_state(app)
}

/// Docker and systemd stop a service with SIGTERM, a terminal with SIGINT. As PID 1 in a container, a signal without a
/// handler is ignored, and `docker stop` would wait ten seconds and kill it.
async fn shutdown_signal() {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("cannot install the SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
    tracing::info!("shutting down: finishing the requests in flight");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use tower::ServiceExt;

    #[test]
    fn compares_tokens() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secreT"));
        assert!(!constant_time_eq(b"secret", b"secret!"));
        assert!(!constant_time_eq(b"", b"secret"));
    }

    #[tokio::test]
    async fn wants_the_token_on_both_routes() {
        // nothing here reads mainnet: the bodies are refused before that
        let app = App::new("http://127.0.0.1:9".into(), Some("secret".into()), 2);
        for path in ["/simulate", "/idl/convert"] {
            for token in [None, Some("wrong"), Some("secret")] {
                let mut request = Request::post(path).header("content-type", "application/json");
                if let Some(token) = token {
                    request = request.header("x-sim-token", token);
                }
                let response = router(app.clone()).oneshot(request.body(Body::from("{}")).unwrap()).await.unwrap();
                let expected = if token == Some("secret") { StatusCode::BAD_REQUEST } else { StatusCode::UNAUTHORIZED };
                assert_eq!(response.status(), expected, "{path} with {token:?}");
            }
        }
        let health = router(app).oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(health.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn turns_away_what_the_queue_cannot_hold() {
        let mut app = App::new("http://127.0.0.1:9".into(), None, 1);
        app.queue = 0;
        let running = app.slot().await.expect("the one slot");
        assert!(app.slot().await.is_none(), "no slot and no room in the queue: busy at once");
        drop(running);
        assert!(app.slot().await.is_some());
        assert_eq!(app.waiting.load(Ordering::SeqCst), 0);
    }
}
