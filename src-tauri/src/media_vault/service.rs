//! Media Vault import — encrypt payload + optional thumbnail, persist metadata.

use super::policy::{self, MediaKind, PolicyError};
use super::store::{ItemStatus, MediaItemRow, MediaVaultStore, StoreError};
use super::thumb;
use crate::crypto;
use crate::folder_lock::crypto_files::{
    decrypt_file_bytes, encrypt_file_bytes, unwrap_dek, wrap_dek,
};
use crate::folder_lock::remove_if_link;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroize;

/// Warn when importing a file larger than this (bytes).
pub const SIZE_WARN_BYTES: u64 = 256 * 1024 * 1024;
/// Hard reject imports larger than this (bytes).
pub const SIZE_MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;

const THUMB_MAX_EDGE: u32 = 256;
const THUMB_BASENAME: &str = "thumb.gvt";
const PAYLOAD_BASENAME: &str = "payload.gvm";

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
    #[error("File is larger than 256 MB; confirm to proceed")]
    NeedsLargeConfirm { size_bytes: u64 },
    #[error("File exceeds maximum import size of 2 GB")]
    ExceedsMaxSize { size_bytes: u64 },
    #[error("Item not found")]
    NotFound,
    #[error("Item is not being viewed")]
    NotViewing,
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
pub struct MediaItemPublic {
    pub id: String,
    pub title: String,
    pub album: String,
    pub mime: String,
    pub status: String,
    pub favorite: bool,
    pub size_bytes: u64,
    pub imported_at: i64,
    pub original_name: String,
}

