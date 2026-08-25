use std::fs;
use std::path::PathBuf;

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use thiserror::Error;

use crate::crypto;
use crate::models::{AuthMeta, UnlockInfo, UnlockMethod, VaultData};
use zeroize::Zeroize;

const KEYRING_SERVICE: &str = "com.genxis.genvault";
const KEYRING_USER: &str = "vault_master_key";
const KEYRING_HPK: &str = "hello_protector_key";
const KEYRING_FPK: &str = "fido_protector_key";

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Crypto error: {0}")]
    Crypto(#[from] crypto::CryptoError),
    #[error("No account found")]
    NoAccount,
    #[error("Secure credential store error: {0}")]
    Keyring(String),
    #[error("Incorrect password or PIN")]
    InvalidSecret,
    #[error("Unlock method not enrolled")]
    MethodNotFound,
    #[error("Method not found")]
    NotFound,
    #[error("At least one unlock method must remain enrolled")]
    LastMethod,
    #[error("Master password must remain enrolled as the primary unlock method")]
    PasswordRequired,
    #[error("Data directory not found")]
    NoDataDir,
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
}

pub fn read_protected_file(path: &std::path::Path) -> Result<Vec<u8>, StoreError> {
    crate::secure_file::read_protected(path)
}

pub fn write_protected_file(path: &std::path::Path, data: &[u8]) -> Result<(), StoreError> {
    crate::secure_file::write_protected(path, data)
}

/// Get the app data directory (public for rate-limit persistence).
pub fn data_dir_public() -> Result<PathBuf, StoreError> {
    data_dir()
}

/// Normalize a security answer for consistent comparison/KDF input.
pub fn normalize_answer(answer: &str) -> String {
    answer.trim().to_lowercase()
}

/// Build deterministic KDF input from question/answer pairs (sorted by question id).
pub fn recovery_kdf_input(answers: &[(String, String)]) -> String {
    let mut pairs: Vec<(String, String)> = answers
        .iter()
        .map(|(id, ans)| (id.clone(), normalize_answer(ans)))
        .collect();
    pairs.sort_by(|a, b| a.0.cmp(&b.0));
    pairs
        .into_iter()
        .map(|(id, ans)| format!("{}:{}", id, ans))
        .collect::<Vec<_>>()
        .join("|")
}
fn data_dir() -> Result<PathBuf, StoreError> {
    // Honor override in debug/test only — release builds ignore GENVAULT_DATA_DIR
    // so same-user env injection cannot redirect vault I/O.
    #[cfg(debug_assertions)]
    if let Ok(override_dir) = std::env::var("GENVAULT_DATA_DIR") {
        let dir = PathBuf::from(override_dir);
        fs::create_dir_all(&dir)?;
        return Ok(dir);
    }
    if let Some(dir) = crate::app_paths::get() {
        fs::create_dir_all(&dir)?;
        return Ok(dir);
    }
    let dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .ok_or(StoreError::NoDataDir)?
        .join("GenVault");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn write_atomic(path: &std::path::Path, data: &[u8]) -> Result<(), StoreError> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data)?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(&tmp, path)?;
            let _ = fs::remove_file(&tmp);
            Ok(())
        }
    }
}

fn meta_path() -> Result<PathBuf, StoreError> {
    Ok(data_dir()?.join("auth.json"))
}

fn vault_path() -> Result<PathBuf, StoreError> {
    Ok(data_dir()?.join("vault.enc"))
}

fn recovery_key_path() -> Result<PathBuf, StoreError> {
    Ok(data_dir()?.join("recovery_key.enc"))
}

/// Access the OS-native secure credential store entry holding the vault master key.
/// On Windows this uses Credential Manager, on macOS the Keychain, and on Linux
/// the Secret Service — never plain files, never localStorage, never derivable
/// from any client-visible data.
#[cfg(not(target_os = "android"))]
fn keyring_entry() -> Result<Entry, StoreError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| StoreError::Keyring(e.to_string()))
}

#[cfg(target_os = "android")]
fn delete_keyring_vmk() {}

#[cfg(not(target_os = "android"))]
fn delete_keyring_vmk() {
    if let Ok(entry) = keyring_entry() {
        let _ = entry.delete_credential();
    }
}

/// Check if an account exists
pub fn account_exists() -> Result<bool, StoreError> {
    Ok(meta_path()?.exists())
}

