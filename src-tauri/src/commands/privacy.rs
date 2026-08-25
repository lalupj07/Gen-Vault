//! Privacy commands — panic lock, travel mode, guest grants (Phase 1).

use crate::commands::{
    file_lock::wipe_file_lock_orphans_on_startup,
    folder_lock::wipe_folder_lock_orphans_on_startup,
    get_key, lock_vault, media_vault::wipe_media_vault_orphans_on_startup, with_vault,
};
use crate::guest::{self, GuestGrantPublic, GuestKind, GuestUnlockResult};
use crate::media_vault::service::MediaVaultService;
use crate::store;
use zeroize::Zeroize;

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
};

#[cfg(windows)]
fn wipe_all_staging_best_effort() {
    if let Ok(dir) = store::data_dir_public() {
        if let Ok(svc) = MediaVaultService::new(dir) {
            let _ = svc.relock_all_viewing();
        }
    }
    let _ = wipe_folder_lock_orphans_on_startup();
    let _ = wipe_file_lock_orphans_on_startup();
    let _ = wipe_media_vault_orphans_on_startup();
}

/// Lock session and best-effort wipe lock-suite staging. Idempotent when already locked.
pub(crate) fn execute_panic_lock() -> Result<(), String> {
    #[cfg(windows)]
    wipe_all_staging_best_effort();
    lock_vault()
}

#[tauri::command]
pub fn panic_lock() -> Result<(), String> {
    execute_panic_lock()
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

fn window_hwnd(window: &tauri::WebviewWindow) -> Result<isize, String> {
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        Ok(hwnd.0 as isize)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(0)
    }
}

/// Best-effort Windows capture shield for travel mode.
fn set_capture_shield(hwnd: isize, enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if hwnd == 0 {
            return Ok(());
        }
        unsafe {
            let affinity = if enabled {
                WDA_EXCLUDEFROMCAPTURE
            } else {
                WDA_NONE
            };
            SetWindowDisplayAffinity(HWND(hwnd as *mut _), affinity)
                .map_err(|e| format!("Capture shield failed: {e}"))?;
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (hwnd, enabled);
    }
    Ok(())
}

pub(crate) fn travel_mode_enabled() -> Result<bool, String> {
    let _key = get_key()?;
    with_vault(|vault| Ok(vault.settings.travel_mode))
}

/// Block export / backup / erase while travel mode is active (vault must be unlocked).
pub(crate) fn ensure_export_allowed() -> Result<(), String> {
    if travel_mode_enabled()? {
        return Err("Not available while travel mode is enabled".into());
    }
    Ok(())
}

#[tauri::command]
pub fn get_travel_mode(window: tauri::WebviewWindow) -> Result<bool, String> {
    let enabled = travel_mode_enabled()?;
    if enabled {
        let _ = set_capture_shield(window_hwnd(&window)?, true);
    }
    Ok(enabled)
}

#[tauri::command]
pub fn set_travel_mode(
    enabled: bool,
    password: Option<String>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let _key = get_key()?;
    let hwnd = window_hwnd(&window)?;

    if enabled {
        with_vault(|vault| {
            vault.settings.travel_mode = true;
            Ok(())
        })?;
        set_capture_shield(hwnd, true)?;
    } else {
        let pw = password
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "Master password required to disable travel mode".to_string())?;
        verify_master_password(&pw)?;
        with_vault(|vault| {
            vault.settings.travel_mode = false;
            Ok(())
        })?;
        set_capture_shield(hwnd, false)?;
    }
    Ok(())
}

fn parse_guest_kind(kind: &str) -> Result<GuestKind, String> {
    match kind.to_lowercase().as_str() {
        "folder" => Ok(GuestKind::Folder),
        "file" => Ok(GuestKind::File),
        "media" => Ok(GuestKind::Media),
        _ => Err("Invalid guest kind; use folder, file, or media".into()),
    }
}

#[tauri::command]
pub fn guest_grant_create(
    kind: String,
    item_id: String,
    label: String,
    passphrase: String,
    ttl_mins: u32,
) -> Result<GuestGrantPublic, String> {
    let key = get_key()?;
    let kind = parse_guest_kind(&kind)?;
    guest::create_grant(kind, &item_id, &label, &passphrase, ttl_mins, &key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guest_grant_list() -> Result<Vec<GuestGrantPublic>, String> {
    let key = get_key()?;
    guest::list_grants(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guest_grant_revoke(id: String) -> Result<(), String> {
    let key = get_key()?;
    guest::revoke_grant(&id, &key).map_err(|e| e.to_string())
}

/// Guest unlock — no vault session; grant id + passphrase only.
#[tauri::command]
pub fn guest_unlock(grant_id: String, passphrase: String) -> Result<GuestUnlockResult, String> {
    guest::guest_unlock(&grant_id, &passphrase).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panic_lock_idempotent_when_locked() {
        let _ = lock_vault();
        assert!(execute_panic_lock().is_ok());
        assert!(execute_panic_lock().is_ok());
    }
}