impl From<&MediaItemRow> for MediaItemPublic {
    fn from(r: &MediaItemRow) -> Self {
        Self {
            id: r.id.clone(),
            title: r.title.clone(),
            album: r.album.clone(),
            mime: r.mime.clone(),
            status: r.status.as_str().to_string(),
            favorite: r.favorite,
            size_bytes: r.size_bytes,
            imported_at: r.imported_at,
            original_name: r.original_name.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportResult {
    pub imported: Vec<MediaItemPublic>,
    pub failed: Vec<BatchImportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportFailure {
    pub path: String,
    pub error: String,
}

pub struct MediaVaultService {
    data_dir: PathBuf,
}

impl MediaVaultService {
    pub fn new(data_dir: PathBuf) -> Result<Self, ServiceError> {
        fs::create_dir_all(data_dir.join("media-vault"))?;
        fs::create_dir_all(data_dir.join("media-vault-staging"))?;
        MediaVaultStore::new(data_dir.clone())?;
        Ok(Self { data_dir })
    }

    fn store(&self) -> Result<MediaVaultStore, ServiceError> {
        Ok(MediaVaultStore::new(self.data_dir.clone())?)
    }

    fn item_dir(&self, id: &str) -> PathBuf {
        self.data_dir.join("media-vault").join(id)
    }

    fn staging_dir(&self, id: &str) -> PathBuf {
        self.data_dir.join("media-vault-staging").join(id)
    }

    fn map_store_err(e: StoreError) -> ServiceError {
        match e {
            StoreError::NotFound => ServiceError::NotFound,
            other => ServiceError::Store(other),
        }
    }

    fn decrypt_payload(
        &self,
        row: &MediaItemRow,
        vault_key: &[u8; 32],
    ) -> Result<Vec<u8>, ServiceError> {
        let mut dek = unwrap_dek(&row.wrapped_dek, vault_key)?;
        let blob = fs::read(self.item_dir(&row.id).join(PAYLOAD_BASENAME))?;
        let plain = match decrypt_file_bytes(
            &blob,
            &dek,
            "media",
            &media_rel_aad(&row.id, &row.original_name),
        ) {
            Ok(p) => p,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };
        dek.zeroize();
        Ok(plain)
    }

    pub fn view(&self, id: &str, vault_key: &[u8; 32]) -> Result<PathBuf, ServiceError> {
        let store = self.store()?;
        let row = store.get(id).map_err(Self::map_store_err)?;

        if row.status == ItemStatus::Viewing {
            let out = self.staging_dir(id).join(&row.original_name);
            if out.is_file() {
                return Ok(out);
            }
        }

        let plain = self.decrypt_payload(&row, vault_key)?;
        let staging = self.staging_dir(id);
        if staging.exists() {
            wipe_dir_tree(&staging)?;
        }
        fs::create_dir_all(&staging)?;
        let out = staging.join(&row.original_name);
        fs::write(&out, plain)?;

        store.update_status(id, ItemStatus::Viewing)?;
        let _ = store.add_activity(id, "viewed", "Decrypted to staging for viewing");
        Ok(out)
    }

    pub fn relock(&self, id: &str) -> Result<(), ServiceError> {
        let store = self.store()?;
        let row = store.get(id).map_err(Self::map_store_err)?;
        if row.status != ItemStatus::Viewing {
            return Err(ServiceError::NotViewing);
        }
        let staging = self.staging_dir(id);
        if staging.exists() {
            wipe_dir_tree(&staging)?;
        }
        store.update_status(id, ItemStatus::Stored)?;
        let _ = store.add_activity(id, "relocked", "Staging wiped; item stored");
        Ok(())
    }

    pub fn relock_all_viewing(&self) -> Result<(), ServiceError> {
        let store = self.store()?;
        for row in store.list()? {
            if row.status == ItemStatus::Viewing {
                self.relock(&row.id)?;
            }
        }
        Ok(())
    }

    pub fn delete_item(&self, id: &str, vault_key: &[u8; 32]) -> Result<(), ServiceError> {
        let _ = vault_key;
        let store = self.store()?;
        store.get(id).map_err(Self::map_store_err)?;

        let staging = self.staging_dir(id);
        if staging.exists() {
            wipe_dir_tree(&staging)?;
        }
        let item_dir = self.item_dir(id);
        if item_dir.exists() {
            wipe_dir_tree(&item_dir)?;
        }
        store.delete(id)?;
        let _ = store.add_activity(id, "deleted", "Removed from Media Vault");
        Ok(())
    }

    pub fn export(
        &self,
        id: &str,
        dest: &Path,
        vault_key: &[u8; 32],
    ) -> Result<(), ServiceError> {
        let store = self.store()?;
        let row = store.get(id).map_err(Self::map_store_err)?;
        let plain = self.decrypt_payload(&row, vault_key)?;

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
            let _ = prepare_writable(parent);
        }
        if dest.exists() {
            prepare_writable(dest)?;
            let _ = fs::remove_file(dest);
        }
        fs::write(dest, plain)?;
        let _ = store.add_activity(id, "exported", "Exported to user path");
        Ok(())
    }

    pub fn wipe_orphan_staging(&self) -> Result<(), ServiceError> {
        let root = self.data_dir.join("media-vault-staging");
        if root.exists() {
            for entry in fs::read_dir(&root)? {
                wipe_dir_tree(&entry?.path())?;
            }
        }
        let store = self.store()?;
        for row in store.list()? {
            if row.status == ItemStatus::Viewing {
                store.update_status(&row.id, ItemStatus::Stored)?;
            }
        }
        Ok(())
    }

    pub fn decrypt_thumb(&self, id: &str, vault_key: &[u8; 32]) -> Result<Vec<u8>, ServiceError> {
        let store = self.store()?;
        let row = store.get(id).map_err(Self::map_store_err)?;
        let thumb_path = self.item_dir(id).join(THUMB_BASENAME);
        if !thumb_path.is_file() {
            return Err(ServiceError::NotFound);
        }
        let mut dek = unwrap_dek(&row.wrapped_dek, vault_key)?;
        let blob = fs::read(thumb_path)?;
        let jpeg = match decrypt_file_bytes(
            &blob,
            &dek,
            "media",
            &media_rel_aad(id, THUMB_BASENAME),
        ) {
            Ok(p) => p,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };
        dek.zeroize();
        Ok(jpeg)
    }

    pub fn list(&self) -> Result<Vec<MediaItemPublic>, ServiceError> {
        Ok(self
            .store()?
            .list()?
            .iter()
            .map(MediaItemPublic::from)
            .collect())
    }

    pub fn search(&self, query: &str) -> Result<Vec<MediaItemPublic>, ServiceError> {
        Ok(self
            .store()?
            .search(query)?
            .iter()
            .map(MediaItemPublic::from)
            .collect())
    }

    pub fn set_favorite(&self, id: &str, favorite: bool) -> Result<(), ServiceError> {
        let store = self.store()?;
        let mut row = store.get(id).map_err(Self::map_store_err)?;
        row.favorite = favorite;
        store.update(&row)?;
        Ok(())
    }

    pub fn set_title(&self, id: &str, title: &str) -> Result<(), ServiceError> {
        let store = self.store()?;
        let mut row = store.get(id).map_err(Self::map_store_err)?;
        row.title = title.to_string();
        store.update(&row)?;
        Ok(())
    }

    pub fn set_album(&self, id: &str, album: &str) -> Result<(), ServiceError> {
        let store = self.store()?;
        let mut row = store.get(id).map_err(Self::map_store_err)?;
        row.album = album.to_string();
        store.update(&row)?;
        Ok(())
    }

    pub fn activity(&self, limit: usize) -> Result<Vec<super::store::ActivityRow>, ServiceError> {
        Ok(self.store()?.list_activity(limit)?)
    }

    pub fn import(
        &self,
        path: &Path,
        vault_key: &[u8; 32],
        delete_original: bool,
        confirm_large: bool,
    ) -> Result<MediaItemPublic, ServiceError> {
        let kind = policy::validate_import_path(path, Some(&self.data_dir))?;

        let size_bytes = fs::metadata(path)?.len();
        if size_bytes > SIZE_MAX_BYTES {
            return Err(ServiceError::ExceedsMaxSize { size_bytes });
        }
        if size_bytes > SIZE_WARN_BYTES && !confirm_large {
            return Err(ServiceError::NeedsLargeConfirm { size_bytes });
        }

        if delete_original {
            prepare_writable(path)?;
            if let Some(parent) = path.parent() {
                prepare_writable(parent)?;
            }
            probe_write_access(path)?;
        }

        let original_name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file".into());
        let title = title_from_filename(&original_name);
        let mime = mime_from_path(path);

        let id = Uuid::new_v4().to_string();
        let item_dir = self.item_dir(&id);

        let mut dek = crypto::generate_key();
        let wrapped_dek = match wrap_dek(&dek, vault_key) {
            Ok(w) => w,
            Err(e) => {
                dek.zeroize();
                return Err(e.into());
            }
        };

        fs::create_dir_all(&item_dir)?;

        let plain = fs::read(path)?;
        let payload_blob = match encrypt_file_bytes(&plain, &dek, "media", &media_rel_aad(&id, &original_name))
        {
            Ok(b) => b,
            Err(e) => {
                dek.zeroize();
                let _ = fs::remove_dir_all(&item_dir);
                return Err(e.into());
            }
        };
        if let Err(e) = fs::write(item_dir.join(PAYLOAD_BASENAME), &payload_blob) {
            dek.zeroize();
            let _ = fs::remove_dir_all(&item_dir);
            return Err(e.into());
        }

        if kind == MediaKind::Image {
            if let Ok(thumb_jpeg) = thumb::generate_jpeg_thumb(&plain, THUMB_MAX_EDGE) {
                let thumb_blob = encrypt_file_bytes(
                    &thumb_jpeg,
                    &dek,
                    "media",
                    &media_rel_aad(&id, THUMB_BASENAME),
                );
                if let Ok(blob) = thumb_blob {
                    let _ = fs::write(item_dir.join(THUMB_BASENAME), blob);
                }
            }
        }
        dek.zeroize();

        let now = chrono::Utc::now().timestamp();
        let row = MediaItemRow {
            id: id.clone(),
            title,
            album: String::new(),
            mime,
            size_bytes,
            imported_at: now,
            favorite: false,
            status: ItemStatus::Stored,
            wrapped_dek,
            original_name,
        };

        let store = self.store()?;
        if let Err(e) = store.insert(&row) {
            let _ = fs::remove_dir_all(&item_dir);
            return Err(e.into());
        }
        let _ = store.add_activity(&id, "imported", "Media imported into vault");

        if delete_original {
            prepare_writable(path)?;
            secure_wipe_file(path)?;
            fs::remove_file(path)?;
        }

        Ok(MediaItemPublic::from(&row))
    }

    pub fn import_batch(
        &self,
        paths: &[PathBuf],
        vault_key: &[u8; 32],
        delete_original: bool,
        confirm_large: bool,
    ) -> Result<BatchImportResult, ServiceError> {
        let mut imported = Vec::new();
        let mut failed = Vec::new();
        for path in paths {
            match self.import(path, vault_key, delete_original, confirm_large) {
                Ok(item) => imported.push(item),
                Err(e) => failed.push(BatchImportFailure {
                    path: path.to_string_lossy().into_owned(),
                    error: e.to_string(),
                }),
            }
        }
        Ok(BatchImportResult { imported, failed })
    }
}

fn media_rel_aad(id: &str, basename: &str) -> String {
    format!("{id}\0{basename}")
}

fn title_from_filename(original_name: &str) -> String {
    Path::new(original_name)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| original_name.to_string())
}

fn mime_from_path(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "heic" => "image/heic",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
    .to_string()
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
    if remove_if_link(path)? || !path.exists() {
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
        if remove_if_link(&p)? {
            continue;
        }
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

/// Best-effort orphan wipe at process start (no unlock session exists yet).
pub fn wipe_media_vault_orphans_on_startup() -> Result<(), String> {
    #[cfg(not(windows))]
    return Ok(());
    #[cfg(windows)]
    {
        let Ok(dir) = crate::store::data_dir_public() else {
            return Ok(());
        };
        let Ok(svc) = MediaVaultService::new(dir) else {
            return Ok(());
        };
        let _ = svc.wipe_orphan_staging();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;
    use crate::folder_lock::crypto_files::decrypt_file_bytes;

    // Minimal valid 1×1 JPEG (JFIF) — same bytes as thumb.rs tests.
    const TINY_JPEG: &[u8] = &[
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
        0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B,
        0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31,
        0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF,
        0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00,
        0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
        0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05,
        0x04, 0x04, 0x00, 0x00, 0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21,
        0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A,
        0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37,
        0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56,
        0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93,
        0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9,
        0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6,
        0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7,
        0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5,
        0xDB, 0x20, 0xA8, 0xF1, 0x7E, 0xFF, 0xD9,
    ];

    #[test]
    fn import_jpg_delete_original() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("photo.jpg");
        fs::write(&src, TINY_JPEG).unwrap();

        let svc = MediaVaultService::new(data.clone()).unwrap();
        let vault_key = crypto::generate_key();
        let item = svc
            .import(&src, &vault_key, true, true)
            .expect("import jpg");

        assert_eq!(item.status, "stored");
        assert_eq!(item.mime, "image/jpeg");
        assert_eq!(item.original_name, "photo.jpg");
        assert_eq!(item.title, "photo");
        assert!(!src.exists(), "original should be removed");

        let item_dir = data.join("media-vault").join(&item.id);
        assert!(item_dir.join(PAYLOAD_BASENAME).is_file());
        assert!(item_dir.join(THUMB_BASENAME).is_file());

        let row = svc.store().unwrap().get(&item.id).unwrap();
        assert_eq!(row.status, ItemStatus::Stored);

        let mut dek = crate::folder_lock::crypto_files::unwrap_dek(&row.wrapped_dek, &vault_key)
            .unwrap();
        let payload_blob = fs::read(item_dir.join(PAYLOAD_BASENAME)).unwrap();
        let plain = decrypt_file_bytes(
            &payload_blob,
            &dek,
            "media",
            &media_rel_aad(&item.id, "photo.jpg"),
        )
        .unwrap();
        dek.zeroize();
        assert_eq!(plain, TINY_JPEG);
    }

    #[test]
    fn import_view_relock_delete_flow() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("photo.jpg");
        fs::write(&src, TINY_JPEG).unwrap();

        let svc = MediaVaultService::new(data.clone()).unwrap();
        let vault_key = crypto::generate_key();
        let item = svc
            .import(&src, &vault_key, true, true)
            .expect("import jpg");

        let staging_path = svc.view(&item.id, &vault_key).unwrap();
        assert_eq!(staging_path.file_name().unwrap(), "photo.jpg");
        assert_eq!(fs::read(&staging_path).unwrap(), TINY_JPEG);
        assert_eq!(
            svc.store().unwrap().get(&item.id).unwrap().status,
            ItemStatus::Viewing
        );

        svc.relock(&item.id).unwrap();
        assert!(!data.join("media-vault-staging").join(&item.id).exists());
        assert_eq!(
            svc.store().unwrap().get(&item.id).unwrap().status,
            ItemStatus::Stored
        );

        svc.delete_item(&item.id, &vault_key).unwrap();
        assert!(!svc.item_dir(&item.id).exists());
        assert!(matches!(
            svc.store().unwrap().get(&item.id),
            Err(StoreError::NotFound)
        ));
    }

    #[test]
    fn export_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("photo.jpg");
        fs::write(&src, TINY_JPEG).unwrap();

        let svc = MediaVaultService::new(data).unwrap();
        let vault_key = crypto::generate_key();
        let item = svc.import(&src, &vault_key, false, true).unwrap();

        let dest = tmp.path().join("exported.jpg");
        svc.export(&item.id, &dest, &vault_key).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), TINY_JPEG);
    }

