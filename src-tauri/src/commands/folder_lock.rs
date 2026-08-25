//! Tauri commands for Folder Lock (Windows).

use std::path::PathBuf;
use std::sync::OnceLock;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::commands::{ensure_lock_suite_allowed, get_key};
use crate::folder_lock::deep_link::FolderLockDeepLink;
use crate::folder_lock::service::{FolderLockService, LockedFolderPublic, ServiceError};
use crate::folder_lock::store::ActivityRow;
use crate::store;

static PENDING_DEEP_LINK: OnceLock<Mutex<Option<FolderLockDeepLink>>> = OnceLock::new();

pub(crate) fn pending_deep_link() -> &'static Mutex<Option<FolderLockDeepLink>> {
    PENDING_DEEP_LINK.get_or_init(|| Mutex::new(None))
}

/// Store a deep link from process args (called at startup).
pub fn stash_deep_link(link: FolderLockDeepLink) {
    *pending_deep_link().lock() = Some(link);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderLockSettings {
    pub auto_lock_mins: u32,
}

impl Default for FolderLockSettings {
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
        Err("Folder Lock is only available on Windows".into())
    }
}

fn data_dir() -> Result<PathBuf, String> {
    store::data_dir_public().map_err(|e| e.to_string())
}

fn service() -> Result<FolderLockService, String> {
    FolderLockService::new(data_dir()?).map_err(map_err)
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
    Ok(data_dir()?.join("folder_lock_settings.json"))
}

fn load_settings() -> Result<FolderLockSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(FolderLockSettings::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_settings(settings: &FolderLockSettings) -> Result<(), String> {
    if !(1..=240).contains(&settings.auto_lock_mins) {
        return Err("Auto-lock must be between 1 and 240 minutes".into());
    }
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn folder_lock_list() -> Result<Vec<LockedFolderPublic>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.list().map_err(map_err)
}

#[tauri::command]
pub fn folder_lock_search(query: String) -> Result<Vec<LockedFolderPublic>, String> {
    require_windows()?;
    let _key = get_key()?;
    let q = query.trim().to_lowercase();
    let list = service()?.list().map_err(map_err)?;
    if q.is_empty() {
        return Ok(list);
    }
    Ok(list
        .into_iter()
        .filter(|f| {
            f.display_name.to_lowercase().contains(&q)
                || f.original_path.to_lowercase().contains(&q)
        })
        .collect())
}

#[tauri::command]
pub fn folder_lock_lock(path: String, confirm_large: bool) -> Result<LockedFolderPublic, String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let key = get_key()?;
    service()?
        .lock_folder(PathBuf::from(path).as_path(), &key, confirm_large)
        .map_err(map_err)
}

#[tauri::command]
pub fn folder_lock_unlock(id: String, open_explorer: bool) -> Result<String, String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let key = get_key()?;
    let staging = service()?.unlock_to_staging(&id, &key).map_err(map_err)?;
    #[cfg(windows)]
    if open_explorer {
        let _ = std::process::Command::new("explorer")
            .arg(&staging)
            .spawn();
    }
    Ok(staging.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn folder_lock_relock(id: String) -> Result<(), String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let _key = get_key()?;
    service()?.relock(&id).map_err(map_err)
}

#[tauri::command]
pub fn folder_lock_restore(id: String) -> Result<(), String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let key = get_key()?;
    service()?.restore_to_original(&id, &key).map_err(map_err)
}

#[tauri::command]
pub fn folder_lock_set_favorite(id: String, favorite: bool) -> Result<(), String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let _key = get_key()?;
    service()?.set_favorite(&id, favorite).map_err(map_err)
}

#[tauri::command]
pub fn folder_lock_activity(limit: Option<usize>) -> Result<Vec<ActivityRow>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.activity(limit.unwrap_or(50)).map_err(map_err)
}

#[tauri::command]
pub fn folder_lock_settings_get() -> Result<FolderLockSettings, String> {
    require_windows()?;
    let _key = get_key()?;
    load_settings()
}

#[tauri::command]
pub fn folder_lock_settings_set(auto_lock_mins: u32) -> Result<FolderLockSettings, String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let _key = get_key()?;
    let settings = FolderLockSettings { auto_lock_mins };
    save_settings(&settings)?;
    Ok(settings)
}

/// Wipe orphan staging (IPC). Requires vault unlock so a compromised webview
/// cannot destroy plaintext while folders are intentionally unlocked.
/// Process startup uses `wipe_folder_lock_orphans_on_startup` instead (no session yet).
#[tauri::command]
pub fn folder_lock_crash_recover() -> Result<(), String> {
    require_windows()?;
    ensure_lock_suite_allowed()?;
    let _key = get_key()?;
    wipe_folder_lock_orphans_on_startup()
}

/// Best-effort orphan wipe at process start (no unlock session exists yet).
pub fn wipe_folder_lock_orphans_on_startup() -> Result<(), String> {
    require_windows()?;
    let Ok(dir) = data_dir() else {
        return Ok(());
    };
    let Ok(svc) = FolderLockService::new(dir) else {
        return Ok(());
    };
    let _ = svc.wipe_orphan_staging();
    Ok(())
}

/// Take a pending `genvault://folder-lock` deep link (if any).
#[tauri::command]
pub fn folder_lock_take_deep_link() -> Option<FolderLockDeepLink> {
    pending_deep_link().lock().take()
}