/// Get the stored username hint for the login screen
pub fn get_login_hint() -> Result<Option<String>, StoreError> {
    let path = meta_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path)?;
    let meta: AuthMeta = serde_json::from_str(&data)?;
    Ok(Some(meta.username))
}

/// Create a new account: generate a random 256-bit vault key and persist auth
/// metadata. The VMK is kept in memory only until `enroll_secret` wraps it with
/// the user's password — we intentionally skip the OS keyring here because
/// Windows Credential Manager frequently blocks first-time writes from desktop apps.
pub fn create_account(username: &str) -> Result<[u8; 32], StoreError> {
    let key = crypto::generate_key();

    let meta = AuthMeta {
        username: username.to_string(),
        methods: vec![],
        enrolled_question_ids: vec![],
        security_keys: vec![],
    };
    write_atomic(
        &meta_path()?,
        serde_json::to_string_pretty(&meta)?.as_bytes(),
    )?;

    let vault = VaultData::default();
    save_vault_with_key(&vault, &key)?;

    Ok(key)
}

/// Returns true when auth metadata exists but no unlock method was enrolled
/// (signup aborted mid-flow).
pub fn is_incomplete_account() -> Result<bool, StoreError> {
    if !meta_path()?.exists() {
        return Ok(false);
    }
    match load_meta() {
        Ok(meta) => Ok(meta.methods.is_empty()),
        Err(StoreError::Serialization(_)) => Ok(true),
        Err(e) => Err(e),
    }
}

