//! A fork of mainnet for one simulation: the accounts a transaction touches, read from mainnet at one slot together with
//! its clock, put into a fresh LiteSVM.
//!
//! A fresh fork per request rather than one long-lived fork such as Surfpool: a long-lived fork keeps the first copy of an
//! account it read, so oracle prices go stale within minutes and klend's refresh_reserve refuses them, and two requests
//! would share and race on the funding of the intermediary. Here prices, reserves and the clock come from the same read.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use agave_feature_set::{FeatureSet, FEATURE_NAMES};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;

use crate::rpc::Rpc;

pub const NATIVE_LOADER: Address = Address::from_str_const("NativeLoader1111111111111111111111111111111");
pub const UPGRADEABLE_LOADER: Address = Address::from_str_const("BPFLoaderUpgradeab1e11111111111111111111111");
const SYSVAR_OWNER: Address = Address::from_str_const("Sysvar1111111111111111111111111111111111111");

/// The sysvars a program can read that are taken from mainnet. RecentBlockhashes stays LiteSVM's own, which the nonce
/// instruction checks against, and Instructions is built per transaction.
const SYSVARS: [Address; 6] = [
    Address::from_str_const("SysvarC1ock11111111111111111111111111111111"),
    Address::from_str_const("SysvarRent111111111111111111111111111111111"),
    Address::from_str_const("SysvarEpochSchedu1e111111111111111111111111"),
    Address::from_str_const("SysvarS1otHashes111111111111111111111111111"),
    Address::from_str_const("SysvarEpochRewards1111111111111111111111111"),
    Address::from_str_const("SysvarLastRestartS1ot1111111111111111111111"),
];

/// UpgradeableLoaderState::ProgramData before the ELF: a u32 tag, the deployment slot and an optional authority.
const PROGRAMDATA_HEADER: usize = 45;
const FEATURES_TTL: Duration = Duration::from_secs(3600);

/// What stays between requests: the feature gates of mainnet, and program binaries until they are upgraded.
#[derive(Default)]
pub struct Cache {
    features: tokio::sync::Mutex<Option<(Instant, FeatureSet)>>,
    programdata: Mutex<HashMap<Address, Arc<Account>>>,
}

impl Cache {
    async fn features(&self, rpc: &Rpc) -> FeatureSet {
        let mut cached = self.features.lock().await;
        if let Some((at, features)) = cached.as_ref() {
            if at.elapsed() < FEATURES_TTL {
                return features.clone();
            }
        }
        match read_features(rpc).await {
            Ok(features) => {
                *cached = Some((Instant::now(), features.clone()));
                features
            }
            Err(error) => {
                tracing::warn!("could not read the feature gates of mainnet, using the last or the built-in list: {error}");
                cached.as_ref().map(|(_, features)| features.clone()).unwrap_or_else(LiteSVM::mainnet_feature_set)
            }
        }
    }

    /// The cached program binary, if its header (deployment slot and authority) is still the one on mainnet.
    fn programdata(&self, key: &Address, header: &[u8]) -> Option<Arc<Account>> {
        let cached = self.programdata.lock().unwrap();
        cached.get(key).filter(|account| account.data.get(..PROGRAMDATA_HEADER) == Some(header)).cloned()
    }

    fn keep_programdata(&self, key: Address, account: Arc<Account>) {
        self.programdata.lock().unwrap().insert(key, account);
    }
}

/// Every feature gate active on mainnet, from its account. Missing or pending ones stay off.
async fn read_features(rpc: &Rpc) -> Result<FeatureSet, String> {
    let ids: Vec<Address> = FEATURE_NAMES.keys().copied().collect();
    let (_, accounts) = rpc.get_multiple_accounts(&ids, None).await?;
    let mut features = FeatureSet::default();
    for (id, account) in ids.iter().zip(accounts) {
        // a feature account holds bincode Option<u64>: the slot it was activated at
        if let Some(data) = account.map(|account| account.data) {
            if data.len() >= 9 && data[0] == 1 {
                features.activate(id, u64::from_le_bytes(data[1..9].try_into().unwrap()));
            }
        }
    }
    Ok(features)
}

pub struct Snapshot {
    pub slot: u64,
    pub features: FeatureSet,
    pub accounts: HashMap<Address, Account>,
}

fn programdata_address(program: &Account) -> Option<Address> {
    // UpgradeableLoaderState::Program: tag 2 and the programdata address
    (program.owner == UPGRADEABLE_LOADER && program.executable && program.data.len() >= 36 && program.data[..4] == [2, 0, 0, 0])
        .then(|| Address::new_from_array(program.data[4..36].try_into().unwrap()))
}

/// The accounts behind `keys` and the sysvars at one slot, and the binary of every upgradeable program among them.
pub async fn snapshot(rpc: &Rpc, cache: &Cache, keys: &[Address]) -> Result<Snapshot, String> {
    let features = cache.features(rpc).await;
    let mut wanted: Vec<Address> = SYSVARS.to_vec();
    for key in keys {
        if !wanted.contains(key) {
            wanted.push(*key);
        }
    }
    let (slot, found) = rpc.get_multiple_accounts(&wanted, None).await?;
    let mut accounts: HashMap<Address, Account> = wanted.into_iter().zip(found).filter_map(|(key, account)| Some((key, account?))).collect();

    let programdata: Vec<Address> = accounts.values().filter_map(programdata_address).filter(|key| !accounts.contains_key(key)).collect();
    if !programdata.is_empty() {
        let (_, headers) = rpc.get_multiple_accounts(&programdata, Some((0, PROGRAMDATA_HEADER))).await?;
        for (key, header) in programdata.iter().zip(headers) {
            // a closed program has no programdata, and LiteSVM loads it as closed
            let Some(header) = header else { continue };
            let account = match cache.programdata(key, &header.data) {
                Some(account) => account,
                None => {
                    let (_, full) = rpc.get_multiple_accounts(&[*key], None).await?;
                    let Some(account) = full.into_iter().next().flatten() else { continue };
                    let account = Arc::new(account);
                    cache.keep_programdata(*key, account.clone());
                    account
                }
            };
            accounts.insert(*key, (*account).clone());
        }
    }
    Ok(Snapshot { slot, features, accounts })
}

/// A LiteSVM with mainnet's feature gates, sysvars and accounts. Also says which programs it could not load.
pub fn fork(snapshot: &Snapshot) -> (LiteSVM, Vec<String>) {
    let mut svm = LiteSVM::default()
        .with_feature_set(snapshot.features.clone())
        .with_builtins()
        .with_sysvars()
        .with_precompiles()
        .with_sigverify(false)
        .with_blockhash_check(false)
        .with_log_bytes_limit(None)
        .with_transaction_history(0);

    // the clock first: programs are loaded at its slot
    for id in SYSVARS {
        if let Some(account) = snapshot.accounts.get(&id) {
            if let Err(error) = svm.set_account(id, account.clone()) {
                tracing::warn!("sysvar {id} from mainnet was refused: {error}");
            }
        }
    }
    // builtins are LiteSVM's own, and a program needs its programdata in place before it is loaded
    let mut problems = Vec::new();
    let (programs, data): (Vec<_>, Vec<_>) = snapshot
        .accounts
        .iter()
        .filter(|(key, account)| account.owner != NATIVE_LOADER && account.owner != SYSVAR_OWNER && !SYSVARS.contains(key))
        .partition(|(_, account)| account.executable);
    for (key, account) in data.into_iter().chain(programs) {
        if let Err(error) = svm.set_account(*key, account.clone()) {
            problems.push(format!("program {key} could not be loaded on the fork ({error})"));
        }
    }
    (svm, problems)
}
