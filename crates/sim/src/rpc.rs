//! The few mainnet reads a fork needs, over plain JSON-RPC.

use std::time::Duration;

use base64::Engine;
use serde_json::{json, Value};
use solana_account::Account;
use solana_address::Address;

const BATCH: usize = 100; // getMultipleAccounts takes at most 100 keys
const ATTEMPTS: u32 = 4;

#[derive(Clone)]
pub struct Rpc {
    http: reqwest::Client,
    url: String,
}

impl Rpc {
    pub fn new(url: String) -> Self {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(30)).build().expect("an HTTP client");
        Rpc { http, url }
    }

    /// Errors never carry the URL: it holds the API key, and messages reach the browser.
    async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
        let mut last = String::new();
        for attempt in 0..ATTEMPTS {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(400 << attempt)).await;
            }
            let response = match self.http.post(&self.url).json(&body).send().await {
                Ok(response) => response,
                Err(error) => {
                    last = format!("the Solana RPC did not answer: {}", error.without_url());
                    continue;
                }
            };
            let status = response.status();
            if status.as_u16() == 429 || status.is_server_error() {
                last = format!("the Solana RPC answered {status}");
                continue;
            }
            let reply: Value = response.json().await.map_err(|error| format!("the Solana RPC answered {status} with no JSON: {}", error.without_url()))?;
            if let Some(error) = reply.get("error") {
                return Err(format!("the Solana RPC refused {method}: {}", error.get("message").and_then(Value::as_str).unwrap_or("no message")));
            }
            return reply.get("result").cloned().ok_or_else(|| format!("the Solana RPC gave no result for {method}"));
        }
        Err(last)
    }

    /// Accounts at one slot per batch of 100, None where nothing is stored. `slice` reads only (offset, length) of the data.
    pub async fn get_multiple_accounts(&self, keys: &[Address], slice: Option<(usize, usize)>) -> Result<(u64, Vec<Option<Account>>), String> {
        let mut slot = 0;
        let mut accounts = Vec::with_capacity(keys.len());
        for batch in keys.chunks(BATCH) {
            let mut config = json!({ "encoding": "base64", "commitment": "confirmed" });
            if let Some((offset, length)) = slice {
                config["dataSlice"] = json!({ "offset": offset, "length": length });
            }
            let keys: Vec<String> = batch.iter().map(ToString::to_string).collect();
            let result = self.call("getMultipleAccounts", json!([keys, config])).await?;
            slot = slot.max(result.pointer("/context/slot").and_then(Value::as_u64).unwrap_or(0));
            let values = result.get("value").and_then(Value::as_array).ok_or("the Solana RPC gave no accounts")?;
            if values.len() != batch.len() {
                return Err("the Solana RPC gave a different number of accounts than asked".into());
            }
            for value in values {
                accounts.push(if value.is_null() { None } else { Some(parse_account(value)?) });
            }
        }
        Ok((slot, accounts))
    }
}

fn parse_account(value: &Value) -> Result<Account, String> {
    let bad = || "the Solana RPC gave a malformed account".to_string();
    let data = value.pointer("/data/0").and_then(Value::as_str).ok_or_else(bad)?;
    Ok(Account {
        lamports: value.get("lamports").and_then(Value::as_u64).ok_or_else(bad)?,
        data: base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| bad())?,
        owner: value.get("owner").and_then(Value::as_str).and_then(|owner| owner.parse().ok()).ok_or_else(bad)?,
        executable: value.get("executable").and_then(Value::as_bool).unwrap_or(false),
        rent_epoch: value.get("rentEpoch").and_then(Value::as_u64).unwrap_or(u64::MAX),
    })
}
