//! Folder Lock service — encrypt tree, staging unlock, wipe, restore.

use super::crypto_files::{decrypt_file_bytes, encrypt_file_bytes, unwrap_dek, wrap_dek};
use super::policy::{self, PolicyError};
use super::store::{FolderLockStore, LockStatus, LockedFolderRow, StoreError};
use crate::crypto;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroize;

/// Warn / require confirm when locking trees larger than this (bytes).
pub const SIZE_WARN_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Error, Debug)]
pub enum ServiceError {
    #[error(transparent)]
    Policy(#[from] PolicyError),
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Crypto(#[from] crypto::CryptoError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Folder is larger than 2 GB; confirm to proceed")]
    NeedsLargeConfirm { size_bytes: u64 },
    #[error("Another folder is already unlocked in staging")]
    AlreadyUnlocked,
    #[error("Folder is not unlocked")]
    NotUnlocked,
    #[error("Folder not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedFolderPublic {
    pub id: String,
    pub display_name: String,
    pub original_path: String,
    pub status: String,
    pub favorite: bool,
    pub size_bytes: u64,
    pub created_at: i64,
    pub last_locked_at: i64,
    pub last_unlocked_at: Option<i64>,
}

impl From<&LockedFolderRow> for LockedFolderPublic {
    fn from(r: &LockedFolderRow) -> Self {
        Self {
            id: r.id.clone(),
            display_name: r.display_name.clone(),
            original_path: r.original_path.clone(),
            status: r.status.as_str().to_string(),
            favorite: r.favorite,
            size_bytes: r.size_bytes,
            created_at: r.created_at,
            last_locked_at: r.last_locked_at,
            last_unlocked_at: r.last_unlocked_at,
        }
    }
}

pub struct FolderLockService {
    data_dir: PathBuf,
}

impl FolderLockService {
    pub fn new(data_dir: PathBuf) -> Result<Self, ServiceError> {
        fs::create_dir_all(data_dir.join("folder-lock"))?;
        fs::create_dir_all(data_dir.join("folder-lock-staging"))?;
        FolderLockStore::open(&data_dir)?;
        Ok(Self { data_dir })
    }

    fn store(&self) -> Result<FolderLockStore, ServiceError> {
        Ok(FolderLockStore::open(&self.data_dir)?)
    }

    fn cipher_dir(&self, id: &str) -> PathBuf {
        self.data_dir.join("folder-lock").join(id)
    }

    fn staging_dir(&self, id: &str) -> PathBuf {
        self.data_dir.join("folder-lock-staging").join(id)
    }

    pub fn list(&self) -> Result<Vec<LockedFolderPublic>, ServiceError> {
        let rows = self.store()?.list()?;
        Ok(rows.iter().map(LockedFolderPublic::from).collect())
    }

    pub fn lock_folder(
        &self,
        src: &Path,
        vault_key: &[u8; 32],
        confirm_large: bool,
    ) -> Result<LockedFolderPublic, ServiceError> {
        policy::validate_lock_path(src, Some(&self.data_dir))?;

        let files = collect_files(src)?;
        let size_bytes: u64 = files.iter().map(|(_, len)| *len).sum();
        if size_bytes > SIZE_WARN_BYTES && !confirm_large {
            return Err(ServiceError::NeedsLargeConfirm { size_bytes });
        }

        let id = Uuid::new_v4().to_string();
        let display_name = src
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Folder".into());
        let original_path = src
            .canonicalize()
            .unwrap_or_else(|_| src.to_path_buf())
            .to_string_lossy()
            .into_owned();

        let mut dek = crypto::generate_key();
        let dek_wrapped = match wrap_dek(&dek, vault_key) {
            Ok(w) => w,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };

        let cipher_root = self.cipher_dir(&id);
        let files_dir = cipher_root.join("files");
        fs::create_dir_all(&files_dir)?;

        let mut rel_paths: Vec<String> = Vec::with_capacity(files.len());
        for (abs, _) in &files {
            let rel = rel_path_str(src, abs)?;
            let plain = fs::read(abs)?;
            let blob = match encrypt_file_bytes(&plain, &dek, &id, &rel) {
                Ok(b) => b,
                Err(e) => {
                    dek.zeroize();
                    let _ = fs::remove_dir_all(&cipher_root);
                    return Err(e.into());
                }
            };
            let out = files_dir.join(format!("{}.gvf", encode_rel(&rel)));
            fs::write(&out, blob)?;
            rel_paths.push(rel);
        }

        let manifest_json = serde_json::to_vec(&rel_paths)
            .map_err(|e| ServiceError::Other(e.to_string()))?;
        let manifest_blob = match crypto::encrypt(&manifest_json, &dek) {
            Ok(b) => b,
            Err(e) => {
                dek.zeroize();
                let _ = fs::remove_dir_all(&cipher_root);
                return Err(e.into());
            }
        };
        fs::write(cipher_root.join("manifest.enc"), manifest_blob)?;
        dek.zeroize();

        // Wipe originals then remove empty dirs.
        for (abs, _) in &files {
            secure_wipe_file(abs)?;
            let _ = fs::remove_file(abs);
        }
        remove_empty_dirs_bottom_up(src)?;

        write_stub(src, &id)?;

        let now = chrono::Utc::now().timestamp();
        let row = LockedFolderRow {
            id: id.clone(),
            display_name,
            original_path,
            dek_wrapped,
            status: LockStatus::Locked,
            favorite: false,
            size_bytes,
            created_at: now,
            last_locked_at: now,
            last_unlocked_at: None,
        };
        let store = self.store()?;
        store.insert(&row)?;
        let _ = store.add_activity(&id, "lock", "Folder locked");
        Ok(LockedFolderPublic::from(&row))
    }

    pub fn unlock_to_staging(
        &self,
        id: &str,
        vault_key: &[u8; 32],
    ) -> Result<PathBuf, ServiceError> {
        let store = self.store()?;
        let mut row = store.get(id).map_err(|e| match e {
            StoreError::NotFound => ServiceError::NotFound,
            other => ServiceError::Store(other),
        })?;

        if row.status == LockStatus::Unlocked {
            let staging = self.staging_dir(id);
            if staging.is_dir() {
                return Ok(staging);
            }
        }

        for other in store.list()? {
            if other.id != id && other.status == LockStatus::Unlocked {
                return Err(ServiceError::AlreadyUnlocked);
            }
        }

        let mut dek = unwrap_dek(&row.dek_wrapped, vault_key)?;
        let cipher_root = self.cipher_dir(id);
        let manifest_blob = fs::read(cipher_root.join("manifest.enc"))?;
        let manifest_json = match crypto::decrypt(&manifest_blob, &dek) {
            Ok(j) => j,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };
        let rel_paths: Vec<String> = match serde_json::from_slice(&manifest_json) {
            Ok(v) => v,
            Err(e) => {
                dek.zeroize();
                return Err(ServiceError::Other(e.to_string()));
            }
        };

        let staging = self.staging_dir(id);
        if staging.exists() {
            wipe_dir_tree(&staging)?;
        }
        fs::create_dir_all(&staging)?;

        for rel in &rel_paths {
            let blob_path = cipher_root
                .join("files")
                .join(format!("{}.gvf", encode_rel(rel)));
            let blob = fs::read(&blob_path)?;
            let plain = match decrypt_file_bytes(&blob, &dek, id, rel) {
                Ok(p) => p,
                Err(e) => {
                    dek.zeroize();
                    let _ = wipe_dir_tree(&staging);
                    return Err(e.into());
                }
            };
            let out = staging.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&out, plain)?;
        }
        dek.zeroize();

        let now = chrono::Utc::now().timestamp();
        row.status = LockStatus::Unlocked;
        row.last_unlocked_at = Some(now);
        store.update(&row)?;
        let _ = store.add_activity(id, "unlock", "Unlocked to staging");
        Ok(staging)
    }

    pub fn relock(&self, id: &str) -> Result<(), ServiceError> {
        let store = self.store()?;
        let mut row = store.get(id).map_err(|e| match e {
            StoreError::NotFound => ServiceError::NotFound,
            other => ServiceError::Store(other),
        })?;
        if row.status != LockStatus::Unlocked {
            return Err(ServiceError::NotUnlocked);
        }
        let staging = self.staging_dir(id);
        if staging.exists() {
            wipe_dir_tree(&staging)?;
        }
        row.status = LockStatus::Locked;
        row.last_locked_at = chrono::Utc::now().timestamp();
        store.update(&row)?;
        let _ = store.add_activity(id, "relock", "Staging wiped; folder locked");
        Ok(())
    }

    pub fn wipe_orphan_staging(&self) -> Result<(), ServiceError> {
        let root = self.data_dir.join("folder-lock-staging");
        if !root.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&root)? {
            let entry = entry?;
            wipe_dir_tree(&entry.path())?;
        }
        let store = self.store()?;
        for mut row in store.list()? {
            if row.status == LockStatus::Unlocked {
                row.status = LockStatus::Locked;
                row.last_locked_at = chrono::Utc::now().timestamp();
                store.update(&row)?;
            }
        }
        Ok(())
    }

