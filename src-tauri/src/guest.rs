//! Guest grant store — time-limited passphrase-wrapped item access without VMK.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::crypto;
use crate::folder_lock::crypto_files::{decrypt_file_bytes, unwrap_dek};
use crate::rate_limit;
use crate::store::{self, StoreError};

const MIN_PASSPHRASE_LEN: usize = 12;
const MIN_TTL_MINS: u32 = 1;
const MAX_TTL_MINS: u32 = 60;
const GUEST_UNLOCK_ACTION: &str = "guest_unlock";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GuestKind {
    Folder,
    File,
    Media,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GuestGrant {
    id: String,
    kind: GuestKind,
    item_id: String,
    label: String,
    expires_at: i64,
    salt: Vec<u8>,
    wrapped_dek: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuestGrantPublic {
    pub id: String,
    pub kind: GuestKind,
    pub item_id: String,
    pub label: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuestUnlockResult {
    pub kind: GuestKind,
    pub item_id: String,
    pub staging_path: PathBuf,
}

#[derive(Error, Debug)]
pub enum GuestError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Store error: {0}")]
    Store(#[from] StoreError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Crypto error: {0}")]
    Crypto(#[from] crypto::CryptoError),
    #[error("Passphrase must be at least {MIN_PASSPHRASE_LEN} characters")]
    PassphraseTooShort,
    #[error("Grant not found")]
    NotFound,
    #[error("Item not found")]
    ItemNotFound,
    #[error("Grant expired")]
    Expired,
    #[error("Invalid passphrase")]
    InvalidPassphrase,
    #[error("{0}")]
    RateLimited(String),
    #[error("{0}")]
    Other(String),
}

fn grants_path() -> Result<PathBuf, GuestError> {
    Ok(store::data_dir_public()?.join("guest_grants.enc"))
}

fn guest_grants_dir() -> Result<PathBuf, GuestError> {
    Ok(store::data_dir_public()?.join("guest-grants"))
}

fn grant_sidecar_path(grant_id: &str) -> Result<PathBuf, GuestError> {
    Ok(guest_grants_dir()?.join(format!("{grant_id}.grant")))
}

fn load_grants(vault_key: &[u8; 32]) -> Result<Vec<GuestGrant>, GuestError> {
    let path = grants_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let encrypted = store::read_protected_file(&path)?;
    let decrypted = crypto::decrypt(&encrypted, vault_key)?;
    Ok(serde_json::from_slice(&decrypted)?)
}

fn save_grants(grants: &[GuestGrant], vault_key: &[u8; 32]) -> Result<(), GuestError> {
    let json = serde_json::to_vec(grants)?;
    let encrypted = crypto::encrypt(&json, vault_key)?;
    store::write_protected_file(&grants_path()?, &encrypted)?;
    Ok(())
}

fn save_grant_sidecar(grant: &GuestGrant) -> Result<(), GuestError> {
    let dir = guest_grants_dir()?;
    fs::create_dir_all(&dir)?;
    let json = serde_json::to_vec(grant)?;
    store::write_protected_file(&grant_sidecar_path(&grant.id)?, &json)?;
    Ok(())
}

fn load_grant_sidecar(grant_id: &str) -> Result<GuestGrant, GuestError> {
    let path = grant_sidecar_path(grant_id)?;
    if !path.exists() {
        return Err(GuestError::NotFound);
    }
    let data = store::read_protected_file(&path)?;
    Ok(serde_json::from_slice(&data)?)
}

fn delete_grant_sidecar(grant_id: &str) -> Result<(), GuestError> {
    let path = grant_sidecar_path(grant_id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn to_public(g: &GuestGrant) -> GuestGrantPublic {
    GuestGrantPublic {
        id: g.id.clone(),
        kind: g.kind,
        item_id: g.item_id.clone(),
        label: g.label.clone(),
        expires_at: g.expires_at,
    }
}

fn clamp_ttl(ttl_mins: u32) -> u32 {
    ttl_mins.clamp(MIN_TTL_MINS, MAX_TTL_MINS)
}

fn wrap_dek_for_passphrase(dek: &[u8; 32], passphrase: &str) -> Result<(Vec<u8>, Vec<u8>), GuestError> {
    let salt = crypto::generate_salt();
    let wrap_key = crypto::derive_key(passphrase, &salt)?;
    let wrapped = crypto::encrypt(dek, &wrap_key)?;
    Ok((salt, wrapped))
}

fn unwrap_dek_from_passphrase(
    wrapped: &[u8],
    salt: &[u8],
    passphrase: &str,
) -> Result<[u8; 32], GuestError> {
    let mut wrap_key = crypto::derive_key(passphrase, salt)?;
    let mut plain =
        crypto::decrypt(wrapped, &wrap_key).map_err(|_| GuestError::InvalidPassphrase)?;
    wrap_key.zeroize();
    if plain.len() != 32 {
        plain.zeroize();
        return Err(GuestError::InvalidPassphrase);
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&plain);
    plain.zeroize();
    Ok(dek)
}

fn load_item_dek(
    kind: GuestKind,
    item_id: &str,
    vault_key: &[u8; 32],
) -> Result<[u8; 32], GuestError> {
    let data_dir = store::data_dir_public()?;
    match kind {
        GuestKind::Folder => {
            let row = crate::folder_lock::store::FolderLockStore::open(&data_dir)
                .map_err(|e| GuestError::Other(e.to_string()))?
                .get(item_id)
                .map_err(|_| GuestError::ItemNotFound)?;
            unwrap_dek(&row.dek_wrapped, vault_key).map_err(GuestError::from)
        }
        GuestKind::File => {
            let row = crate::file_lock::store::FileLockStore::open(&data_dir)
                .map_err(|e| GuestError::Other(e.to_string()))?
                .get(item_id)
                .map_err(|_| GuestError::ItemNotFound)?;
            unwrap_dek(&row.dek_wrapped, vault_key).map_err(GuestError::from)
        }
        GuestKind::Media => {
            let row = crate::media_vault::store::MediaVaultStore::new(data_dir)
                .map_err(|e| GuestError::Other(e.to_string()))?
                .get(item_id)
                .map_err(|_| GuestError::ItemNotFound)?;
            unwrap_dek(&row.wrapped_dek, vault_key).map_err(GuestError::from)
        }
    }
}

fn guest_staging_dir(grant_id: &str) -> Result<PathBuf, GuestError> {
    Ok(store::data_dir_public()?
        .join("guest-staging")
        .join(grant_id))
}

fn encode_rel(rel: &str) -> String {
    hex::encode(rel.as_bytes())
}

fn media_rel_aad(id: &str, basename: &str) -> String {
    format!("{id}\0{basename}")
}

fn wipe_dir_tree(path: &Path) -> Result<(), GuestError> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_file() {
        fs::remove_file(path)?;
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            wipe_dir_tree(&p)?;
        } else {
            let _ = fs::remove_file(&p);
        }
    }
    fs::remove_dir(path)?;
    Ok(())
}

fn decrypt_folder_to_staging(
    item_id: &str,
    grant_id: &str,
    dek: &[u8; 32],
) -> Result<PathBuf, GuestError> {
    let data_dir = store::data_dir_public()?;
    let cipher_root = data_dir.join("folder-lock").join(item_id);
    let manifest_blob = fs::read(cipher_root.join("manifest.enc"))?;
    let manifest_json = crypto::decrypt(&manifest_blob, dek)?;
    let rel_paths: Vec<String> = serde_json::from_slice(&manifest_json)?;

    let staging = guest_staging_dir(grant_id)?;
    if staging.exists() {
        wipe_dir_tree(&staging)?;
    }
    fs::create_dir_all(&staging)?;

    for rel in &rel_paths {
        let blob_path = cipher_root
            .join("files")
            .join(format!("{}.gvf", encode_rel(rel)));
        let blob = fs::read(&blob_path)?;
        let plain = decrypt_file_bytes(&blob, dek, item_id, rel)?;
        let out = staging.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&out, plain)?;
    }
    Ok(staging)
}

fn decrypt_file_to_staging(
    item_id: &str,
    grant_id: &str,
    dek: &[u8; 32],
) -> Result<PathBuf, GuestError> {
    let data_dir = store::data_dir_public()?;
    let row = crate::file_lock::store::FileLockStore::open(&data_dir)
        .map_err(|e| GuestError::Other(e.to_string()))?
        .get(item_id)
        .map_err(|_| GuestError::ItemNotFound)?;

    let blob = fs::read(
        data_dir
            .join("file-lock")
            .join(item_id)
            .join("payload.gvf"),
    )?;
    let plain = decrypt_file_bytes(&blob, dek, item_id, &row.original_path)?;

    let staging = guest_staging_dir(grant_id)?;
    if staging.exists() {
        wipe_dir_tree(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    fs::write(staging.join(&row.display_name), plain)?;
    Ok(staging)
}

fn decrypt_media_to_staging(
    item_id: &str,
    grant_id: &str,
    dek: &[u8; 32],
) -> Result<PathBuf, GuestError> {
    let data_dir = store::data_dir_public()?;
    let row = crate::media_vault::store::MediaVaultStore::new(data_dir.clone())
        .map_err(|e| GuestError::Other(e.to_string()))?
        .get(item_id)
        .map_err(|_| GuestError::ItemNotFound)?;

    let blob = fs::read(
        data_dir
            .join("media-vault")
            .join(item_id)
            .join("payload.gvm"),
    )?;
    let plain = decrypt_file_bytes(
        &blob,
        dek,
        "media",
        &media_rel_aad(item_id, &row.original_name),
    )?;

    let staging = guest_staging_dir(grant_id)?;
    if staging.exists() {
        wipe_dir_tree(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    let out = staging.join(&row.original_name);
    fs::write(&out, plain)?;
    Ok(out)
}

fn decrypt_to_staging(
    grant: &GuestGrant,
    dek: &[u8; 32],
) -> Result<PathBuf, GuestError> {
    match grant.kind {
        GuestKind::Folder => decrypt_folder_to_staging(&grant.item_id, &grant.id, dek),
        GuestKind::File => decrypt_file_to_staging(&grant.item_id, &grant.id, dek),
        GuestKind::Media => decrypt_media_to_staging(&grant.item_id, &grant.id, dek),
    }
}

/// Owner creates a time-limited guest grant while vault is unlocked.
pub fn create_grant(
    kind: GuestKind,
    item_id: &str,
    label: &str,
    passphrase: &str,
    ttl_mins: u32,
    vault_key: &[u8; 32],
) -> Result<GuestGrantPublic, GuestError> {
    if passphrase.len() < MIN_PASSPHRASE_LEN {
        return Err(GuestError::PassphraseTooShort);
    }
    let ttl = clamp_ttl(ttl_mins);
    let mut dek = load_item_dek(kind, item_id, vault_key)?;
    let (salt, wrapped_dek) = wrap_dek_for_passphrase(&dek, passphrase)?;
    dek.zeroize();

    let grant = GuestGrant {
        id: Uuid::new_v4().to_string(),
        kind,
        item_id: item_id.to_string(),
        label: label.to_string(),
        expires_at: chrono::Utc::now().timestamp() + (ttl as i64 * 60),
        salt,
        wrapped_dek,
    };

    let mut grants = load_grants(vault_key)?;
    grants.push(grant.clone());
    save_grants(&grants, vault_key)?;
    save_grant_sidecar(&grant)?;

    Ok(to_public(&grant))
}

/// List grants for owner (no wrapped DEK exposed).
pub fn list_grants(vault_key: &[u8; 32]) -> Result<Vec<GuestGrantPublic>, GuestError> {
    Ok(load_grants(vault_key)?.iter().map(to_public).collect())
}

/// Revoke a grant while vault is unlocked.
pub fn revoke_grant(id: &str, vault_key: &[u8; 32]) -> Result<(), GuestError> {
    let mut grants = load_grants(vault_key)?;
    let before = grants.len();
    grants.retain(|g| g.id != id);
    if grants.len() == before {
        return Err(GuestError::NotFound);
    }
    save_grants(&grants, vault_key)?;
    let _ = delete_grant_sidecar(id);
    if let Ok(staging) = guest_staging_dir(id) {
        let _ = wipe_dir_tree(&staging);
    }
    Ok(())
}

/// Guest unlock — does not set session VMK; works while vault is locked.
pub fn guest_unlock(grant_id: &str, passphrase: &str) -> Result<GuestUnlockResult, GuestError> {
    rate_limit::check_allowed(GUEST_UNLOCK_ACTION).map_err(GuestError::RateLimited)?;

    let grant = match load_grant_sidecar(grant_id) {
        Ok(g) => g,
        Err(GuestError::NotFound) => {
            let _ = rate_limit::record_failure(GUEST_UNLOCK_ACTION);
            return Err(GuestError::NotFound);
        }
        Err(e) => return Err(e),
    };

    if grant.expires_at <= chrono::Utc::now().timestamp() {
        return Err(GuestError::Expired);
    }

    let mut dek = match unwrap_dek_from_passphrase(&grant.wrapped_dek, &grant.salt, passphrase) {
        Ok(d) => d,
        Err(e @ GuestError::InvalidPassphrase) => {
            let _ = rate_limit::record_failure(GUEST_UNLOCK_ACTION);
            return Err(e);
        }
        Err(e) => return Err(e),
    };

    let staging_path = match decrypt_to_staging(&grant, &dek) {
        Ok(p) => p,
        Err(e) => {
            dek.zeroize();
            return Err(e);
        }
    };
    dek.zeroize();

    let _ = rate_limit::record_success(GUEST_UNLOCK_ACTION);

    Ok(GuestUnlockResult {
        kind: grant.kind,
        item_id: grant.item_id,
        staging_path,
    })
}

/// Best-effort wipe of guest unlock staging (panic lock / session end).
pub fn wipe_guest_staging() {
    if let Ok(staging_root) = store::data_dir_public().map(|d| d.join("guest-staging")) {
        if staging_root.exists() {
            let _ = wipe_dir_tree(&staging_root);
        }
    }
}

/// Wipe all guest grant artifacts (used during full vault erase).
pub fn wipe_all_guest_data() -> Result<(), GuestError> {
    let path = grants_path()?;
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    if let Ok(dir) = guest_grants_dir() {
        let _ = wipe_dir_tree(&dir);
    }
    let staging_root = store::data_dir_public()?.join("guest-staging");
    if staging_root.exists() {
        let _ = wipe_dir_tree(&staging_root);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;
    use crate::file_lock::service::FileLockService;

    fn with_data_dir<F: FnOnce() -> R, R>(dir: &Path, f: F) -> R {
        let _guard = crate::store::test_data_dir_guard();
        std::env::set_var("GENVAULT_DATA_DIR", dir);
        let _ = rate_limit::reset();
        let out = f();
        std::env::remove_var("GENVAULT_DATA_DIR");
        out
    }

    #[test]
    fn create_unlock_and_expire_reject() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let src = tmp.path().join("secret.txt");
        fs::write(&src, b"guest-secret-payload").unwrap();

        with_data_dir(&data, || {
            let vault_key = crypto::generate_key();
            let svc = FileLockService::new(data.clone()).unwrap();
            let row = svc.lock_file(&src, &vault_key, true).unwrap();

            let grant = create_grant(
                GuestKind::File,
                &row.id,
                "test-file-grant",
                "long-passphrase-12",
                15,
                &vault_key,
            )
            .unwrap();
            assert_eq!(grant.kind, GuestKind::File);
            assert_eq!(grant.item_id, row.id);
            assert!(grant.expires_at > chrono::Utc::now().timestamp());

            let listed = list_grants(&vault_key).unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].id, grant.id);

            let unlocked = guest_unlock(&grant.id, "long-passphrase-12").unwrap();
            assert_eq!(unlocked.kind, GuestKind::File);
            assert_eq!(unlocked.item_id, row.id);
            assert_eq!(
                fs::read_to_string(unlocked.staging_path.join("secret.txt")).unwrap(),
                "guest-secret-payload"
            );

            assert!(matches!(
                guest_unlock(&grant.id, "wrong-passphrase"),
                Err(GuestError::InvalidPassphrase)
            ));

            let mut grants = load_grants(&vault_key).unwrap();
            grants[0].expires_at = chrono::Utc::now().timestamp() - 1;
            save_grants(&grants, &vault_key).unwrap();
            save_grant_sidecar(&grants[0]).unwrap();

            assert!(matches!(
                guest_unlock(&grant.id, "long-passphrase-12"),
                Err(GuestError::Expired)
            ));

            revoke_grant(&grant.id, &vault_key).unwrap();
            assert!(list_grants(&vault_key).unwrap().is_empty());
            assert!(!grant_sidecar_path(&grant.id).unwrap().exists());
        });
    }

    #[test]
    fn ttl_and_passphrase_validation() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        fs::create_dir_all(&data).unwrap();

        with_data_dir(&data, || {
            assert_eq!(clamp_ttl(0), 1);
            assert_eq!(clamp_ttl(999), 60);

            let vault_key = crypto::generate_key();
            let src = tmp.path().join("x.txt");
            fs::write(&src, b"x").unwrap();
            let svc = FileLockService::new(data.clone()).unwrap();
            let row = svc.lock_file(&src, &vault_key, true).unwrap();

            assert!(matches!(
                create_grant(
                    GuestKind::File,
                    &row.id,
                    "lbl",
                    "short",
                    15,
                    &vault_key
                ),
                Err(GuestError::PassphraseTooShort)
            ));

            let grant = create_grant(
                GuestKind::File,
                &row.id,
                "lbl",
                "valid-passphrase",
                0,
                &vault_key,
            )
            .unwrap();
            let ttl_secs = grant.expires_at - chrono::Utc::now().timestamp();
            assert!(ttl_secs >= 55 && ttl_secs <= 65);
        });
    }
}
