//! POST /simulate: the steps of a recipe in the transaction Connect would send, run on a fork of mainnet.
//!
//! What Connect adds, from its docs (developer-guides/solana/using-solana-as-destination): it pins the transaction to a
//! durable nonce, sets the compute budget, opens a missing account of the intermediary that a step writes next to its
//! mint, pays any account a step opens with the intermediary as funder, and appends the fee its relayer (Kora) takes in
//! the delivered token from the intermediary. The 200k compute units and 1232 bytes are for that whole transaction.
//! The docs do not name the exact instructions, so these are the assumptions, all in `assemble`:
//! - AdvanceNonceAccount first, with the fee payer as the nonce authority, so two signatures: fee payer and intermediary;
//! - SetComputeUnitLimit and SetComputeUnitPrice;
//! - the fee as TransferChecked from the intermediary's account of the token to an account of the relayer.

use std::collections::{BTreeMap, HashSet};

use base64::Engine;
use litesvm::LiteSVM;
use serde_json::Value;
use sha2::{Digest, Sha256};
use solana_account::Account;
use solana_address::Address;
use solana_message::{legacy, v0, AccountMeta, AddressLookupTableAccount, Hash, Instruction, VersionedMessage};
use solana_signature::Signature;
use solana_transaction::versioned::VersionedTransaction;

use crate::errors::{self, ATA_PROGRAM, SYSTEM, TOKEN, TOKEN_2022};
use crate::fork::{self, Cache, Snapshot};
use crate::rpc::Rpc;
use crate::types::{SimError, SimRequest, SimResult, Verdict};

pub const CU_LIMIT: u64 = 200_000;
pub const TX_LIMIT: usize = 1232;
const MAX_STEPS: usize = 50;
const MAX_LOOKUP_TABLES: usize = 16;
/// The run itself may take everything a transaction can, so that a recipe over Connect's budget still shows its cost.
const MEASURE_CU_LIMIT: u32 = 1_400_000;
/// The relayer's fee in atomic units of the delivered token. Its size does not change the cost, one unit is enough.
const RELAYER_FEE: u64 = 1;

const COMPUTE_BUDGET: Address = Address::from_str_const("ComputeBudget111111111111111111111111111111");
const RECENT_BLOCKHASHES: Address = Address::from_str_const("SysvarRecentB1ockHashes11111111111111111111");
const NATIVE_MINT: Address = Address::from_str_const("So11111111111111111111111111111111111111112");
const LOOKUP_TABLE_META: usize = 56;

/// A request that is well formed, in the types the run needs.
pub struct Parsed {
    pub intermediary: Address,
    pub mint: Address,
    pub amount: u64,
    pub steps: Vec<Instruction>,
    pub lookup_tables: Vec<Address>,
}

/// What makes a request malformed, answered with 400. A recipe Connect would refuse is a `fail` verdict instead.
pub fn parse(request: &SimRequest) -> Result<Parsed, String> {
    let key = |what: &str, text: &str| text.parse::<Address>().map_err(|_| format!("{what} is not a public key"));
    let intermediary = key("intermediary", &request.intermediary)?;
    let mint = key("fund.mint", &request.fund.mint)?;
    let amount = &request.fund.amount;
    let amount = (!amount.is_empty() && amount.len() <= 20 && amount.bytes().all(|b| b.is_ascii_digit()))
        .then(|| amount.parse::<u64>().ok())
        .flatten()
        .ok_or("fund.amount is not a u64 as a decimal string")?;
    if request.instructions.is_empty() || request.instructions.len() > MAX_STEPS {
        return Err(format!("instructions is not a list of 1 to {MAX_STEPS}"));
    }
    let mut steps = Vec::with_capacity(request.instructions.len());
    for (i, ix) in request.instructions.iter().enumerate() {
        let program_id = key(&format!("instructions[{i}].programId"), &ix.program_id)?;
        let data = base64::engine::general_purpose::STANDARD.decode(&ix.data).map_err(|_| format!("instructions[{i}].data is not base64"))?;
        let mut accounts = Vec::with_capacity(ix.accounts.len());
        for (j, meta) in ix.accounts.iter().enumerate() {
            let pubkey = key(&format!("instructions[{i}].accounts[{j}].pubkey"), &meta.pubkey)?;
            accounts.push(AccountMeta { pubkey, is_signer: meta.is_signer, is_writable: meta.is_writable });
        }
        steps.push(Instruction { program_id, accounts, data });
    }
    let tables = request.lookup_tables.as_deref().unwrap_or_default();
    if tables.len() > MAX_LOOKUP_TABLES {
        return Err(format!("lookupTables is not a list of up to {MAX_LOOKUP_TABLES} public keys"));
    }
    let lookup_tables = tables.iter().enumerate().map(|(i, table)| key(&format!("lookupTables[{i}]"), table)).collect::<Result<_, _>>()?;
    Ok(Parsed { intermediary, mint, amount, steps, lookup_tables })
}