    /// Decrypt ciphertext back to the original path and remove the lock registration.
    pub fn restore_to_original(
        &self,
        id: &str,
        vault_key: &[u8; 32],
    ) -> Result<(), ServiceError> {
        let store = self.store()?;
        let row = store.get(id).map_err(|e| match e {
            StoreError::NotFound => ServiceError::NotFound,
            other => ServiceError::Store(other),
        })?;

        if row.status == LockStatus::Unlocked {
            let staging = self.staging_dir(id);
            if staging.exists() {
                wipe_dir_tree(&staging)?;
            }
        }

        let mut dek = unwrap_dek(&row.dek_wrapped, vault_key)?;
        let cipher_root = self.cipher_dir(id);
        let manifest_blob = fs::read(cipher_root.join("manifest.enc"))?;
        let manifest_json = match crypto::decrypt(&manifest_blob, &dek) {
            Ok(j) => j,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };
        let rel_paths: Vec<String> = match serde_json::from_slice(&manifest_json) {
            Ok(v) => v,
            Err(e) => {
                dek.zeroize();
                return Err(ServiceError::Other(e.to_string()));
            }
        };

        let dest = PathBuf::from(&row.original_path);
        // Clear stub markers if present.
        let _ = fs::remove_file(dest.join("README.txt"));
        let _ = fs::remove_file(dest.join(".genvault-locked"));
        fs::create_dir_all(&dest)?;

        for rel in &rel_paths {
            let blob_path = cipher_root
                .join("files")
                .join(format!("{}.gvf", encode_rel(rel)));
            let blob = fs::read(&blob_path)?;
            let plain = match decrypt_file_bytes(&blob, &dek, id, rel) {
                Ok(p) => p,
                Err(e) => {
                    dek.zeroize();
                    return Err(e.into());
                }
            };
            let out = dest.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&out, plain)?;
        }
        dek.zeroize();

