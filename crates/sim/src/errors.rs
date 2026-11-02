//! A failed run, said in one line: which step, which program, the error's name from the IDL, and its message.

use std::collections::BTreeMap;

use serde_json::Value;
use sha2::{Digest, Sha256};
use solana_address::Address;
use solana_instruction_error::InstructionError;
use solana_message::Instruction;
use solana_transaction_error::TransactionError;

use crate::anchor_errors::ANCHOR_ERRORS;
use crate::types::SimError;

pub const SYSTEM: Address = Address::from_str_const("11111111111111111111111111111111");
pub const TOKEN: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022: Address = Address::from_str_const("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const ATA_PROGRAM: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/// spl-token-interface 2.0.0 TokenError. Token-2022 shares these codes and adds more after them.
const TOKEN_ERRORS: &[(&str, &str)] = &[
    ("NotRentExempt", "Lamport balance below rent-exempt threshold"),
    ("InsufficientFunds", "Insufficient funds"),
    ("InvalidMint", "Invalid Mint"),
    ("MintMismatch", "Account not associated with this Mint"),
    ("OwnerMismatch", "Owner does not match"),
    ("FixedSupply", "Fixed supply"),
    ("AlreadyInUse", "Already in use"),
    ("InvalidNumberOfProvidedSigners", "Invalid number of provided signers"),
    ("InvalidNumberOfRequiredSigners", "Invalid number of required signers"),
    ("UninitializedState", "State is uninitialized"),
    ("NativeNotSupported", "Instruction does not support native tokens"),
    ("NonNativeHasBalance", "Non-native account can only be closed if its balance is zero"),
    ("InvalidInstruction", "Invalid instruction"),
    ("InvalidState", "State is invalid for requested operation"),
    ("Overflow", "Operation overflowed"),
    ("AuthorityTypeNotSupported", "Account does not support specified authority type"),
    ("MintCannotFreeze", "This token mint cannot freeze accounts"),
    ("AccountFrozen", "Account is frozen"),
    ("MintDecimalsMismatch", "The provided decimals value different from the Mint decimals"),
    ("NonNativeNotSupported", "Instruction does not support non-native tokens"),
];

/// solana-system-interface SystemError.
const SYSTEM_ERRORS: &[(&str, &str)] = &[
    ("AccountAlreadyInUse", "An account with the same address already exists"),
    ("ResultWithNegativeLamports", "An account does not have enough SOL for the operation"),
    ("InvalidProgramId", "Cannot assign the account to this program id"),
    ("InvalidAccountDataLength", "Cannot allocate an account this big"),
    ("MaxSeedLengthExceeded", "The seed is longer than allowed"),
    ("AddressWithSeedMismatch", "The address does not match the derived seed"),
    ("NonceNoRecentBlockhashes", "The nonce has no recent blockhashes"),
    ("NonceBlockhashNotExpired", "The nonce blockhash has not expired"),
    ("NonceUnexpectedBlockhashValue", "The nonce blockhash is not the expected one"),
];

/// What the transaction was made of, to tell a step from what Connect adds around the steps.
pub struct Context<'a> {
    /// The steps as the request gave them.
    pub steps: &'a [Instruction],
    /// Instructions Connect puts before the steps: nonce, compute budget, accounts it opens.
    pub before: Vec<&'static str>,
    pub account_keys: Vec<Address>,
    pub idls: &'a BTreeMap<String, Value>,
    pub intermediary: Address,
    pub mint: Address,
    /// Programs that could not be loaded on the fork.
    pub load_problems: &'a [String],
}

pub fn explain(error: &TransactionError, logs: &[String], cx: &Context) -> SimError {
    match error {
        TransactionError::InstructionError(index, inner) => instruction_error(*index as usize, inner, logs, cx),
        TransactionError::InsufficientFundsForRent { account_index } => {
            let account = cx.account_keys.get(*account_index as usize);
            let whose = if account == Some(&cx.intermediary) {
                ". It is the intermediary, and Connect delivers it only the token, no SOL".to_string()
            } else {
                String::new()
            };
            SimError {
                message: format!(
                    "Account {} would be left with less SOL than rent requires{whose}",
                    account.map(ToString::to_string).unwrap_or_else(|| "?".into())
                ),
                ..Default::default()
            }
        }
        other => {
            let mut message = format!("The transaction was refused before any step ran: {other}");
            if matches!(other, TransactionError::ProgramAccountNotFound | TransactionError::InvalidProgramForExecution) && !cx.load_problems.is_empty() {
                message.push_str(&format!(" ({})", cx.load_problems.join("; ")));
            }
            SimError { message, ..Default::default() }
        }
    }
}

