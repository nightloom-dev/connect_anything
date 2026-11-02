//! The /simulate contract, kept in step with packages/core/src/sim.ts. fixtures/*.sim.json are the source of truth.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimRequest {
    /// Base58. In simulation any key stands in for {INTERMEDIARY}.
    pub intermediary: String,
    /// What Connect delivers to the intermediary before the steps run.
    pub fund: Fund,
    pub instructions: Vec<SimInstruction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lookup_tables: Option<Vec<String>>,
    /// Program id to IDL, used to name errors.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idls: Option<BTreeMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fund {
    pub mint: String,
    /// Amount in minimal units, as a decimal string.
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimInstruction {
    pub program_id: String,
    pub accounts: Vec<SimAccountMeta>,
    /// Base64.
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimAccountMeta {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Ok,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimResult {
    pub verdict: Verdict,
    /// Everything the transaction Connect would send consumes, the instructions it adds included.
    pub compute_units: u64,
    /// The transaction Connect would send, its nonce, compute budget and fee instructions and two signatures included.
    pub tx_bytes: usize,
    pub logs: Vec<String>,
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<SimError>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimError {
    /// Index into the request's `instructions`. Absent when the failure is not in one of them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instruction_index: Option<usize>,
    /// The program that failed, whose error `code` and `name` are: the step's own, or one the step called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub program_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// One line for a person.
    pub message: String,
}

impl SimResult {
    pub fn failed(message: impl Into<String>) -> Self {
        SimResult {
            verdict: Verdict::Fail,
            compute_units: 0,
            tx_bytes: 0,
            logs: vec![],
            warnings: vec![],
            error: Some(SimError { message: message.into(), ..Default::default() }),
        }
    }
}