    #[test]
    fn decrypt_thumb_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("photo.jpg");
        fs::write(&src, TINY_JPEG).unwrap();

        let svc = MediaVaultService::new(data).unwrap();
        let vault_key = crypto::generate_key();
        let item = svc.import(&src, &vault_key, false, true).unwrap();

        let jpeg = svc.decrypt_thumb(&item.id, &vault_key).unwrap();
        assert!(!jpeg.is_empty());
        assert_eq!(&jpeg[0..2], &[0xFF, 0xD8]);
    }

    #[test]
    fn wipe_orphan_staging_resets_viewing() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let src = tmp.path().join("photo.jpg");
        fs::write(&src, TINY_JPEG).unwrap();

        let svc = MediaVaultService::new(data.clone()).unwrap();
        let vault_key = crypto::generate_key();
        let item = svc.import(&src, &vault_key, true, true).unwrap();
        svc.view(&item.id, &vault_key).unwrap();
        assert!(data.join("media-vault-staging").join(&item.id).exists());

        svc.wipe_orphan_staging().unwrap();
        assert!(!data.join("media-vault-staging").join(&item.id).exists());
        assert_eq!(
            svc.store().unwrap().get(&item.id).unwrap().status,
            ItemStatus::Stored
        );

        let orphan = data.join("media-vault-staging").join("orphan-id");
        fs::create_dir_all(&orphan).unwrap();
        fs::write(orphan.join("leftover.bin"), b"secret").unwrap();
        svc.wipe_orphan_staging().unwrap();
        assert!(!orphan.exists());
    }
}