/// True when signup should wipe existing local auth data and start fresh.
pub fn should_reset_for_signup(password: &str) -> Result<bool, StoreError> {
    if !account_exists()? {
        return Ok(false);
    }
    if is_incomplete_account()? {
        return Ok(true);
    }
    match unlock_with_secret("password", password) {
        Ok(key) => match load_vault_with_key(&key) {
            Ok(vault) => Ok(vault.user.is_none()),
            Err(StoreError::Crypto(_)) | Err(StoreError::Serialization(_)) => Ok(true),
            Err(e) => Err(e),
        },
        Err(StoreError::InvalidSecret) | Err(StoreError::MethodNotFound) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Authenticate: retrieve the vault master key from the OS keyring (legacy only).
/// If a master-password method is enrolled, keyring VMK access is refused and cleared.
pub fn authenticate(expected_username: Option<&str>) -> Result<[u8; 32], StoreError> {
    let path = meta_path()?;
    if !path.exists() {
        return Err(StoreError::NoAccount);
    }

    if let Ok(meta) = load_meta() {
        if has_password_method(&meta) {
            delete_keyring_vmk();
            return Err(StoreError::Keyring(
                "Legacy keyring unlock is disabled. Use your master password.".into(),
            ));
        }
    }

    if let Some(expected) = expected_username {
        let data = fs::read_to_string(&path)?;
        let meta: AuthMeta = serde_json::from_str(&data)?;
        if meta.username.to_lowercase() != expected.to_lowercase() {
            return Err(StoreError::Keyring("Account username mismatch".to_string()));
        }
    }

    #[cfg(target_os = "android")]
    {
        return Err(StoreError::Keyring("unavailable".into()));
    }

    #[cfg(not(target_os = "android"))]
    {
        let entry = keyring_entry()?;
        let hex_key = entry
            .get_password()
            .map_err(|e| StoreError::Keyring(e.to_string()))?;
        let bytes = crypto::hex_to_bytes(&hex_key)?;
        if bytes.len() != 32 {
            return Err(StoreError::Keyring("Invalid vault key length".to_string()));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        Ok(key)
    }
}

fn vault_db_path() -> Result<PathBuf, StoreError> {
    Ok(data_dir()?.join("vault.db"))
}

/// Save vault metadata (no entries) and sync entries to SQLite.
pub fn save_vault_with_key(vault: &VaultData, key: &[u8; 32]) -> Result<(), StoreError> {
    for entry in &vault.vault_entries {
        crate::vault_db::upsert_entry(entry, key)?;
    }
    save_vault_metadata(vault, key)
}

fn save_vault_metadata(vault: &VaultData, key: &[u8; 32]) -> Result<(), StoreError> {
    let mut meta_vault = vault.clone();
    meta_vault.vault_entries.clear();
    let json = serde_json::to_vec(&meta_vault)?;
    let encrypted = crypto::encrypt(&json, key)?;
    write_atomic(&vault_path()?, &encrypted)
}

/// Load vault metadata and entries (SQLite with legacy JSON migration).
pub fn load_vault_with_key(key: &[u8; 32]) -> Result<VaultData, StoreError> {
    let path = vault_path()?;
    let mut vault = if !path.exists() {
        VaultData::default()
    } else {
        let encrypted = fs::read(&path)?;
        let decrypted = crypto::decrypt(&encrypted, key)?;
        serde_json::from_slice(&decrypted)?
    };

    let db_path = vault_db_path()?;
    if db_path.exists() {
        vault.vault_entries = crate::vault_db::list_all_entries(key)?;
        // Scrub legacy plaintext columns / note history when present (cheap no-op after first run).
        if crate::vault_db::scrub_plaintext_metadata(key).unwrap_or(false) {
            vault.vault_entries = crate::vault_db::list_all_entries(key)?;
        }
        let _ = crate::entry_history::scrub_sensitive_history();
    } else if !vault.vault_entries.is_empty() {
        crate::vault_db::migrate_entries(&vault.vault_entries, key)?;
        save_vault_metadata(&vault, key)?;
        vault.vault_entries = crate::vault_db::list_all_entries(key)?;
    }

    Ok(vault)
}

/// Persist enrolled security question IDs in auth metadata.
pub fn set_enrolled_question_ids(ids: &[String]) -> Result<(), StoreError> {
    let mut meta = load_meta()?;
    meta.enrolled_question_ids = ids.to_vec();
    save_meta(&meta)
}

/// Return enrolled security question IDs (for password recovery UI).
pub fn get_enrolled_question_ids() -> Result<Vec<String>, StoreError> {
    Ok(load_meta()?.enrolled_question_ids)
}
/// Update the stored username in auth metadata
pub fn update_username(new_username: &str) -> Result<(), StoreError> {
    let path = meta_path()?;
    let data = fs::read_to_string(&path)?;
    let mut meta: AuthMeta = serde_json::from_str(&data)?;
    meta.username = new_username.to_string();
    let json = serde_json::to_string_pretty(&meta)?;
    fs::write(path, json)?;
    Ok(())
}

/// Rotate the vault master key using the current in-memory VMK.
///
/// Re-encrypts vault data and attachments, re-wraps every enrolled unlock
/// method (password/PIN require the live secrets), and never writes the
/// plaintext VMK to the OS keyring. Recovery codes and legacy recovery_key
/// are invalidated and must be regenerated.
pub fn rotate_vault_key(
    old_vmk: &[u8; 32],
    password: &str,
    pin: Option<&str>,
) -> Result<[u8; 32], StoreError> {
    let pw_vmk = unlock_with_secret("password", password)?;
    if pw_vmk != *old_vmk {
        return Err(StoreError::InvalidSecret);
    }

    let _ = pin; // PIN no longer wraps VMK; ignored on rotate.
    let meta = load_meta()?;

    let vault = load_vault_with_key(old_vmk)?;
    let new_key = crypto::generate_key();

    save_vault_with_key(&vault, &new_key)?;
    crate::attachments::reencrypt_all(&vault.vault_entries, old_vmk, &new_key)?;

    enroll_secret("password", password, &new_key)?;
    // Drop any legacy PIN wrap so PIN cannot remain a sole unlock factor.
    let _ = remove_method("pin", &new_key);
    if meta.methods.iter().any(|m| m.kind == "hello") {
        enroll_hello(&new_key)?;
    }
    if meta.methods.iter().any(|m| m.kind == "security_key") {
        enroll_security_key_unlock(&new_key)?;
    }

    let _ = crate::recovery_codes::delete_all_recovery_codes();
    let _ = delete_recovery_key();

    // Secure mode: never leave plaintext VMK in the keyring.
    delete_keyring_vmk();

    Ok(new_key)
}

/// Delete all data (account reset), including the OS keyring entries
pub fn delete_account() -> Result<(), StoreError> {
    delete_keyring_vmk();
    delete_hpk_keyring();
    delete_fpk_keyring();
    // Presence-only model: HPK wrap is disabled. Never block a full wipe on keystore cleanup.
    #[cfg(target_os = "android")]
    let _ = crate::android_keystore::delete_hpk();
    let _ = crate::vault_db::wipe_db();
    let _ = crate::recovery_codes::delete_all_recovery_codes();
    let dir = data_dir()?;
    clear_vault_data_dir(&dir)?;
    // Success = no account metadata left (root dir may remain on Android).
    if account_exists().unwrap_or(false) {
        return Err(StoreError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Vault metadata still present after erase",
        )));
    }
    Ok(())
}

/// Wipe vault files under the data directory. Prefer clearing contents over
/// removing the root folder — Android often keeps `app_data_dir` open.
fn clear_vault_data_dir(dir: &std::path::Path) -> Result<(), StoreError> {
    if !dir.exists() {
        return Ok(());
    }
    remove_dir_contents(dir)?;
    // Best-effort: empty tree may still refuse rmdir on some platforms.
    let _ = fs::remove_dir(dir);
    if dir.exists() {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

fn remove_dir_all_with_retry(dir: &std::path::Path) -> Result<(), StoreError> {
    if !dir.exists() {
        return Ok(());
    }
    for attempt in 0..3 {
        match fs::remove_dir_all(dir) {
            Ok(()) => return Ok(()),
            Err(_) if attempt < 2 => std::thread::sleep(std::time::Duration::from_millis(150)),
            Err(_) => {
                remove_dir_contents(dir)?;
                let _ = fs::remove_dir_all(dir);
                return Ok(());
            }
        }
    }
    Ok(())
}

fn remove_dir_contents(dir: &std::path::Path) -> Result<(), StoreError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            remove_dir_all_with_retry(&path)?;
        } else {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

// ===== Layered Unlock (master password / PIN / Windows Hello) =====

fn protector_path(name: &str) -> Result<PathBuf, StoreError> {
    Ok(data_dir()?.join(name))
}

fn save_protector_key(filename: &str, key: &[u8; 32]) -> Result<(), StoreError> {
    write_protected_file(
        &protector_path(filename)?,
        crypto::bytes_to_hex(key).as_bytes(),
    )
}

fn load_protector_key(filename: &str, legacy_kind: &str) -> Result<[u8; 32], StoreError> {
    let path = protector_path(filename)?;
    if path.exists() {
        let raw = read_protected_file(&path)?;
        let hex = String::from_utf8(raw).map_err(|_| StoreError::InvalidSecret)?;
        let bytes = crypto::hex_to_bytes(hex.trim())?;
        if bytes.len() != 32 {
            return Err(StoreError::Keyring(
                "Invalid protector key length".to_string(),
            ));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    // Migrate legacy keyring protector → DPAPI-protected file.
    #[cfg(target_os = "android")]
    {
        let _ = legacy_kind;
        return Err(StoreError::Keyring("unavailable".into()));
    }

    #[cfg(not(target_os = "android"))]
    {
        let legacy = match legacy_kind {
            "hello" => hpk_entry()?,
            "fido" => fpk_entry()?,
            _ => return Err(StoreError::MethodNotFound),
        };
        let hex_key = legacy
            .get_password()
            .map_err(|e| StoreError::Keyring(e.to_string()))?;
        let bytes = crypto::hex_to_bytes(&hex_key)?;
        if bytes.len() != 32 {
            return Err(StoreError::Keyring(
                "Invalid protector key length".to_string(),
            ));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        save_protector_key(filename, &key)?;
        let _ = legacy.delete_credential();
        Ok(key)
    }
}

fn delete_protector_key(filename: &str, legacy_kind: &str) -> Result<(), StoreError> {
    if legacy_kind == "hello" {
        #[cfg(target_os = "android")]
        crate::android_keystore::delete_hpk().map_err(StoreError::Keyring)?;
    }
    if let Ok(path) = protector_path(filename) {
        let _ = fs::remove_file(path);
    }
    match legacy_kind {
        "hello" => delete_hpk_keyring(),
        "fido" => delete_fpk_keyring(),
        _ => {}
    }
    Ok(())
}

fn has_password_method(meta: &AuthMeta) -> bool {
    meta.methods.iter().any(|m| m.kind == "password")
}

/// The OS keyring entry holding the Hello protector key (HPK) — legacy only.
#[cfg(not(target_os = "android"))]
fn hpk_entry() -> Result<Entry, StoreError> {
    Entry::new(KEYRING_SERVICE, KEYRING_HPK).map_err(|e| StoreError::Keyring(e.to_string()))
}

#[cfg(not(target_os = "android"))]
fn fpk_entry() -> Result<Entry, StoreError> {
    Entry::new(KEYRING_SERVICE, KEYRING_FPK).map_err(|e| StoreError::Keyring(e.to_string()))
}

#[cfg(target_os = "android")]
fn delete_hpk_keyring() {}

#[cfg(not(target_os = "android"))]
fn delete_hpk_keyring() {
    if let Ok(entry) = hpk_entry() {
        let _ = entry.delete_credential();
    }
}

#[cfg(target_os = "android")]
fn delete_fpk_keyring() {}

#[cfg(not(target_os = "android"))]
fn delete_fpk_keyring() {
    if let Ok(entry) = fpk_entry() {
        let _ = entry.delete_credential();
    }
}

pub fn load_meta() -> Result<AuthMeta, StoreError> {
    let path = meta_path()?;
    if !path.exists() {
        return Err(StoreError::NoAccount);
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

fn save_meta(meta: &AuthMeta) -> Result<(), StoreError> {
    write_atomic(
        &meta_path()?,
        serde_json::to_string_pretty(meta)?.as_bytes(),
    )
}

/// Report whether an account exists and how it can be unlocked.
pub fn unlock_info() -> Result<UnlockInfo, StoreError> {
    if !meta_path()?.exists() {
        return Ok(UnlockInfo {
            exists: false,
            legacy: true,
            methods: vec![],
        });
    }
    let meta = load_meta()?;
    // PIN must never appear as an unlock option (legacy wraps may still exist on disk).
    let methods: Vec<String> = meta
        .methods
        .iter()
        .map(|m| m.kind.clone())
        .filter(|k| k != "pin")
        .collect();
    Ok(UnlockInfo {
        exists: true,
        legacy: methods.is_empty(),
        methods,
    })
}

/// Unlock the vault using the master-password method.
/// PIN unlock is rejected — PIN must not recover the VMK.
pub fn unlock_with_secret(kind: &str, secret: &str) -> Result<[u8; 32], StoreError> {
    if kind == "pin" {
        return Err(StoreError::Keyring(
            "PIN unlock is disabled. Use your master password.".into(),
        ));
    }
    let meta = load_meta()?;
    let method = meta
        .methods
        .iter()
        .find(|m| m.kind == kind)
        .ok_or(StoreError::MethodNotFound)?;

    let mut wrap_key = crypto::derive_key(secret, &method.salt)?;
    let mut vmk_bytes =
        crypto::decrypt(&method.wrapped_key, &wrap_key).map_err(|_| StoreError::InvalidSecret)?;
    wrap_key.zeroize();
    if vmk_bytes.len() != 32 {
        vmk_bytes.zeroize();
        return Err(StoreError::InvalidSecret);
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&vmk_bytes);
    vmk_bytes.zeroize();
    Ok(key)
}

/// HARD-DISABLED: Hello must never unwrap VMK from HPK (same-user malware path).
/// Use password wrap + `hello::request_consent` presence proof instead.
pub fn unlock_with_hello() -> Result<[u8; 32], StoreError> {
    Err(StoreError::Keyring(
        "Hello cannot unwrap the vault key. Use master password with biometric confirmation."
            .into(),
    ))
}

/// HARD-DISABLED: FIDO must never unwrap VMK from FPK alone.
/// Use password wrap + FIDO assertion presence proof instead.
pub fn unlock_with_security_key() -> Result<[u8; 32], StoreError> {
    Err(StoreError::Keyring(
        "Security key cannot unwrap the vault key alone. Use master password with key confirmation."
            .into(),
    ))
}

/// Presence-only FIDO enrollment marker. VMK is never wrapped with FPK.
/// Unlock always uses password + FIDO assertion.
pub fn enroll_security_key_unlock(_vmk: &[u8; 32]) -> Result<(), StoreError> {
    let meta = load_meta()?;
    if !has_password_method(&meta) {
        return Err(StoreError::PasswordRequired);
    }

    let _ = delete_protector_key("fido_protector.dat", "fido");
    delete_fpk_keyring();

    // Opaque marker — discarded key; cannot recover VMK.
    let marker_key = crypto::generate_key();
    let wrapped_key = crypto::encrypt(b"presence-only", &marker_key)?;

    let mut meta = meta;
    meta.methods.retain(|m| m.kind != "security_key");
    meta.methods.push(UnlockMethod {
        kind: "security_key".to_string(),
        salt: vec![],
        wrapped_key,
    });
    save_meta(&meta)?;

    delete_keyring_vmk();
    Ok(())
}

pub fn list_security_keys() -> Result<Vec<crate::models::HardwareSecurityKey>, StoreError> {
    Ok(load_meta()?.security_keys)
}

pub fn add_security_key_record(
    record: crate::models::HardwareSecurityKey,
) -> Result<(), StoreError> {
    let mut meta = load_meta()?;
    meta.security_keys.push(record);
    save_meta(&meta)
}

pub fn touch_security_key(id: &str) -> Result<(), StoreError> {
    let mut meta = load_meta()?;
    if let Some(key) = meta.security_keys.iter_mut().find(|k| k.id == id) {
        key.last_used = chrono::Utc::now().timestamp();
        save_meta(&meta)?;
    }
    Ok(())
}

pub fn remove_security_key_record(id: &str) -> Result<(), StoreError> {
    let mut meta = load_meta()?;
    let before = meta.security_keys.len();
    meta.security_keys.retain(|k| k.id != id);
    if meta.security_keys.len() == before {
        return Err(StoreError::NotFound);
    }

    if meta.security_keys.is_empty() {
        let had_method = meta.methods.iter().any(|m| m.kind == "security_key");
        if had_method {
            meta.methods.retain(|m| m.kind != "security_key");
            if !has_password_method(&meta) {
                return Err(StoreError::PasswordRequired);
            }
            if meta.methods.is_empty() {
                return Err(StoreError::LastMethod);
            }
            delete_protector_key("fido_protector.dat", "fido")?;
        }
    }
    save_meta(&meta)
}

pub fn has_security_key_unlock() -> Result<bool, StoreError> {
    Ok(load_meta()?
        .methods
        .iter()
        .any(|m| m.kind == "security_key"))
}

/// Enroll (or replace) a password unlock method that wraps the given VMK.
/// PIN enrollment is rejected — PIN must not wrap or recover the VMK.
/// Enrolling the first secret method removes the plaintext VMK from the keyring.
pub fn enroll_secret(kind: &str, secret: &str, vmk: &[u8; 32]) -> Result<(), StoreError> {
    if kind == "pin" {
        return Err(StoreError::Keyring(
            "PIN unlock is disabled. Use your master password.".into(),
        ));
    }
    let mut meta = load_meta()?;

    let salt = crypto::generate_salt();
    let wrap_key = crypto::derive_key(secret, &salt)?;
    let wrapped_key = crypto::encrypt(vmk, &wrap_key)?;

    meta.methods.retain(|m| m.kind != kind);
    meta.methods.push(UnlockMethod {
        kind: kind.to_string(),
        salt,
        wrapped_key,
    });
    save_meta(&meta)?;

    // Once any secret method exists, the plaintext VMK must not remain in the keyring.
    delete_keyring_vmk();
    Ok(())
}

/// Delete a secret unlock method. Master password cannot be removed.
pub fn delete_secret(kind: &str, vmk: &[u8; 32]) -> Result<(), StoreError> {
    if kind == "password" {
        return Err(StoreError::PasswordRequired);
    }
    remove_method(kind, vmk)
}

/// Check if a secret unlock method exists.
pub fn has_secret(kind: &str, _vmk: &[u8; 32]) -> Result<bool, StoreError> {
    let meta = load_meta()?;
    Ok(meta.methods.iter().any(|m| m.kind == kind))
}

/// Presence-only Hello enrollment marker. VMK is never wrapped with HPK.
/// Unlock always uses password + `hello::request_consent`.
pub fn enroll_hello(_vmk: &[u8; 32]) -> Result<(), StoreError> {
    let meta = load_meta()?;
    if !has_password_method(&meta) {
        return Err(StoreError::PasswordRequired);
    }

    // Remove any legacy HPK that could decrypt an old VMK wrap.
    let _ = delete_protector_key("hello_protector.dat", "hello");
    delete_hpk_keyring();
    #[cfg(target_os = "android")]
    let _ = crate::android_keystore::delete_hpk();

    let marker_key = crypto::generate_key();
    let wrapped_key = crypto::encrypt(b"presence-only", &marker_key)?;

    let mut meta = meta;
    meta.methods.retain(|m| m.kind != "hello");
    meta.methods.push(UnlockMethod {
        kind: "hello".to_string(),
        salt: vec![],
        wrapped_key,
    });
    save_meta(&meta)?;

    delete_keyring_vmk();
    Ok(())
}

/// Remove an enrolled unlock method. Master password cannot be removed.
pub fn remove_method(kind: &str, _vmk: &[u8; 32]) -> Result<(), StoreError> {
    if kind == "password" {
        return Err(StoreError::PasswordRequired);
    }

    let mut meta = load_meta()?;
    let before = meta.methods.len();
    let mut preview = meta.clone();
    preview.methods.retain(|m| m.kind != kind);
    if preview.methods.len() == before {
        return Err(StoreError::MethodNotFound);
    }
    if preview.methods.is_empty() {
        return Err(StoreError::LastMethod);
    }
    if !has_password_method(&preview) {
        return Err(StoreError::PasswordRequired);
    }

    meta.methods = preview.methods;

    if kind == "hello" {
        delete_protector_key("hello_protector.dat", "hello")?;
    }
    if kind == "security_key" {
        delete_protector_key("fido_protector.dat", "fido")?;
    }

    save_meta(&meta)?;
    Ok(())
}

// ===== Encrypted Backup / Restore =====

/// Export a full, portable, encrypted backup of the vault.
/// The backup is self-contained: it is encrypted with a key derived (Argon2id)
/// from a user-supplied backup passphrase and a fresh random salt, so it can be
/// restored on any device WITHOUT the OS keyring or original unlock methods.
/// Unlike `export_vault`, this DOES include the TOTP secrets (encrypted).
pub fn export_backup(passphrase: &str, vmk: &[u8; 32]) -> Result<String, StoreError> {
    let vault = load_vault_with_key(vmk)?;
    let plaintext = serde_json::to_vec(&vault)?;

    let salt = crypto::generate_salt();
    let key = crypto::derive_key(passphrase, &salt)?;
    let ciphertext = crypto::encrypt(&plaintext, &key)?;

    let backup = serde_json::json!({
        "format": "genvault-backup",
        "version": 1,
        "kdf": "argon2id",
        "salt": crypto::bytes_to_hex(&salt),
        "data": crypto::bytes_to_hex(&ciphertext),
    });
    Ok(serde_json::to_string_pretty(&backup)?)
}

/// Decrypt and parse an encrypted backup blob using the supplied passphrase.
/// Returns the recovered VaultData (the caller is responsible for persisting it
/// under the current device's VMK).
pub fn decode_backup(passphrase: &str, backup_json: &str) -> Result<VaultData, StoreError> {
    let parsed: serde_json::Value = serde_json::from_str(backup_json)?;

    let salt_hex = parsed
        .get("salt")
        .and_then(|v| v.as_str())
        .ok_or(crypto::CryptoError::InvalidFormat)?;
    let data_hex = parsed
        .get("data")
        .and_then(|v| v.as_str())
        .ok_or(crypto::CryptoError::InvalidFormat)?;

    let salt = crypto::hex_to_bytes(salt_hex)?;
    let ciphertext = crypto::hex_to_bytes(data_hex)?;

    let key = crypto::derive_key(passphrase, &salt)?;
    let plaintext = crypto::decrypt(&ciphertext, &key).map_err(|_| StoreError::InvalidSecret)?;

    let vault: VaultData = serde_json::from_slice(&plaintext)?;
    Ok(vault)
}

/// Legacy security-question recovery is disabled — prefer recovery codes.
pub fn store_recovery_key(_vmk: &[u8; 32], _answers: &[(String, String)]) -> Result<(), StoreError> {
    let _ = delete_recovery_key();
    Err(StoreError::Keyring(
        "Security question recovery is disabled. Use account recovery codes.".into(),
    ))
}

/// Legacy path — always fails and deletes leftover recovery_key.enc.
pub fn recover_vmk_with_answers(_answers: &[(String, String)]) -> Result<[u8; 32], StoreError> {
    let _ = delete_recovery_key();
    Err(StoreError::MethodNotFound)
}

/// Check if a recovery key exists (security questions have been enrolled)
pub fn has_recovery_key() -> bool {
    recovery_key_path().map(|p| p.exists()).unwrap_or(false)
}

/// Delete the recovery key (e.g., when re-enrolling security questions)
pub fn delete_recovery_key() -> Result<(), StoreError> {
    let path = recovery_key_path()?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn data_dir_honors_env_override() {
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("GENVAULT_DATA_DIR", tmp.path());
        let dir = crate::store::data_dir_public().unwrap();
        assert_eq!(dir, tmp.path());
        std::env::remove_var("GENVAULT_DATA_DIR");
    }
}