fn instruction_error(index: usize, error: &InstructionError, logs: &[String], cx: &Context) -> SimError {
    let failure = first_failure(logs);
    let anchor = failure.as_ref().and_then(|failure| last_anchor_error(&logs[..failure.line]));
    let detail = |program: Address| describe(program, error, anchor.as_ref(), cx.idls);

    if index < cx.before.len() {
        let program = failure.as_ref().map(|f| f.program).unwrap_or(SYSTEM);
        let (_, _, text) = detail(program);
        return SimError { message: format!("Connect's own {} failed before the steps: {text}", cx.before[index]), ..Default::default() };
    }
    let step = index - cx.before.len();
    let Some(instruction) = cx.steps.get(step) else {
        let program = failure.as_ref().map(|f| f.program).unwrap_or(TOKEN);
        let (_, _, text) = detail(program);
        return SimError {
            message: format!(
                "The steps ran, but then Connect could not take its fee in {} from the intermediary: {text}. A recipe has to leave the fee on the intermediary's account of the token it receives",
                cx.mint
            ),
            ..Default::default()
        };
    };

    let origin = failure.as_ref().map(|f| f.program).unwrap_or(instruction.program_id);
    let (code, name, text) = detail(origin);
    let mut message = format!("Step {} of {}", step + 1, cx.steps.len());
    if let Some(ix_name) = instruction_name(cx.idls.get(&instruction.program_id.to_string()), &instruction.data) {
        message.push_str(&format!(" ({ix_name})"));
    }
    message.push_str(" failed");
    if origin != instruction.program_id {
        message.push_str(&format!(" in {}", program_label(origin, cx.idls)));
    }
    message.push_str(&format!(": {text}"));
    if let Some(account) = anchor.as_ref().and_then(|anchor| anchor.account.as_ref()) {
        message.push_str(&format!(" (account {account})"));
    }
    if name.is_none() {
        if let Some(last) = last_program_logs(logs, failure.as_ref().map(|f| f.line).unwrap_or(logs.len())) {
            message.push_str(&format!(". Last log: {last}"));
        }
    }
    if origin == SYSTEM && code == Some(1) {
        message.push_str(". If the intermediary pays for a new account here, it has no SOL: Connect delivers only the token");
    }
    SimError { instruction_index: Some(step), program_id: Some(origin.to_string()), code, name, message }
}

/// The code, the name if anything names it, and a text of both.
fn describe(program: Address, error: &InstructionError, anchor: Option<&AnchorLog>, idls: &BTreeMap<String, Value>) -> (Option<u32>, Option<String>, String) {
    let InstructionError::Custom(code) = *error else {
        let debug = format!("{error:?}");
        let name = debug.split('(').next().unwrap_or(&debug).to_string();
        return (None, Some(name.clone()), format!("{name}: {error}"));
    };
    let idl = idls.get(&program.to_string());
    let named = idl
        .and_then(|idl| idl_error(idl, code))
        .or_else(|| (code < 6000 && (idl.is_some() || anchor.is_some())).then(|| anchor_framework_error(code)).flatten())
        .or_else(|| anchor.filter(|anchor| anchor.number == code).map(|anchor| (anchor.name.clone(), Some(anchor.message.clone()))))
        .or_else(|| {
            let table = if program == TOKEN || program == TOKEN_2022 {
                TOKEN_ERRORS
            } else if program == SYSTEM {
                SYSTEM_ERRORS
            } else {
                &[]
            };
            table.get(code as usize).map(|(name, message)| (name.to_string(), Some(message.to_string())))
        });
    match named {
        Some((name, Some(message))) if !message.is_empty() => (Some(code), Some(name.clone()), format!("{name}: {message}")),
        Some((name, _)) => (Some(code), Some(name.clone()), format!("{name} (error {code})")),
        None => {
            let whose = if idl.is_some() { "its IDL does not list it" } else { "the request has no IDL for this program" };
            (Some(code), None, format!("error {code} (0x{code:x}) of program {program}, and {whose}"))
        }
    }
}

fn idl_error(idl: &Value, code: u32) -> Option<(String, Option<String>)> {
    let error = idl.get("errors")?.as_array()?.iter().find(|error| error.get("code").and_then(Value::as_u64) == Some(code as u64))?;
    Some((error.get("name")?.as_str()?.to_string(), error.get("msg").and_then(Value::as_str).map(String::from)))
}

fn anchor_framework_error(code: u32) -> Option<(String, Option<String>)> {
    ANCHOR_ERRORS.iter().find(|(c, _, _)| *c == code).map(|(_, name, message)| (name.to_string(), Some(message.to_string())))
}