        let _ = wipe_dir_tree(&cipher_root);
        store.delete(id)?;
        let _ = store.add_activity(id, "restore", "Restored to original path");
        Ok(())
    }

    pub fn set_favorite(&self, id: &str, favorite: bool) -> Result<(), ServiceError> {
        let store = self.store()?;
        let mut row = store.get(id).map_err(|e| match e {
            StoreError::NotFound => ServiceError::NotFound,
            other => ServiceError::Store(other),
        })?;
        row.favorite = favorite;
        store.update(&row)?;
        Ok(())
    }

    pub fn activity(&self, limit: usize) -> Result<Vec<super::store::ActivityRow>, ServiceError> {
        Ok(self.store()?.list_activity(limit)?)
    }
}

fn encode_rel(rel: &str) -> String {
    hex::encode(rel.as_bytes())
}

fn rel_path_str(root: &Path, file: &Path) -> Result<String, ServiceError> {
    let rel = file
        .strip_prefix(root)
        .map_err(|_| ServiceError::Other("path not under root".into()))?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn collect_files(root: &Path) -> Result<Vec<(PathBuf, u64)>, ServiceError> {
    let mut out = Vec::new();
    fn walk(dir: &Path, out: &mut Vec<(PathBuf, u64)>) -> Result<(), ServiceError> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str == ".genvault-locked" || name_str == "README.txt" {
                // Skip stub leftovers if re-locking somehow.
                continue;
            }
            if path.is_dir() {
                walk(&path, out)?;
            } else if path.is_file() {
                let meta = entry.metadata()?;
                out.push((path, meta.len()));
            }
        }
        Ok(())
    }
    walk(root, &mut out)?;
    Ok(out)
}

