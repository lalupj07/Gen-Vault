//! File Lock service — encrypt file, staging unlock, wipe, restore.

use super::policy::{self, PolicyError};
use super::store::{FileLockStore, LockStatus, LockedFileRow, StoreError};
use crate::crypto;
use crate::folder_lock::crypto_files::{
    decrypt_file_bytes, encrypt_file_bytes, unwrap_dek, wrap_dek,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroize;

/// Warn when locking a file larger than this (bytes).
pub const SIZE_WARN_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Error, Debug)]
pub enum ServiceError {
    #[error(transparent)]
    Policy(#[from] PolicyError),
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Crypto(#[from] crypto::CryptoError),
    #[error("IO error: {0}")]
    Io(std::io::Error),
    #[error(
        "Access denied — close programs using this file, clear read-only attributes, then retry"
    )]
    AccessDenied,
    #[error("File is larger than 512 MB; confirm to proceed")]
    NeedsLargeConfirm { size_bytes: u64 },
    #[error("File is not unlocked")]
    NotUnlocked,
    #[error("File not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

impl From<std::io::Error> for ServiceError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::PermissionDenied || e.raw_os_error() == Some(5) {
            ServiceError::AccessDenied
        } else {
            ServiceError::Io(e)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedFilePublic {
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

impl From<&LockedFileRow> for LockedFilePublic {
    fn from(r: &LockedFileRow) -> Self {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchLockResult {
    pub locked: Vec<LockedFilePublic>,
    pub failed: Vec<BatchLockFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchLockFailure {
    pub path: String,
    pub error: String,
}

pub struct FileLockService {
    data_dir: PathBuf,
}

impl FileLockService {
    pub fn new(data_dir: PathBuf) -> Result<Self, ServiceError> {
        fs::create_dir_all(data_dir.join("file-lock"))?;
        fs::create_dir_all(data_dir.join("file-lock-staging"))?;
        FileLockStore::open(&data_dir)?;
        Ok(Self { data_dir })
    }

    fn store(&self) -> Result<FileLockStore, ServiceError> {
        Ok(FileLockStore::open(&self.data_dir)?)
    }

    fn cipher_dir(&self, id: &str) -> PathBuf {
        self.data_dir.join("file-lock").join(id)
    }

    fn staging_dir(&self, id: &str) -> PathBuf {
        self.data_dir.join("file-lock-staging").join(id)
    }

    pub fn list(&self) -> Result<Vec<LockedFilePublic>, ServiceError> {
        Ok(self.store()?.list()?.iter().map(LockedFilePublic::from).collect())
    }

    pub fn lock_file(
        &self,
        src: &Path,
        vault_key: &[u8; 32],
        confirm_large: bool,
    ) -> Result<LockedFilePublic, ServiceError> {
        policy::validate_lock_file(src, Some(&self.data_dir))?;

        let size_bytes = fs::metadata(src)?.len();
        if size_bytes > SIZE_WARN_BYTES && !confirm_large {
            return Err(ServiceError::NeedsLargeConfirm { size_bytes });
        }

        prepare_writable(src)?;
        if let Some(parent) = src.parent() {
            prepare_writable(parent)?;
        }
        probe_write_access(src)?;

        let id = Uuid::new_v4().to_string();
        let display_name = src
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file".into());
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
        fs::create_dir_all(&cipher_root)?;

        let plain = fs::read(src)?;
        let blob = match encrypt_file_bytes(&plain, &dek, &id, &original_path) {
            Ok(b) => b,
            Err(e) => {
                dek.zeroize();
                let _ = fs::remove_dir_all(&cipher_root);
                return Err(e.into());
            }
        };
        if let Err(e) = fs::write(cipher_root.join("payload.gvf"), &blob) {
            dek.zeroize();
            let _ = fs::remove_dir_all(&cipher_root);
            return Err(e.into());
        }
        dek.zeroize();

        if let Err(e) = wipe_and_replace_with_stub(src, &id) {
            let _ = fs::remove_dir_all(&cipher_root);
            return Err(e);
        }

        let now = chrono::Utc::now().timestamp();
        let row = LockedFileRow {
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
        let _ = store.add_activity(&id, "lock", "File locked");
        Ok(LockedFilePublic::from(&row))
    }

    pub fn lock_files_batch(
        &self,
        paths: &[PathBuf],
        vault_key: &[u8; 32],
        confirm_large: bool,
    ) -> BatchLockResult {
        let mut locked = Vec::new();
        let mut failed = Vec::new();
        for path in paths {
            match self.lock_file(path, vault_key, confirm_large) {
                Ok(row) => locked.push(row),
                Err(e) => failed.push(BatchLockFailure {
                    path: path.to_string_lossy().into_owned(),
                    error: e.to_string(),
                }),
            }
        }
        BatchLockResult { locked, failed }
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

        let mut dek = unwrap_dek(&row.dek_wrapped, vault_key)?;
        let blob = fs::read(self.cipher_dir(id).join("payload.gvf"))?;
        let plain = match decrypt_file_bytes(&blob, &dek, id, &row.original_path) {
            Ok(p) => p,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };
        dek.zeroize();

        let staging = self.staging_dir(id);
        if staging.exists() {
            wipe_dir_tree(&staging)?;
        }
        fs::create_dir_all(&staging)?;
        let out = staging.join(&row.display_name);
        fs::write(&out, plain)?;

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
        let _ = store.add_activity(id, "relock", "Staging wiped; file locked");
        Ok(())
    }

    pub fn wipe_orphan_staging(&self) -> Result<(), ServiceError> {
        let root = self.data_dir.join("file-lock-staging");
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
        let blob = fs::read(self.cipher_dir(id).join("payload.gvf"))?;
        let plain = match decrypt_file_bytes(&blob, &dek, id, &row.original_path) {
            Ok(p) => p,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };
        dek.zeroize();

        let dest = PathBuf::from(&row.original_path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
            let _ = prepare_writable(parent);
        }
        if dest.exists() {
            prepare_writable(&dest)?;
            let _ = fs::remove_file(&dest);
        }
        fs::write(&dest, plain)?;

        let _ = wipe_dir_tree(&self.cipher_dir(id));
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

fn wipe_and_replace_with_stub(path: &Path, id: &str) -> Result<(), ServiceError> {
    prepare_writable(path)?;
    secure_wipe_file(path)?;
    fs::remove_file(path)?;
    write_stub(path, id)
}

fn write_stub(path: &Path, id: &str) -> Result<(), ServiceError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        prepare_writable(parent)?;
    }
    fs::write(
        path,
        format!(
            "GENVAULT_FILE_LOCK\n\
             id={id}\n\
             \n\
             This file is locked by GenVault File Lock.\n\
             Unlock it from GenVault → File Lock, or open genvault://file-lock?action=unlock&id={id}\n"
        ),
    )?;
    Ok(())
}

fn prepare_writable(path: &Path) -> Result<(), ServiceError> {
    if !path.exists() {
        return Ok(());
    }
    #[cfg(windows)]
    {
        clear_readonly_win(path)?;
    }
    #[cfg(not(windows))]
    {
        let meta = fs::metadata(path)?;
        let mut perms = meta.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            fs::set_permissions(path, perms)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn clear_readonly_win(path: &Path) -> Result<(), ServiceError> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_READONLY, FILE_FLAGS_AND_ATTRIBUTES,
        INVALID_FILE_ATTRIBUTES,
    };
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let attrs = unsafe { GetFileAttributesW(PCWSTR(wide.as_ptr())) };
    if attrs == INVALID_FILE_ATTRIBUTES {
        return Err(std::io::Error::last_os_error().into());
    }
    let readonly = FILE_ATTRIBUTE_READONLY.0;
    if attrs & readonly != 0 {
        let cleared = FILE_FLAGS_AND_ATTRIBUTES(attrs & !readonly);
        unsafe { SetFileAttributesW(PCWSTR(wide.as_ptr()), cleared) }.map_err(|e| {
            ServiceError::Other(format!(
                "failed to clear read-only on {}: {e}",
                path.display()
            ))
        })?;
    }
    Ok(())
}

fn probe_write_access(path: &Path) -> Result<(), ServiceError> {
    prepare_writable(path)?;
    OpenOptions::new().write(true).open(path)?;
    Ok(())
}

fn secure_wipe_file(path: &Path) -> Result<(), ServiceError> {
    prepare_writable(path)?;
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
    prepare_writable(path)?;
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
            fs::remove_file(&p)?;
        }
    }
    prepare_writable(path)?;
    fs::remove_dir(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;

    #[test]
    fn lock_unlock_relock_restore_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("secret.txt");
        fs::write(&src, b"top-secret").unwrap();

        let svc = FileLockService::new(data).unwrap();
        let vault = crypto::generate_key();
        let row = svc.lock_file(&src, &vault, true).unwrap();
        assert_eq!(row.status, "locked");
        assert!(fs::read_to_string(&src).unwrap().contains("GENVAULT_FILE_LOCK"));
        assert!(svc.cipher_dir(&row.id).join("payload.gvf").is_file());

        let staging = svc.unlock_to_staging(&row.id, &vault).unwrap();
        assert_eq!(
            fs::read_to_string(staging.join("secret.txt")).unwrap(),
            "top-secret"
        );

        svc.relock(&row.id).unwrap();
        assert!(!staging.exists());

        svc.restore_to_original(&row.id, &vault).unwrap();
        assert_eq!(fs::read_to_string(&src).unwrap(), "top-secret");
        assert!(svc.list().unwrap().is_empty());
    }

    #[test]
    fn lock_readonly_file() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("ro.txt");
        fs::write(&src, b"ro").unwrap();
        let mut perms = fs::metadata(&src).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&src, perms).unwrap();

        let svc = FileLockService::new(data).unwrap();
        let vault = crypto::generate_key();
        let row = svc.lock_file(&src, &vault, true).unwrap();
        svc.restore_to_original(&row.id, &vault).unwrap();
        assert_eq!(fs::read_to_string(&src).unwrap(), "ro");
    }

    #[test]
    fn batch_partial_success() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let good = tmp.path().join("good.txt");
        fs::write(&good, b"ok").unwrap();
        let missing = tmp.path().join("missing.txt");

        let svc = FileLockService::new(data).unwrap();
        let vault = crypto::generate_key();
        let result = svc.lock_files_batch(&[good.clone(), missing], &vault, true);
        assert_eq!(result.locked.len(), 1);
        assert_eq!(result.failed.len(), 1);
    }
}
