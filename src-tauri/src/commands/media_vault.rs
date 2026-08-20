//! Tauri commands for Media Vault (Windows).

use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::commands::get_key;
use crate::media_vault::service::{
    BatchImportResult, MediaItemPublic, MediaVaultService, ServiceError,
};
use crate::media_vault::store::ActivityRow;
use crate::store;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaVaultSettings {
    pub auto_lock_mins: u32,
}

impl Default for MediaVaultSettings {
    fn default() -> Self {
        Self { auto_lock_mins: 15 }
    }
}

fn require_windows() -> Result<(), String> {
    #[cfg(windows)]
    {
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Media Vault is only available on Windows".into())
    }
}

fn data_dir() -> Result<PathBuf, String> {
    store::data_dir_public().map_err(|e| e.to_string())
}

fn service() -> Result<MediaVaultService, String> {
    MediaVaultService::new(data_dir()?).map_err(map_err)
}

fn map_err(e: ServiceError) -> String {
    match e {
        ServiceError::NeedsLargeConfirm { size_bytes } => {
            format!("NEEDS_LARGE_CONFIRM:{size_bytes}")
        }
        other => other.to_string(),
    }
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("media_vault_settings.json"))
}

fn load_settings() -> Result<MediaVaultSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(MediaVaultSettings::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_settings(settings: &MediaVaultSettings) -> Result<(), String> {
    if !(1..=240).contains(&settings.auto_lock_mins) {
        return Err("Auto-lock must be between 1 and 240 minutes".into());
    }
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

fn verify_master_password(password: &str) -> Result<(), String> {
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    Ok(())
}

#[cfg(windows)]
fn open_with_default_app(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path_str])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn media_vault_list() -> Result<Vec<MediaItemPublic>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.list().map_err(map_err)
}

#[tauri::command]
pub fn media_vault_search(query: String) -> Result<Vec<MediaItemPublic>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.search(&query).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_import(
    path: String,
    delete_original: bool,
    confirm_large: bool,
) -> Result<MediaItemPublic, String> {
    require_windows()?;
    let key = get_key()?;
    service()?
        .import(
            PathBuf::from(path).as_path(),
            &key,
            delete_original,
            confirm_large,
        )
        .map_err(map_err)
}

#[tauri::command]
pub fn media_vault_import_batch(
    paths: Vec<String>,
    delete_original: bool,
    confirm_large: bool,
) -> Result<BatchImportResult, String> {
    require_windows()?;
    let key = get_key()?;
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    service()?
        .import_batch(&paths, &key, delete_original, confirm_large)
        .map_err(map_err)
}

#[tauri::command]
pub fn media_vault_view(id: String) -> Result<String, String> {
    require_windows()?;
    let key = get_key()?;
    let staging = service()?.view(&id, &key).map_err(map_err)?;
    #[cfg(windows)]
    open_with_default_app(&staging)?;
    Ok(staging.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn media_vault_relock(id: String) -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.relock(&id).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_relock_all() -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.relock_all_viewing().map_err(map_err)
}

#[tauri::command]
pub fn media_vault_delete(id: String) -> Result<(), String> {
    require_windows()?;
    let key = get_key()?;
    service()?.delete_item(&id, &key).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_export(id: String, dest_path: String, password: String) -> Result<(), String> {
    require_windows()?;
    verify_master_password(&password)?;
    let key = get_key()?;
    service()?
        .export(&id, PathBuf::from(dest_path).as_path(), &key)
        .map_err(map_err)
}

#[tauri::command]
pub fn media_vault_thumb(id: String) -> Result<String, String> {
    require_windows()?;
    let key = get_key()?;
    let jpeg = service()?.decrypt_thumb(&id, &key).map_err(map_err)?;
    Ok(B64.encode(jpeg))
}

#[tauri::command]
pub fn media_vault_set_favorite(id: String, favorite: bool) -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.set_favorite(&id, favorite).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_set_title(id: String, title: String) -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.set_title(&id, &title).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_set_album(id: String, album: String) -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.set_album(&id, &album).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_activity(limit: Option<usize>) -> Result<Vec<ActivityRow>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.activity(limit.unwrap_or(50)).map_err(map_err)
}

#[tauri::command]
pub fn media_vault_settings_get() -> Result<MediaVaultSettings, String> {
    require_windows()?;
    let _key = get_key()?;
    load_settings()
}

#[tauri::command]
pub fn media_vault_settings_set(auto_lock_mins: u32) -> Result<MediaVaultSettings, String> {
    require_windows()?;
    let _key = get_key()?;
    let settings = MediaVaultSettings { auto_lock_mins };
    save_settings(&settings)?;
    Ok(settings)
}

/// Wipe orphan staging (IPC). Requires vault unlock.
#[tauri::command]
pub fn media_vault_crash_recover() -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    wipe_media_vault_orphans_on_startup()
}

/// Best-effort orphan wipe at process start (no unlock session exists yet).
pub fn wipe_media_vault_orphans_on_startup() -> Result<(), String> {
    crate::media_vault::service::wipe_media_vault_orphans_on_startup()
}
