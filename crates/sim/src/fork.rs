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
/// After a failed read of the feature gates, how long the last or built-in list serves before the next try.
const FEATURES_RETRY: Duration = Duration::from_secs(60);
/// Upgradeable programs one request may reach. Each costs a read of its binary, up to 10 MB, and its loading on the fork.
pub const MAX_PROGRAMS: usize = 16;
/// Program binaries kept between requests, the least recently used dropped first.
const BINARIES_BYTES: usize = 256 << 20;

/// What stays between requests: the feature gates of mainnet, and program binaries until they are upgraded.
#[derive(Default)]
pub struct Cache {
    /// The feature set and when it is to be read again.
    features: tokio::sync::Mutex<Option<(Instant, FeatureSet)>>,
    binaries: Mutex<Binaries>,
}

#[derive(Default)]
struct Binaries {
    /// Each binary with the use it was last read on.
    kept: HashMap<Address, (Arc<Account>, u64)>,
    bytes: usize,
    uses: u64,
}

impl Cache {
    async fn features(&self, rpc: &Rpc) -> FeatureSet {
        let mut cached = self.features.lock().await;
        if let Some((until, features)) = cached.as_ref() {
            if Instant::now() < *until {
                return features.clone();
            }
        }
        let (features, ttl) = match read_features(rpc).await {
            Ok(features) => (features, FEATURES_TTL),
            Err(error) => {
                // without a pause, every request would try again while holding the lock, so they would run one at a time
                tracing::warn!("could not read the feature gates of mainnet, using the last or the built-in list for a minute: {error}");
                (cached.take().map(|(_, features)| features).unwrap_or_else(LiteSVM::mainnet_feature_set), FEATURES_RETRY)
            }
        };
        *cached = Some((Instant::now() + ttl, features.clone()));
        features
    }

    /// The cached program binary, if its header (deployment slot and authority) is still the one on mainnet.
    fn programdata(&self, key: &Address, header: &[u8]) -> Option<Arc<Account>> {
        let mut binaries = self.binaries.lock().unwrap();
        binaries.uses += 1;
        let uses = binaries.uses;
        let (account, used) = binaries.kept.get_mut(key).filter(|(account, _)| account.data.get(..PROGRAMDATA_HEADER) == Some(header))?;
        *used = uses;
        Some(account.clone())
    }

    fn keep_programdata(&self, key: Address, account: Arc<Account>) {
        let mut binaries = self.binaries.lock().unwrap();
        binaries.uses += 1;
        let uses = binaries.uses;
        binaries.bytes += account.data.len();
        if let Some((replaced, _)) = binaries.kept.insert(key, (account, uses)) {
            binaries.bytes -= replaced.data.len();
        }
        while binaries.bytes > BINARIES_BYTES && binaries.kept.len() > 1 {
            let oldest = binaries.kept.iter().min_by_key(|(_, (_, used))| *used).map(|(key, _)| *key).unwrap();
            let (dropped, _) = binaries.kept.remove(&oldest).unwrap();
            binaries.bytes -= dropped.data.len();
        }
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

pub enum Unread {
    /// Mainnet did not answer as it should.
    Rpc(String),
    /// The request reaches more upgradeable programs than one fork loads, `MAX_PROGRAMS`.
    Programs(usize),
}

impl From<String> for Unread {
    fn from(error: String) -> Self {
        Unread::Rpc(error)
    }
}

pub fn programdata_address(program: &Account) -> Option<Address> {
    // UpgradeableLoaderState::Program: tag 2 and the programdata address
    (program.owner == UPGRADEABLE_LOADER && program.executable && program.data.len() >= 36 && program.data[..4] == [2, 0, 0, 0])
        .then(|| Address::new_from_array(program.data[4..36].try_into().unwrap()))
}

/// The accounts behind `keys` and the sysvars, and the binary of every upgradeable program among them. The accounts
/// are at one slot when they fit in one call of 100, as a recipe's do.
pub async fn snapshot(rpc: &Rpc, cache: &Cache, keys: &[Address]) -> Result<Snapshot, Unread> {
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
    if programdata.len() > MAX_PROGRAMS {
        return Err(Unread::Programs(programdata.len()));
    }
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
