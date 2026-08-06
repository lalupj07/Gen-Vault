use parking_lot::Mutex;
use std::sync::OnceLock;
use zeroize::Zeroize;

use crate::models::{VaultData, VaultEntry, VaultEntryPublic};
use crate::store;

pub mod auth;
pub mod file_lock;
pub mod folder_lock;
pub mod hardware_keys;
pub mod recovery;
pub mod vault;

pub use auth::*;
pub use file_lock::*;
pub use folder_lock::*;
pub use hardware_keys::*;
pub use recovery::*;
pub use vault::*;

static SESSION_KEY: OnceLock<Mutex<Option<[u8; 32]>>> = OnceLock::new();

pub(crate) fn session() -> &'static Mutex<Option<[u8; 32]>> {
    SESSION_KEY.get_or_init(|| Mutex::new(None))
}

pub(crate) fn get_key() -> Result<[u8; 32], String> {
    let guard = session().lock();
    guard
        .as_ref()
        .copied()
        .ok_or_else(|| "Vault is locked. Please log in.".to_string())
}

#[tauri::command]
pub fn lock_vault() -> Result<(), String> {
    let mut guard = session().lock();
    if let Some(ref mut key) = *guard {
        key.zeroize();
    }
    *guard = None;
    Ok(())
}

pub(crate) fn with_vault<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut VaultData) -> Result<R, String>,
{
    let key = get_key()?;
    let mut vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    let result = f(&mut vault)?;
    store::save_vault_with_key(&vault, &key).map_err(|e| e.to_string())?;
    Ok(result)
}

pub(crate) fn now_ts() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub(crate) fn entry_public(entry: &VaultEntry) -> VaultEntryPublic {
    VaultEntryPublic::from(entry)
}

pub(crate) fn log_entry_history(
    entry_id: &str,
    entry_name: &str,
    action: &str,
    field: Option<&str>,
    old_value: Option<&str>,
    new_value: Option<&str>,
) {
    let _ = crate::entry_history::record(
        entry_id,
        entry_name,
        action,
        field,
        old_value,
        new_value,
        now_ts(),
    );
}

pub(crate) fn validate_master_password(password: &str) -> Result<(), String> {
    if password.len() < 12 {
        return Err("Master password must be at least 12 characters long".to_string());
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err("Password must contain at least one uppercase letter".to_string());
    }
    if !password.chars().any(|c| c.is_lowercase()) {
        return Err("Password must contain at least one lowercase letter".to_string());
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err("Password must contain at least one number".to_string());
    }
    if !password.chars().any(|c| !c.is_alphanumeric()) {
        return Err("Password must contain at least one special character".to_string());
    }
    Ok(())
}

/// Unlock PIN: 12+ digits, not trivial patterns (offline brute-force hardening).
pub(crate) fn validate_unlock_pin(pin: &str) -> Result<(), String> {
    if pin.len() < 12 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must be at least 12 digits".to_string());
    }
    if pin.chars().all(|c| c == pin.as_bytes()[0] as char) {
        return Err("PIN cannot use the same digit repeatedly".to_string());
    }
    let digits: Vec<u8> = pin.bytes().map(|b| b - b'0').collect();
    let ascending = digits.windows(2).all(|w| w[1] == w[0].wrapping_add(1) % 10);
    let descending = digits.windows(2).all(|w| w[1] == w[0].wrapping_sub(1) % 10);
    if ascending || descending {
        return Err("PIN cannot be a simple sequential pattern".to_string());
    }
    Ok(())
}

/// Salted SHA-256 for emergency codes (salt hex || hash hex).
pub(crate) fn hash_emergency_code(code: &str) -> String {
    use rand::RngCore;
    use sha2::{Digest, Sha256};
    let normalized = code.replace('-', "").to_uppercase();
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(normalized.as_bytes());
    let digest = hasher.finalize();
    format!("{}:{}", hex::encode(salt), hex::encode(digest))
}

pub(crate) fn verify_emergency_code_hash(code: &str, stored: &str) -> bool {
    use sha2::{Digest, Sha256};
    let normalized = code.replace('-', "").to_uppercase();
    if let Some((salt_hex, hash_hex)) = stored.split_once(':') {
        let Ok(salt) = hex::decode(salt_hex) else {
            return false;
        };
        let mut hasher = Sha256::new();
        hasher.update(&salt);
        hasher.update(normalized.as_bytes());
        return hex::encode(hasher.finalize()) == hash_hex;
    }
    // Legacy unsalted hashes (pre-fix)
    let digest = Sha256::digest(normalized.as_bytes());
    hex::encode(digest) == stored
}