fn write_stub(dir: &Path, id: &str) -> Result<(), ServiceError> {
    fs::create_dir_all(dir)?;
    fs::write(
        dir.join(".genvault-locked"),
        format!("{id}\n"),
    )?;
    fs::write(
        dir.join("README.txt"),
        format!(
            "This folder is locked by GenVault Folder Lock.\n\
             Folder id: {id}\n\
             Unlock it from GenVault → Folder Lock, or open genvault://folder-lock?action=unlock&id={id}\n"
        ),
    )?;
    Ok(())
}

/// One-pass zero overwrite then truncate (spec: one pass zeros).
fn secure_wipe_file(path: &Path) -> Result<(), ServiceError> {
    let meta = fs::metadata(path)?;
    let len = meta.len() as usize;
    if len == 0 {
        return Ok(());
    }
    let mut f = OpenOptions::new().write(true).open(path)?;
    let chunk = vec![0u8; len.min(1024 * 1024)];
    let mut remaining = len;
    while remaining > 0 {
        let n = remaining.min(chunk.len());
        f.write_all(&chunk[..n])?;
        remaining -= n;
    }
    f.sync_all()?;
    Ok(())
}

fn wipe_dir_tree(path: &Path) -> Result<(), ServiceError> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_file() {
        secure_wipe_file(path)?;
        fs::remove_file(path)?;
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            wipe_dir_tree(&p)?;
        } else {
            secure_wipe_file(&p)?;
            let _ = fs::remove_file(&p);
        }
    }
    let _ = fs::remove_dir_all(path);
    Ok(())
}

fn remove_empty_dirs_bottom_up(root: &Path) -> Result<(), ServiceError> {
    fn walk(dir: &Path, root: &Path) -> Result<(), ServiceError> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                walk(&path, root)?;
            }
        }
        if dir != root {
            // remove_dir fails if not empty — ignore
            let _ = fs::remove_dir(dir);
        }
        Ok(())
    }
    walk(root, root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;

    #[test]
    fn lock_unlock_relock_restore_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("mydocs");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("a.txt"), b"alpha").unwrap();
        fs::write(src.join("sub").join("b.txt"), b"bravo").unwrap();

        let svc = FolderLockService::new(data.clone()).unwrap();
        let vault = crypto::generate_key();

        let pub_row = svc.lock_folder(&src, &vault, true).unwrap();
        assert_eq!(pub_row.status, "locked");
        assert!(src.join(".genvault-locked").is_file());
        assert!(!src.join("a.txt").exists());
        assert!(svc.cipher_dir(&pub_row.id).join("manifest.enc").is_file());

        let staging = svc.unlock_to_staging(&pub_row.id, &vault).unwrap();
        assert_eq!(fs::read_to_string(staging.join("a.txt")).unwrap(), "alpha");
        assert_eq!(
            fs::read_to_string(staging.join("sub").join("b.txt")).unwrap(),
            "bravo"
        );

        svc.relock(&pub_row.id).unwrap();
        assert!(!staging.exists());

        svc.restore_to_original(&pub_row.id, &vault).unwrap();
        assert_eq!(fs::read_to_string(src.join("a.txt")).unwrap(), "alpha");
        assert_eq!(
            fs::read_to_string(src.join("sub").join("b.txt")).unwrap(),
            "bravo"
        );
        assert!(!svc.cipher_dir(&pub_row.id).exists());
        assert!(svc.list().unwrap().is_empty());
    }

    #[test]
    fn one_active_unlock_session() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let a = tmp.path().join("fa");
        let b = tmp.path().join("fb");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        fs::write(a.join("x.txt"), b"x").unwrap();
        fs::write(b.join("y.txt"), b"y").unwrap();

        let svc = FolderLockService::new(data).unwrap();
        let vault = crypto::generate_key();
        let ra = svc.lock_folder(&a, &vault, true).unwrap();
        let rb = svc.lock_folder(&b, &vault, true).unwrap();
        svc.unlock_to_staging(&ra.id, &vault).unwrap();
        assert!(matches!(
            svc.unlock_to_staging(&rb.id, &vault),
            Err(ServiceError::AlreadyUnlocked)
        ));
    }
}