fn program_label(program: Address, idls: &BTreeMap<String, Value>) -> String {
    match program {
        p if p == TOKEN => "the Token program".into(),
        p if p == TOKEN_2022 => "the Token-2022 program".into(),
        p if p == SYSTEM => "the System program".into(),
        p if p == ATA_PROGRAM => "the Associated Token program".into(),
        p => idls
            .get(&p.to_string())
            .and_then(|idl| idl.pointer("/metadata/name").or_else(|| idl.get("name")))
            .and_then(Value::as_str)
            .map(|name| format!("{name} ({p})"))
            .unwrap_or_else(|| format!("program {p}")),
    }
}

/// The name of the instruction whose data this is, by its discriminator: given in a 0.30+ IDL, computed for a legacy one.
pub fn instruction_name(idl: Option<&Value>, data: &[u8]) -> Option<String> {
    let head = data.get(..8)?;
    idl?.get("instructions")?.as_array()?.iter().find_map(|ix| {
        let name = ix.get("name")?.as_str()?;
        let discriminator: Vec<u8> = match ix.get("discriminator").and_then(Value::as_array) {
            Some(bytes) => bytes.iter().filter_map(|byte| byte.as_u64().map(|byte| byte as u8)).collect(),
            None => Sha256::digest(format!("global:{}", snake_case(name)))[..8].to_vec(),
        };
        (discriminator == head).then(|| name.to_string())
    })
}