/// What Connect refuses before signing, by the rules in its docs.
fn refused(parsed: &Parsed) -> Option<SimError> {
    let n = parsed.steps.len();
    parsed.steps.iter().enumerate().find_map(|(i, step)| {
        let refuse =
            |message: String| Some(SimError { instruction_index: Some(i), program_id: Some(step.program_id.to_string()), message, ..Default::default() });
        if step.program_id == COMPUTE_BUDGET {
            return refuse(format!(
                "Step {} of {n} is a compute budget instruction: Connect sets the compute budget itself and refuses a recipe that has one",
                i + 1
            ));
        }
        if step.program_id == SYSTEM && step.data.starts_with(&[4, 0, 0, 0]) {
            return refuse(format!("Step {} of {n} advances a durable nonce: Connect adds its own and refuses a recipe that has one", i + 1));
        }
        let other = step.accounts.iter().find(|meta| meta.is_signer && meta.pubkey != parsed.intermediary)?;
        refuse(format!("Step {} of {n} needs {} to sign, but Connect signs only as the intermediary", i + 1, other.pubkey))
    })
}

pub fn ata(owner: &Address, mint: &Address, token_program: &Address) -> Address {
    Address::find_program_address(&[owner.as_ref(), token_program.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

fn is_mint(account: &Account) -> bool {
    match account.owner {
        owner if owner == TOKEN => account.data.len() == 82,
        // a Token-2022 mint with extensions has its account type, 1, right after the 165 bytes of a token account
        owner if owner == TOKEN_2022 => account.data.len() == 82 || (account.data.len() > 165 && account.data[165] == 1),
        _ => false,
    }
}

/// Keys for the parts Connect supplies, the same on every run.
fn stand_in(name: &str) -> Address {
    Address::new_from_array(Sha256::digest(format!("connect-anything/sim/{name}")).into())
}

pub async fn simulate(rpc: &Rpc, cache: &Cache, parsed: Parsed, idls: BTreeMap<String, Value>) -> Result<SimResult, String> {
    if let Some(error) = refused(&parsed) {
        return Ok(SimResult { error: Some(error), ..SimResult::failed("") });
    }
    let mut keys = vec![parsed.mint, TOKEN, TOKEN_2022, ATA_PROGRAM];
    for token_program in [TOKEN, TOKEN_2022] {
        keys.push(ata(&parsed.intermediary, &parsed.mint, &token_program));
    }
    for step in &parsed.steps {
        keys.push(step.program_id);
        keys.extend(step.accounts.iter().map(|meta| meta.pubkey));
    }
    keys.extend(&parsed.lookup_tables);
    let snapshot = fork::snapshot(rpc, cache, &keys).await?;
    tokio::task::spawn_blocking(move || run(&parsed, &snapshot, &idls)).await.map_err(|error| format!("the simulation stopped unexpectedly: {error}"))
}

fn run(parsed: &Parsed, snapshot: &Snapshot, idls: &BTreeMap<String, Value>) -> SimResult {
    let mint = parsed.mint;
    let Some(mint_account) = snapshot.accounts.get(&mint).filter(|account| is_mint(account)) else {
        return SimResult::failed(format!("fund.mint {mint} is not a token mint on mainnet"));
    };
    let token_program = mint_account.owner;
    let decimals = mint_account.data[44];
    let Some(delivered) = parsed.amount.checked_add(RELAYER_FEE) else {
        return SimResult::failed("fund.amount is too large to add Connect's fee to");
    };

    let (mut svm, load_problems) = fork::fork(snapshot);
    let fee_payer = stand_in("fee-payer");
    let nonce = stand_in("nonce");
    let setup = (|| -> Result<(Address, Address), String> {
        svm.set_account(fee_payer, Account { lamports: 1_000_000_000_000, owner: SYSTEM, ..Account::default() }).map_err(|error| error.to_string())?;
        svm.set_account(nonce, nonce_account(&fee_payer)).map_err(|error| error.to_string())?;
        // the intermediary's account of the token as the bridge leaves it: what the steps use plus the relayer's fee
        let source = open_account(&mut svm, &fee_payer, &parsed.intermediary, &mint, &token_program)?;
        credit(&mut svm, &source, &mint, delivered)?;
        let relayer = open_account(&mut svm, &fee_payer, &fee_payer, &mint, &token_program)?;
        Ok((source, relayer))
    })();
    let (source, relayer) = match setup {
        Ok(accounts) => accounts,
        Err(error) => return SimResult::failed(format!("The fork could not hand the intermediary {mint}: {error}")),
    };

    let tables = match lookup_tables(parsed, snapshot) {
        Ok(tables) => tables,
        Err(error) => return SimResult::failed(error),
    };
    let assembled = assemble(parsed, snapshot, &svm, &fee_payer, &nonce, &source, &relayer, decimals, &token_program);
    let message = match compile(&assembled.instructions, &fee_payer, &tables) {
        Ok(message) => message,
        Err(error) => return SimResult::failed(format!("The transaction cannot be built: {error}")),
    };
    let tx_bytes = transaction_size(&message);
    let steps_bytes = compile(&assembled.instructions[assembled.before.len()..assembled.instructions.len() - 1], &fee_payer, &tables)
        .map(|message| transaction_size(&message))
        .unwrap_or(tx_bytes);
    let account_keys: Vec<Address> = message.static_account_keys().to_vec();
    let signatures = vec![Signature::default(); message.header().num_required_signatures as usize];
    let outcome = svm.simulate_transaction(VersionedTransaction { signatures, message });
    let (meta, error) = match outcome {
        Ok(info) => (info.meta, None),
        Err(failed) => (failed.meta, Some(failed.err)),
    };

    let compute_units = meta.compute_units_consumed;
    let mut warnings = Vec::new();
    if compute_units > CU_LIMIT {
        warnings.push(format!("CU {} > 200k", thousands(compute_units)));
    }
    if tx_bytes > TX_LIMIT {
        let added = tx_bytes.saturating_sub(steps_bytes);
        warnings.push(if steps_bytes <= TX_LIMIT {
            format!("{tx_bytes} bytes > {TX_LIMIT}: the steps fit, the {added} bytes Connect adds (nonce, compute budget, its fee) do not, and a lookup table can make room")
        } else {
            format!("{tx_bytes} bytes > {TX_LIMIT}, {added} of them what Connect adds (nonce, compute budget, its fee)")
        });
    }
    let error = error.map(|error| {
        let cx = errors::Context {
            steps: &parsed.steps,
            before: assembled.before.clone(),
            account_keys,
            idls,
            intermediary: parsed.intermediary,
            mint,
            load_problems: &load_problems,
        };
        errors::explain(&error, &meta.logs, &cx)
    });
    let verdict = match (&error, warnings.is_empty()) {
        (Some(_), _) => Verdict::Fail,
        (None, false) => Verdict::Warn,
        (None, true) => Verdict::Ok,
    };
    tracing::info!(slot = snapshot.slot, compute_units, tx_bytes, ?verdict, "simulated {} steps", parsed.steps.len());
    SimResult { verdict, compute_units, tx_bytes, logs: meta.logs, warnings, error }
}

struct Assembled {
    instructions: Vec<Instruction>,
    /// What each instruction before the steps is, for an error in one of them.
    before: Vec<&'static str>,
}

/// The transaction Connect would send: its nonce and compute budget, the accounts it opens, the steps, its fee.
#[allow(clippy::too_many_arguments)]
fn assemble(
    parsed: &Parsed,
    snapshot: &Snapshot,
    svm: &LiteSVM,
    fee_payer: &Address,
    nonce: &Address,
    source: &Address,
    relayer: &Address,
    decimals: u8,
    token_program: &Address,
) -> Assembled {
    let mut instructions = vec![
        Instruction {
            program_id: SYSTEM,
            accounts: vec![AccountMeta::new(*nonce, false), AccountMeta::new_readonly(RECENT_BLOCKHASHES, false), AccountMeta::new_readonly(*fee_payer, true)],
            data: vec![4, 0, 0, 0],
        },
        Instruction { program_id: COMPUTE_BUDGET, accounts: vec![], data: [&[2u8][..], &MEASURE_CU_LIMIT.to_le_bytes()].concat() },
        Instruction { program_id: COMPUTE_BUDGET, accounts: vec![], data: [&[3u8][..], &1u64.to_le_bytes()].concat() },
    ];
    let mut before = vec!["durable nonce instruction", "compute unit limit", "compute unit price"];

    // an account of the intermediary that a step writes, next to its mint, and that does not exist yet
    let mut opened = HashSet::new();
    for step in &parsed.steps {
        for meta in &step.accounts {
            let Some(account) = snapshot.accounts.get(&meta.pubkey).filter(|account| is_mint(account)) else { continue };
            let account_of = ata(&parsed.intermediary, &meta.pubkey, &account.owner);
            let written = step.accounts.iter().any(|other| other.pubkey == account_of && other.is_writable);
            let exists = svm.get_account(&account_of).is_some_and(|account| account.lamports > 0);
            if written && !exists && opened.insert(account_of) {
                instructions.push(create_account_of(fee_payer, &account_of, &parsed.intermediary, &meta.pubkey, &account.owner));
                before.push("opening of an account of the intermediary");
            }
        }
    }

    for step in &parsed.steps {
        let mut step = step.clone();
        // a step that opens a token account with the intermediary as funder is paid by the fee payer
        if step.program_id == ATA_PROGRAM && step.data.len() <= 1 && step.accounts.first().is_some_and(|meta| meta.pubkey == parsed.intermediary) {
            step.accounts[0] = AccountMeta::new(*fee_payer, true);
        }
        instructions.push(step);
    }
    let mut fee = vec![12u8];
    fee.extend_from_slice(&RELAYER_FEE.to_le_bytes());
    fee.push(decimals);
    instructions.push(Instruction {
        program_id: *token_program,
        accounts: vec![
            AccountMeta::new(*source, false),
            AccountMeta::new_readonly(parsed.mint, false),
            AccountMeta::new(*relayer, false),
            AccountMeta::new_readonly(parsed.intermediary, true),
        ],
        data: fee,
    });
    Assembled { instructions, before }
}

fn create_account_of(payer: &Address, account: &Address, owner: &Address, mint: &Address, token_program: &Address) -> Instruction {
    Instruction {
        program_id: ATA_PROGRAM,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(*account, false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(SYSTEM, false),
            AccountMeta::new_readonly(*token_program, false),
        ],
        data: vec![1], // CreateIdempotent
    }
}

/// Opens the associated token account the way the ATA program does, so a Token-2022 mint gets the extensions it needs.
fn open_account(svm: &mut LiteSVM, payer: &Address, owner: &Address, mint: &Address, token_program: &Address) -> Result<Address, String> {
    let address = ata(owner, mint, token_program);
    if svm.get_account(&address).is_some_and(|account| account.lamports > 0) {
        return Ok(address);
    }
    let instruction = create_account_of(payer, &address, owner, mint, token_program);
    let message = legacy::Message::new_with_blockhash(&[instruction], Some(payer), &svm.latest_blockhash());
    let signatures = vec![Signature::default(); message.header.num_required_signatures as usize];
    svm.send_transaction(VersionedTransaction { signatures, message: VersionedMessage::Legacy(message) })
        .map_err(|failed| format!("{} ({})", failed.err, failed.meta.logs.join(" | ")))?;
    Ok(address)
}

/// Adds to a token account's balance, the u64 at byte 64 in both token programs.
fn credit(svm: &mut LiteSVM, address: &Address, mint: &Address, amount: u64) -> Result<(), String> {
    let mut account = svm.get_account(address).ok_or("the account was not opened")?;
    let balance = u64::from_le_bytes(account.data[64..72].try_into().unwrap());
    let balance = balance.checked_add(amount).ok_or("the balance would overflow")?;
    account.data[64..72].copy_from_slice(&balance.to_le_bytes());
    if mint == &NATIVE_MINT {
        account.lamports += amount;
    }
    svm.set_account(*address, account).map_err(|error| error.to_string())
}

/// A durable nonce account with the fee payer as authority, its nonce unlike the fork's blockhash so it can advance.
fn nonce_account(authority: &Address) -> Account {
    let mut data = Vec::with_capacity(80);
    data.extend_from_slice(&1u32.to_le_bytes()); // Versions::Current
    data.extend_from_slice(&1u32.to_le_bytes()); // State::Initialized
    data.extend_from_slice(authority.as_ref());
    data.extend_from_slice(&Sha256::digest(b"connect-anything/sim/durable-nonce"));
    data.extend_from_slice(&5000u64.to_le_bytes()); // lamports per signature
    Account { lamports: 1_447_680, data, owner: SYSTEM, executable: false, rent_epoch: 0 }
}

fn lookup_tables(parsed: &Parsed, snapshot: &Snapshot) -> Result<Vec<AddressLookupTableAccount>, String> {
    parsed
        .lookup_tables
        .iter()
        .map(|key| {
            let account = snapshot.accounts.get(key).ok_or_else(|| format!("Lookup table {key} does not exist on mainnet"))?;
            let addresses = account.data.get(LOOKUP_TABLE_META..).unwrap_or_default();
            if !addresses.len().is_multiple_of(32) {
                return Err(format!("Account {key} is not a lookup table"));
            }
            let addresses = addresses.chunks(32).map(|chunk| Address::new_from_array(chunk.try_into().unwrap())).collect();
            Ok(AddressLookupTableAccount { key: *key, addresses })
        })
        .collect()
}

/// A legacy message, or v0 when there are lookup tables, as Connect builds it.
fn compile(instructions: &[Instruction], payer: &Address, tables: &[AddressLookupTableAccount]) -> Result<VersionedMessage, String> {
    // the nonce stands where the blockhash goes, and is as long
    let v0 = v0::Message::try_compile(payer, instructions, tables, Hash::default()).map_err(|error| error.to_string())?;
    if tables.is_empty() {
        return Ok(VersionedMessage::Legacy(legacy::Message::new_with_blockhash(instructions, Some(payer), &Hash::default())));
    }
    Ok(VersionedMessage::V0(v0))
}

fn transaction_size(message: &VersionedMessage) -> usize {
    let signatures = message.header().num_required_signatures as usize;
    let length_prefix = if signatures < 0x80 { 1 } else { 2 };
    length_prefix + 64 * signatures + message.serialize().len()
}

fn thousands(units: u64) -> String {
    if units.is_multiple_of(1000) {
        format!("{}k", units / 1000)
    } else {
        format!("{:.1}k", units as f64 / 1000.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Fund, SimAccountMeta, SimInstruction};

    const USDC: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    fn request(instructions: Vec<SimInstruction>) -> SimRequest {
        SimRequest {
            intermediary: "3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7".into(),
            fund: Fund { mint: USDC.into(), amount: "1000000".into() },
            instructions,
            lookup_tables: None,
            idls: None,
        }
    }

    fn step(program_id: &str, accounts: &[(&str, bool, bool)], data: &str) -> SimInstruction {
        SimInstruction {
            program_id: program_id.into(),
            accounts: accounts
                .iter()
                .map(|(pubkey, is_signer, is_writable)| SimAccountMeta { pubkey: pubkey.to_string(), is_signer: *is_signer, is_writable: *is_writable })
                .collect(),
            data: data.into(),
        }
    }

    #[test]
    fn derives_the_usdc_account_of_a_wallet() {
        // the addresses @solana/web3.js gives for these wallets; the first is the web's stand-in intermediary
        let usdc: Address = USDC.parse().unwrap();
        for (owner, expected) in [
            ("3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7", "E9yZFuPob5nB8ZnviNS7TrmAwE2sNgixNvHjPN6gcWYU"),
            ("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B"),
        ] {
            assert_eq!(ata(&owner.parse().unwrap(), &usdc, &TOKEN).to_string(), expected);
        }
    }

    #[test]
    fn refuses_malformed_requests() {
        let mut bad = request(vec![]);
        assert_eq!(parse(&bad).err().unwrap(), "instructions is not a list of 1 to 50");
        bad.instructions.push(step("not-a-key", &[], ""));
        assert!(parse(&bad).err().unwrap().contains("programId is not a public key"));
        let mut amount = request(vec![step(USDC, &[], "")]);
        amount.fund.amount = "18446744073709551616".into();
        assert_eq!(parse(&amount).err().unwrap(), "fund.amount is not a u64 as a decimal string");
    }

    #[test]
    fn refuses_what_connect_refuses() {
        let budget = parse(&request(vec![step("ComputeBudget111111111111111111111111111111", &[], "AkBCDwA=")])).unwrap();
        assert!(refused(&budget).unwrap().message.contains("compute budget instruction"));
        let signer = parse(&request(vec![step(USDC, &[("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", true, true)], "")])).unwrap();
        let error = refused(&signer).unwrap();
        assert_eq!(error.instruction_index, Some(0));
        assert!(error.message.contains("Connect signs only as the intermediary"));
        let fine = parse(&request(vec![step(USDC, &[("3giHp8wAqP8khAKkhLDJqGWJvUpmwTPp8zwgh12WpVz7", true, false)], "")])).unwrap();
        assert!(refused(&fine).is_none());
    }

    /// Every fixtures/<name>.sim.json with the answer recorded for it in <name>.result.json.
    fn fixtures() -> Vec<(String, SimRequest, SimResult)> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
        let read = |name: &str| std::fs::read(dir.join(name)).unwrap_or_else(|error| panic!("fixtures/{name}: {error}"));
        let mut found: Vec<_> = std::fs::read_dir(&dir)
            .expect("the fixtures directory")
            .filter_map(|entry| entry.ok()?.file_name().to_str()?.strip_suffix(".sim.json").map(String::from))
            .map(|name| {
                let request = serde_json::from_slice(&read(&format!("{name}.sim.json"))).unwrap_or_else(|error| panic!("{name}.sim.json: {error}"));
                let result = serde_json::from_slice(&read(&format!("{name}.result.json"))).unwrap_or_else(|error| panic!("{name}.result.json: {error}"));
                (name, request, result)
            })
            .collect();
        found.sort_by(|a, b| a.0.cmp(&b.0));
        assert!(found.iter().any(|(name, ..)| name == "klend-repay"), "fixtures/klend-repay.sim.json is missing");
        found
    }

    #[test]
    fn fixtures_follow_the_contract() {
        for (name, request, recorded) in fixtures() {
            let parsed = parse(&request).unwrap_or_else(|problem| panic!("{name}: {problem}"));
            assert!(refused(&parsed).is_none(), "{name} is a recipe Connect refuses");
            assert_eq!(recorded.verdict == Verdict::Fail, recorded.error.is_some(), "{name}: a fail and only a fail has an error");
            assert_eq!(recorded.verdict == Verdict::Warn, recorded.error.is_none() && !recorded.warnings.is_empty(), "{name}: warn");
            assert!(recorded.compute_units > 0 && recorded.tx_bytes > 0 && !recorded.logs.is_empty(), "{name} ran");
        }
    }

    /// Runs every fixture again on a fork of mainnet as it is now:
    /// `SOLANA_RPC_URL=... cargo test -p sim --release -- --ignored`.
    /// The positions are live, so compute units move from slot to slot, but the verdict, the error and the size do not.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "reads mainnet through SOLANA_RPC_URL"]
    async fn fixtures_pass_on_a_fork() {
        let rpc = Rpc::new(std::env::var("SOLANA_RPC_URL").expect("SOLANA_RPC_URL"));
        let cache = Cache::default();
        for (name, request, recorded) in fixtures() {
            let result = simulate(&rpc, &cache, parse(&request).unwrap(), request.idls.clone().unwrap_or_default()).await.unwrap();
            let named = |result: &SimResult| result.error.as_ref().map(|error| (error.instruction_index, error.code, error.name.clone()));
            assert_eq!((result.verdict, named(&result)), (recorded.verdict, named(&recorded)), "{name}: {:?}", result.error);
            assert_eq!(result.tx_bytes, recorded.tx_bytes, "{name}");
            println!("{name}: {:?}, {} CU (recorded {}), {} bytes", result.verdict, result.compute_units, recorded.compute_units, result.tx_bytes);
        }
    }

    #[test]
    fn counts_bytes_like_the_wire() {
        let payer = Address::new_unique();
        let ix = Instruction {
            program_id: SYSTEM,
            accounts: vec![AccountMeta::new(payer, true), AccountMeta::new(Address::new_unique(), false)],
            data: vec![2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        };
        let message = compile(&[ix], &payer, &[]).unwrap();
        // the classic SOL transfer: 1 + 64 signature bytes, a 3-byte header, 3 keys, a blockhash, one instruction
        assert_eq!(transaction_size(&message), 1 + 64 + 3 + 1 + 3 * 32 + 32 + 1 + (1 + 1 + 2 + 1 + 12));
    }
}
