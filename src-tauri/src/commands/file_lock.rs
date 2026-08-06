//! Tauri commands for File Lock (Windows).

use std::path::PathBuf;
use std::sync::OnceLock;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::commands::get_key;
use crate::file_lock::deep_link::FileLockDeepLink;
use crate::file_lock::service::{
    BatchLockResult, FileLockService, LockedFilePublic, ServiceError,
};
use crate::file_lock::store::ActivityRow;
use crate::store;

static PENDING_DEEP_LINK: OnceLock<Mutex<Option<FileLockDeepLink>>> = OnceLock::new();

fn pending_deep_link() -> &'static Mutex<Option<FileLockDeepLink>> {
    PENDING_DEEP_LINK.get_or_init(|| Mutex::new(None))
}

pub fn stash_file_lock_deep_link(link: FileLockDeepLink) {
    *pending_deep_link().lock() = Some(link);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileLockSettings {
    pub auto_lock_mins: u32,
}

impl Default for FileLockSettings {
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
        Err("File Lock is only available on Windows".into())
    }
}

fn data_dir() -> Result<PathBuf, String> {
    store::data_dir_public().map_err(|e| e.to_string())
}

fn service() -> Result<FileLockService, String> {
    FileLockService::new(data_dir()?).map_err(map_err)
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
    Ok(data_dir()?.join("file_lock_settings.json"))
}

fn load_settings() -> Result<FileLockSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(FileLockSettings::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_settings(settings: &FileLockSettings) -> Result<(), String> {
    if !(1..=240).contains(&settings.auto_lock_mins) {
        return Err("Auto-lock must be between 1 and 240 minutes".into());
    }
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_lock_list() -> Result<Vec<LockedFilePublic>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.list().map_err(map_err)
}

#[tauri::command]
pub fn file_lock_search(query: String) -> Result<Vec<LockedFilePublic>, String> {
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
pub fn file_lock_lock(path: String, confirm_large: bool) -> Result<LockedFilePublic, String> {
    require_windows()?;
    let key = get_key()?;
    service()?
        .lock_file(PathBuf::from(path).as_path(), &key, confirm_large)
        .map_err(map_err)
}

#[tauri::command]
pub fn file_lock_lock_batch(
    paths: Vec<String>,
    confirm_large: bool,
) -> Result<BatchLockResult, String> {
    require_windows()?;
    let key = get_key()?;
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    Ok(service()?.lock_files_batch(&paths, &key, confirm_large))
}

#[tauri::command]
pub fn file_lock_unlock(id: String, open_explorer: bool) -> Result<String, String> {
    require_windows()?;
    let key = get_key()?;
    let staging = service()?.unlock_to_staging(&id, &key).map_err(map_err)?;
    #[cfg(windows)]
    if open_explorer {
        let _ = std::process::Command::new("explorer").arg(&staging).spawn();
    }
    Ok(staging.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn file_lock_relock(id: String) -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.relock(&id).map_err(map_err)
}

#[tauri::command]
pub fn file_lock_restore(id: String) -> Result<(), String> {
    require_windows()?;
    let key = get_key()?;
    service()?.restore_to_original(&id, &key).map_err(map_err)
}

#[tauri::command]
pub fn file_lock_set_favorite(id: String, favorite: bool) -> Result<(), String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.set_favorite(&id, favorite).map_err(map_err)
}

#[tauri::command]
pub fn file_lock_activity(limit: Option<usize>) -> Result<Vec<ActivityRow>, String> {
    require_windows()?;
    let _key = get_key()?;
    service()?.activity(limit.unwrap_or(50)).map_err(map_err)
}

#[tauri::command]
pub fn file_lock_settings_get() -> Result<FileLockSettings, String> {
    require_windows()?;
    let _key = get_key()?;
    load_settings()
}

#[tauri::command]
pub fn file_lock_settings_set(auto_lock_mins: u32) -> Result<FileLockSettings, String> {
    require_windows()?;
    let _key = get_key()?;
    let settings = FileLockSettings { auto_lock_mins };
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn file_lock_crash_recover() -> Result<(), String> {
    require_windows()?;
    let Ok(dir) = data_dir() else {
        return Ok(());
    };
    let Ok(svc) = FileLockService::new(dir) else {
        return Ok(());
    };
    let _ = svc.wipe_orphan_staging();
    Ok(())
}

#[tauri::command]
pub fn file_lock_take_deep_link() -> Option<FileLockDeepLink> {
    pending_deep_link().lock().take()
}