fn snake_case(name: &str) -> String {
    let mut out = String::new();
    for (i, c) in name.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.extend(c.to_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

pub struct Failure {
    /// The innermost program that failed: the first to say so, since the programs that called it say it after.
    pub program: Address,
    pub line: usize,
}

pub fn first_failure(logs: &[String]) -> Option<Failure> {
    logs.iter().enumerate().find_map(|(line, text)| {
        let (program, tail) = text.strip_prefix("Program ")?.split_once(' ')?;
        tail.starts_with("failed: ").then_some(())?;
        Some(Failure { program: program.parse().ok()?, line })
    })
}

#[derive(Debug, PartialEq)]
pub struct AnchorLog {
    pub account: Option<String>,
    pub name: String,
    pub number: u32,
    pub message: String,
}

/// `AnchorError caused by account: obligation. Error Code: ConstraintHasOne. Error Number: 2001. Error Message: ...`
/// and its forms without the account, `thrown in file:line` or `occurred`.
pub fn parse_anchor_error(line: &str) -> Option<AnchorLog> {
    let text = line.strip_prefix("Program log: ")?;
    if !text.starts_with("AnchorError") {
        return None;
    }
    let account = text.split_once("caused by account: ").and_then(|(_, rest)| rest.split_once(". Error Code: ")).map(|(account, _)| account.to_string());
    let (_, rest) = text.split_once("Error Code: ")?;
    let (name, rest) = rest.split_once(". Error Number: ")?;
    let (number, message) = rest.split_once(". Error Message: ")?;
    Some(AnchorLog { account, name: name.to_string(), number: number.trim().parse().ok()?, message: message.trim_end().trim_end_matches('.').to_string() })
}

fn last_anchor_error(logs: &[String]) -> Option<AnchorLog> {
    logs.iter().rev().find_map(|line| parse_anchor_error(line))
}

/// The last two lines programs logged before the failure, for an error nothing names.
fn last_program_logs(logs: &[String], end: usize) -> Option<String> {
    let lines: Vec<&str> = logs[..end.min(logs.len())].iter().rev().filter_map(|line| line.strip_prefix("Program log: ")).take(2).collect();
    if lines.is_empty() {
        return None;
    }
    let text: String = lines.into_iter().rev().collect::<Vec<_>>().join(" | ");
    Some(if text.chars().count() > 240 { format!("{}…", text.chars().take(240).collect::<String>()) } else { text })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const KLEND: Address = Address::from_str_const("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

    fn context<'a>(steps: &'a [Instruction], idls: &'a BTreeMap<String, Value>) -> Context<'a> {
        Context {
            steps,
            before: vec!["durable nonce", "compute unit limit", "compute unit price"],
            account_keys: vec![],
            idls,
            intermediary: Address::new_unique(),
            mint: Address::new_unique(),
            load_problems: &[],
        }
    }

    fn logs(lines: &[&str]) -> Vec<String> {
        lines.iter().map(|line| line.to_string()).collect()
    }

    #[test]
    fn reads_anchor_error_lines() {
        let line = "Program log: AnchorError caused by account: obligation. Error Code: ConstraintHasOne. Error Number: 2001. Error Message: A has one constraint was violated.";
        assert_eq!(
            parse_anchor_error(line),
            Some(AnchorLog {
                account: Some("obligation".into()),
                name: "ConstraintHasOne".into(),
                number: 2001,
                message: "A has one constraint was violated".into()
            })
        );
        let thrown = "Program log: AnchorError thrown in programs/klend/src/state/reserve.rs:120. Error Code: PriceTooOld. Error Number: 6017. Error Message: Price is too old.";
        assert_eq!(parse_anchor_error(thrown).unwrap().name, "PriceTooOld");
        assert_eq!(parse_anchor_error("Program log: Instruction: Repay"), None);
    }

    #[test]
    fn names_a_program_error_from_the_idl() {
        let idls = BTreeMap::from([(
            KLEND.to_string(),
            json!({ "address": KLEND.to_string(), "instructions": [{ "name": "refresh_obligation", "discriminator": [33, 132, 147, 228, 151, 192, 72, 89] }],
                    "errors": [{ "code": 6040, "name": "ObligationStale", "msg": "Obligation is stale" }] }),
        )]);
        let steps = [Instruction { program_id: KLEND, accounts: vec![], data: vec![33, 132, 147, 228, 151, 192, 72, 89] }];
        let lines = logs(&[
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD invoke [1]",
            "Program log: Instruction: RefreshObligation",
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD failed: custom program error: 0x1798",
        ]);
        let error = explain(&TransactionError::InstructionError(3, InstructionError::Custom(6040)), &lines, &context(&steps, &idls));
        assert_eq!(error.instruction_index, Some(0));
        assert_eq!(error.name.as_deref(), Some("ObligationStale"));
        assert_eq!(error.code, Some(6040));
        assert_eq!(error.message, "Step 1 of 1 (refresh_obligation) failed: ObligationStale: Obligation is stale");
    }

    #[test]
    fn names_a_framework_error_and_its_account() {
        let idls = BTreeMap::from([(KLEND.to_string(), json!({ "instructions": [], "errors": [] }))]);
        let steps = [Instruction { program_id: KLEND, accounts: vec![], data: vec![1; 8] }];
        let lines = logs(&[
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD invoke [1]",
            "Program log: AnchorError caused by account: obligation. Error Code: ConstraintHasOne. Error Number: 2001. Error Message: A has one constraint was violated.",
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD failed: custom program error: 0x7d1",
        ]);
        let error = explain(&TransactionError::InstructionError(3, InstructionError::Custom(2001)), &lines, &context(&steps, &idls));
        assert_eq!(error.name.as_deref(), Some("ConstraintHasOne"));
        assert_eq!(error.message, "Step 1 of 1 failed: ConstraintHasOne: A has one constraint was violated (account obligation)");
    }

    #[test]
    fn names_the_program_a_step_called_into() {
        let idls = BTreeMap::new();
        let steps = [Instruction { program_id: KLEND, accounts: vec![], data: vec![] }];
        let lines = logs(&[
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD invoke [1]",
            "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]",
            "Program log: Error: insufficient funds",
            "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: custom program error: 0x1",
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD failed: custom program error: 0x1",
        ]);
        let error = explain(&TransactionError::InstructionError(3, InstructionError::Custom(1)), &lines, &context(&steps, &idls));
        assert_eq!(error.name.as_deref(), Some("InsufficientFunds"));
        // the program whose error code 1 is: the Token program, which the step called, and not the step's own klend
        assert_eq!(error.program_id.as_deref(), Some("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"));
        assert_eq!(error.message, "Step 1 of 1 failed in the Token program: InsufficientFunds: Insufficient funds");
    }

    #[test]
    fn gives_the_last_logs_when_nothing_names_the_error() {
        let idls = BTreeMap::new();
        let steps = [Instruction { program_id: KLEND, accounts: vec![], data: vec![] }];
        let lines = logs(&[
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD invoke [1]",
            "Program log: something went wrong",
            "Program KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD failed: custom program error: 0x1771",
        ]);
        let error = explain(&TransactionError::InstructionError(3, InstructionError::Custom(6001)), &lines, &context(&steps, &idls));
        assert_eq!(error.name, None);
        assert!(error.message.ends_with("and the request has no IDL for this program. Last log: something went wrong"), "{}", error.message);
    }

    #[test]
    fn tells_the_fee_from_a_step() {
        let idls = BTreeMap::new();
        let steps = [Instruction { program_id: KLEND, accounts: vec![], data: vec![] }];
        let lines = logs(&["Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: custom program error: 0x1"]);
        let error = explain(&TransactionError::InstructionError(4, InstructionError::Custom(1)), &lines, &context(&steps, &idls));
        assert_eq!(error.instruction_index, None);
        assert!(error.message.starts_with("The steps ran, but then Connect could not take its fee"), "{}", error.message);
    }

    #[test]
    fn computes_legacy_discriminators() {
        let idl = json!({ "instructions": [{ "name": "refreshObligation" }] });
        assert_eq!(instruction_name(Some(&idl), &[33, 132, 147, 228, 151, 192, 72, 89, 0]), Some("refreshObligation".into()));
    }
}
