use std::sync::atomic::{AtomicBool, Ordering};
use uuid::Uuid;
use zeroize::Zeroize;

use super::{entry_public, get_key, now_ts, session, validate_master_password, with_vault};
use crate::hello;
use crate::models::*;
use crate::rate_limit;
use crate::store;

static SIGNUP_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

pub(crate) fn finalize_unlock(key: [u8; 32]) -> Result<User, String> {
    // Purge legacy PIN wraps so PIN cannot remain a sole unlock factor.
    let _ = store::delete_secret("pin", &key);
    *session().lock() = Some(key);

    with_vault(|vault| {
        if let Some(ref mut user) = vault.user {
            user.last_login = now_ts();
        }

        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "login_success".to_string(),
            message: "Successful login".to_string(),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });

        vault.sessions.push(Session {
            id: Uuid::new_v4().to_string(),
            device_id: vault
                .devices
                .first()
                .map(|d| d.id.clone())
                .unwrap_or_default(),
            ip: "127.0.0.1".to_string(),
            location: "Local".to_string(),
            started_at: now_ts(),
            last_active: now_ts(),
            is_active: true,
        });

        if let Some(dev) = vault.devices.iter_mut().find(|d| d.is_current) {
            dev.last_active = now_ts();
        }

        Ok(())
    })?;

    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    vault.user.ok_or_else(|| "User data corrupted".to_string())
}
#[tauri::command]
pub fn check_account_exists() -> Result<bool, String> {
    store::account_exists().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_login_hint() -> Result<Option<String>, String> {
    store::get_login_hint().map_err(|e| e.to_string())
}

/// Tell the frontend whether to show first-time setup or unlock login.
#[tauri::command]
pub fn get_auth_screen_mode() -> Result<String, String> {
    if !store::account_exists().map_err(|e| e.to_string())? {
        return Ok("setup".to_string());
    }
    match store::load_meta() {
        Ok(meta) if meta.methods.is_empty() => Ok("setup".to_string()),
        Ok(_) => Ok("login".to_string()),
        Err(_) => Ok("setup".to_string()),
    }
}

/// Wipe all local vault data (for troubleshooting stuck signup).
/// Only allowed when no account exists or signup was left incomplete.
#[tauri::command]
pub fn reset_local_account() -> Result<(), String> {
    if store::account_exists().map_err(|e| e.to_string())?
        && !store::is_incomplete_account().map_err(|e| e.to_string())?
    {
        return Err(
            "Cannot reset a completed account from the login screen. Unlock and delete from settings, or use account recovery."
                .to_string(),
        );
    }
    store::delete_account().map_err(|e| e.to_string())
}

const VAULT_ERASE_CONFIRMATION: &str = "DELETE MY VAULT";
static RESET_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Permanently erase the local vault from the login screen when the user has lost
/// both the master password and all recovery codes. Requires the exact literal
/// confirmation phrase plus a native OS confirm dialog (outside the webview).
/// This never decrypts or returns vault data — it only destroys local encrypted
/// data so the device can start a new account.
#[tauri::command]
pub fn erase_vault_and_reset(confirmation: String) -> Result<(), String> {
    if confirmation != VAULT_ERASE_CONFIRMATION {
        return Err("Vault erase confirmation did not match.".to_string());
    }

    rate_limit::check_allowed("vault_erase")?;

    if RESET_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Vault erase is already in progress.".to_string());
    }

    let result = erase_vault_and_reset_inner();
    RESET_IN_PROGRESS.store(false, Ordering::SeqCst);
    if result.is_err() {
        let _ = rate_limit::record_failure("vault_erase");
    }
    result
}

fn erase_vault_and_reset_inner() -> Result<(), String> {
    if !confirm_vault_erase_native() {
        return Err("Vault erase was cancelled.".to_string());
    }

    {
        let mut guard = session().lock();
        if let Some(ref mut key) = *guard {
            key.zeroize();
        }
        *guard = None;
    }

    // Best-effort: rate-limit file lives inside the vault data dir and is wiped below.
    let _ = rate_limit::reset();
    store::delete_account().map_err(|_| {
        "The vault could not be fully erased. Try again or reinstall the app.".to_string()
    })
}

/// Native confirm outside the webview so IPC alone cannot silently wipe the vault.
fn confirm_vault_erase_native() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::UI::WindowsAndMessaging::{
            MessageBoxW, MB_ICONWARNING, MB_YESNO, IDYES,
        };

        let title: Vec<u16> = std::ffi::OsStr::new("GenVault — Erase vault?")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let body: Vec<u16> = std::ffi::OsStr::new(
            "This permanently deletes all local vault data on this device.\n\n\
             GenXis cannot restore a zero-knowledge vault.\n\n\
             Continue?",
        )
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

        let result = unsafe {
            MessageBoxW(
                None,
                PCWSTR(body.as_ptr()),
                PCWSTR(title.as_ptr()),
                MB_YESNO | MB_ICONWARNING,
            )
        };
        result == IDYES
    }
    #[cfg(not(windows))]
    {
        // Non-Windows: phrase confirmation alone (platform has no MessageBox path here).
        true
    }
}

/// Accepts both camelCase (Tauri default IPC) and snake_case keys.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignUpRequest {
    pub username: String,
    #[serde(alias = "display_name")]
    pub display_name: String,
    #[serde(alias = "master_password")]
    pub master_password: String,
}

#[tauri::command]
pub fn sign_up(request: SignUpRequest) -> Result<User, String> {
    if SIGNUP_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Account creation is already in progress. Please wait.".to_string());
    }
    let result = sign_up_inner(
        request.username,
        request.display_name,
        request.master_password,
    );
    SIGNUP_IN_PROGRESS.store(false, Ordering::SeqCst);
    result
}

fn sign_up_inner(
    username: String,
    display_name: String,
    master_password: String,
) -> Result<User, String> {
    let username = username.trim().to_string();
    if username.is_empty() {
        return Err("Username is required".to_string());
    }
    if display_name.trim().is_empty() {
        return Err("Display name is required".to_string());
    }

    if store::account_exists().map_err(|e| format!("Failed to check account existence: {}", e))? {
        if store::should_reset_for_signup(&master_password).map_err(|e| e.to_string())? {
            store::delete_account()
                .map_err(|e| format!("Failed to reset incomplete account: {}", e))?;
        } else {
            #[cfg(target_os = "android")]
            const RESET_HINT: &str = "An account already exists on this device. Sign in with your password, or clear GenVault app data in Settings and try again.";
            #[cfg(not(target_os = "android"))]
            const RESET_HINT: &str = "An account already exists on this device. Sign in with your password, or delete %LOCALAPPDATA%\\GenVault and try again.";
            return Err(RESET_HINT.to_string());
        }
    }

    validate_master_password(&master_password)?;

    let key =
        store::create_account(&username).map_err(|e| format!("Failed to create account: {}", e))?;
    *session().lock() = Some(key);

    if let Err(e) = store::enroll_secret("password", &master_password, &key) {
        rollback_failed_signup();
        return Err(format!("Failed to enroll password: {}", e));
    }

    let user = User {
        id: Uuid::new_v4().to_string(),
        username: username.clone(),
        display_name: display_name.trim().to_string(),
        created_at: now_ts(),
        last_login: now_ts(),
        is_onboarded: false,
        mfa_enabled: true,
        biometric_enabled: false,
        security_tier: "Advanced".to_string(),
    };

    if let Err(e) = with_vault(|vault| {
        vault.user = Some(user.clone());

        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "account_created".to_string(),
            message: format!("Account created for {}", username),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });

        vault.devices.push(DeviceEntry {
            id: Uuid::new_v4().to_string(),
            name: whoami::fallible::hostname().unwrap_or_else(|_| "Unknown".to_string()),
            device_type: "desktop".to_string(),
            os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            last_active: now_ts(),
            trust_level: 1.0,
            is_current: true,
            ip_address: "127.0.0.1".to_string(),
        });

        Ok(())
    }) {
        rollback_failed_signup();
        return Err(format!("Failed to save account data: {}", e));
    }

    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    vault.user.ok_or_else(|| "User data corrupted".to_string())
}

fn rollback_failed_signup() {
    let _ = store::delete_account();
    let mut guard = session().lock();
    if let Some(ref mut key) = *guard {
        key.zeroize();
    }
    *guard = None;
}

/// Legacy login disabled — use unlock_with_password or setup_master_password_from_legacy.
#[tauri::command]
pub fn log_in(_username: String) -> Result<User, String> {
    Err("Legacy login is disabled. Use your master password to unlock.".to_string())
}

/// One-time migration: legacy keyring-only accounts enroll a master password.
#[tauri::command]
pub fn setup_master_password_from_legacy(password: String) -> Result<User, String> {
    rate_limit::check_allowed("unlock")?;
    validate_master_password(&password)?;
    let info = store::unlock_info().map_err(|e| e.to_string())?;
    if !info.legacy {
        return Err("Account is not in legacy mode. Use unlock_with_password.".to_string());
    }
    match store::authenticate(None) {
        Ok(key) => {
            store::enroll_secret("password", &password, &key).map_err(|e| e.to_string())?;
            rate_limit::record_success("unlock").map_err(|e| e.to_string())?;
            finalize_unlock(key)
        }
        Err(e) => {
            let _ = rate_limit::record_failure("unlock");
            Err(e.to_string())
        }
    }
}

/// Report how the local vault can be unlocked on this device.
#[tauri::command]
pub fn get_unlock_info() -> Result<UnlockInfo, String> {
    store::unlock_info().map_err(|e| e.to_string())
}

/// Unlock using the master password.
#[tauri::command]
pub fn unlock_with_password(password: String) -> Result<User, String> {
    rate_limit::check_allowed("unlock")?;
    match store::unlock_with_secret("password", &password) {
        Ok(key) => {
            rate_limit::record_success("unlock").map_err(|e| e.to_string())?;
            finalize_unlock(key)
        }
        Err(e) => {
            let _ = rate_limit::record_failure("unlock");
            Err(e.to_string())
        }
    }
}

/// Unlock using the PIN — disabled (PIN must not recover VMK).
#[tauri::command]
pub fn unlock_with_pin(_pin: String) -> Result<User, String> {
    Err("PIN unlock is disabled. Use your master password.".to_string())
}

/// Unlock with biometrics + master password.
/// Biometric consent is a presence proof; VMK is recovered only from the password wrap
/// (DPAPI Hello protector alone cannot unlock — closes same-user malware gap).
#[tauri::command]
pub fn unlock_with_hello(window: tauri::WebviewWindow, password: String) -> Result<User, String> {
    rate_limit::check_allowed("unlock")?;
    if password.is_empty() {
        return Err("Master password is required with biometric unlock".to_string());
    }
    let hwnd = window_hwnd(&window)?;
    let verified = hello::request_consent("Unlock your GenVault", hwnd)?;
    if !verified {
        let _ = rate_limit::record_failure("unlock");
        return Err("Biometric verification was not completed".to_string());
    }
    match store::unlock_with_secret("password", &password) {
        Ok(key) => {
            rate_limit::record_success("unlock").map_err(|e| e.to_string())?;
            finalize_unlock(key)
        }
        Err(e) => {
            let _ = rate_limit::record_failure("unlock");
            Err(e.to_string())
        }
    }
}

/// Whether Windows Hello is available on this device.
#[tauri::command]
pub fn hello_available() -> bool {
    hello::is_available()
}

// ===== Unlock Method Enrollment (requires an unlocked vault) =====

/// Set (or replace) the master password. Transitions the account to secure mode.
#[tauri::command]
pub fn set_master_password(password: String) -> Result<(), String> {
    validate_master_password(&password)?;
    let key = get_key()?;
    store::enroll_secret("password", &password, &key).map_err(|e| e.to_string())?;
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "master_password_set".to_string(),
            message: "Master password enrolled".to_string(),
            timestamp: now_ts(),
            severity: "critical".to_string(),
        });
        Ok(())
    })
}

/// Set unlock PIN — disabled (PIN must not wrap VMK).
#[tauri::command]
pub fn set_pin(_pin: String) -> Result<(), String> {
    Err("PIN unlock is disabled. Use your master password.".to_string())
}

/// Remove the unlock PIN.
#[tauri::command]
pub fn remove_pin() -> Result<(), String> {
    let key = get_key()?;
    store::delete_secret("pin", &key).map_err(|e| e.to_string())?;
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "pin_removed".to_string(),
            message: "Unlock PIN removed".to_string(),
            timestamp: now_ts(),
            severity: "warning".to_string(),
        });
        Ok(())
    })
}

/// Check if PIN is enrolled — always false (PIN unlock disabled).
#[tauri::command]
pub fn has_pin() -> Result<bool, String> {
    Ok(false)
}

/// Enroll Windows Hello as a convenience unlock method.
#[tauri::command]
pub fn enroll_hello(window: tauri::WebviewWindow) -> Result<(), String> {
    if !hello::is_available() {
        return Err("Biometric unlock is not available on this device".to_string());
    }
    let hwnd = window_hwnd(&window)?;
    let verified = hello::request_consent("Enable Windows Hello for GenVault", hwnd)?;
    if !verified {
        return Err("Biometric verification was not completed".to_string());
    }
    let key = get_key()?;
    store::enroll_hello(&key).map_err(|e| e.to_string())?;
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "hello_enrolled".to_string(),
            message: "Biometric unlock enabled".to_string(),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });
        Ok(())
    })
}

#[cfg(windows)]
fn window_hwnd(window: &tauri::WebviewWindow) -> Result<isize, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    Ok(hwnd.0 as isize)
}

#[cfg(not(windows))]
fn window_hwnd(_window: &tauri::WebviewWindow) -> Result<isize, String> {
    Ok(0)
}

/// Remove an enrolled unlock method ("password" | "pin" | "hello").
#[tauri::command]
pub fn remove_unlock_method(kind: String) -> Result<(), String> {
    let key = get_key()?;
    store::remove_method(&kind, &key).map_err(|e| e.to_string())?;
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "unlock_method_removed".to_string(),
            message: format!("Unlock method removed: {}", kind),
            timestamp: now_ts(),
            severity: "warning".to_string(),
        });
        Ok(())
    })
}

/// Set biometric settings.
#[tauri::command]
pub fn set_biometric_settings(enabled: bool) -> Result<(), String> {
    with_vault(|vault| {
        vault.settings.biometric = enabled;
        Ok(())
    })?;
    Ok(())
}

// ===== Session Management =====

#[tauri::command]
pub fn get_session_history() -> Result<Vec<crate::models::Session>, String> {
    let sessions = with_vault(|vault| Ok(vault.sessions.clone()))?;
    Ok(sessions)
}

#[tauri::command]
pub fn revoke_session(session_id: String) -> Result<bool, String> {
    let revoked = with_vault(|vault| {
        if let Some(session) = vault.sessions.iter_mut().find(|s| s.id == session_id) {
            session.is_active = false;
            Ok(true)
        } else {
            Ok(false)
        }
    })?;
    Ok(revoked)
}

#[tauri::command]
pub fn revoke_all_sessions() -> Result<usize, String> {
    let revoked_count = with_vault(|vault| {
        let count = vault.sessions.iter().filter(|s| s.is_active).count();
        for session in &mut vault.sessions {
            session.is_active = false;
        }
        Ok(count)
    })?;
    Ok(revoked_count)
}

// ===== Stealth Mode =====

#[tauri::command]
pub fn set_stealth_mode(enabled: bool) -> Result<(), String> {
    with_vault(|vault| {
        vault.settings.stealth_mode = enabled;
        Ok(())
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_stealth_mode() -> Result<bool, String> {
    let enabled = with_vault(|vault| Ok(vault.settings.stealth_mode))?;
    Ok(enabled)
}

// ===== Theme Selection =====

#[tauri::command]
pub fn set_theme(theme: String) -> Result<(), String> {
    with_vault(|vault| {
        vault.settings.theme = theme;
        Ok(())
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_theme() -> Result<String, String> {
    let theme = with_vault(|vault| Ok(vault.settings.theme.clone()))?;
    Ok(theme)
}

// ===== Templates =====

#[tauri::command]
pub fn get_templates() -> Result<Vec<crate::models::EntryTemplate>, String> {
    Ok(crate::templates::builtin_templates())
}

#[tauri::command]
pub fn create_entry_from_template(
    template_id: String,
    secret: Option<String>,
) -> Result<VaultEntryPublic, String> {
    let templates = get_templates()?;
    let template = templates
        .iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| "Template not found".to_string())?;

    let secret = match secret {
        Some(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => crate::totp_gen::generate_secret(),
    };

    crate::totp_gen::generate_code(
        &secret,
        template.digits,
        template.period,
        None,
        None,
        false,
        None,
        &crate::totp_gen::OtpContext::default(),
    )?;

    let entry = crate::models::VaultEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: template.name.clone(),
        issuer: template.issuer.clone(),
        secret,
        category: template.category.clone(),
        icon: template.icon.clone(),
        color: template.color.clone(),
        digits: template.digits,
        period: template.period,
        created_at: now_ts(),
        last_used: now_ts(),
        tags: template.tags.clone(),
        favorite: false,
        notes: String::new(),
        custom_period: Some(template.period),
        custom_digits: Some(template.digits),
        hotp_counter: None,
        is_hotp: false,
        attachments: Vec::new(),
    };

    let public = entry_public(&entry);
    with_vault(|vault| {
        vault.vault_entries.push(entry);
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "vault_entry_added".to_string(),
            message: format!("Added vault entry from template: {}", public.name),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });
        Ok(())
    })?;
    super::log_entry_history(
        &public.id,
        &public.name,
        "created",
        Some("template"),
        None,
        Some(&template_id),
    );

    Ok(public)
}

// ===== Command Palette =====

#[tauri::command]
pub fn get_command_palette_items() -> Result<Vec<crate::models::CommandPaletteItem>, String> {
    let items = vec![
        crate::models::CommandPaletteItem {
            id: "add_entry".to_string(),
            name: "Add New Entry".to_string(),
            description: "Create a new TOTP entry".to_string(),
            category: "Vault".to_string(),
            shortcut: Some("Ctrl+N".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "search".to_string(),
            name: "Search Entries".to_string(),
            description: "Search through your vault entries".to_string(),
            category: "Vault".to_string(),
            shortcut: Some("Ctrl+F".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "import".to_string(),
            name: "Import Entries".to_string(),
            description: "Import from other authenticator apps".to_string(),
            category: "Import/Export".to_string(),
            shortcut: Some("Ctrl+I".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "export".to_string(),
            name: "Export Vault".to_string(),
            description: "Export your vault to file".to_string(),
            category: "Import/Export".to_string(),
            shortcut: Some("Ctrl+E".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "settings".to_string(),
            name: "Open Settings".to_string(),
            description: "Configure application settings".to_string(),
            category: "Settings".to_string(),
            shortcut: Some("Ctrl+,".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "security_audit".to_string(),
            name: "Run Security Audit".to_string(),
            description: "Check for security issues".to_string(),
            category: "Security".to_string(),
            shortcut: None,
        },
        crate::models::CommandPaletteItem {
            id: "emergency_codes".to_string(),
            name: "Emergency Codes".to_string(),
            description: "View your emergency recovery codes".to_string(),
            category: "Security".to_string(),
            shortcut: None,
        },
        crate::models::CommandPaletteItem {
            id: "lock_vault".to_string(),
            name: "Lock Vault".to_string(),
            description: "Lock the vault immediately".to_string(),
            category: "Security".to_string(),
            shortcut: Some("Ctrl+L".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "templates".to_string(),
            name: "Use Template".to_string(),
            description: "Create entry from a template".to_string(),
            category: "Vault".to_string(),
            shortcut: Some("Ctrl+T".to_string()),
        },
        crate::models::CommandPaletteItem {
            id: "favorites".to_string(),
            name: "Show Favorites".to_string(),
            description: "View your favorite entries".to_string(),
            category: "Vault".to_string(),
            shortcut: Some("Ctrl+Shift+F".to_string()),
        },
    ];
    Ok(items)
}

// ===== Password Health Dashboard =====

#[tauri::command]
pub fn get_password_health() -> Result<crate::models::PasswordHealth, String> {
    let health = with_vault(|vault| {
        let total_entries = vault.vault_entries.len();
        let weak_passwords = vault
            .vault_entries
            .iter()
            .filter(|e| e.secret.len() < 32)
            .count();
        let strong_passwords = total_entries - weak_passwords;

        // Count reused secrets
        let mut secret_counts = std::collections::HashMap::new();
        for entry in &vault.vault_entries {
            *secret_counts.entry(&entry.secret).or_insert(0) += 1;
        }
        let reused_secrets = secret_counts.values().filter(|&&count| count > 1).count();

        // Count old entries (not used in 90 days)
        let ninety_days_ago = chrono::Utc::now().timestamp() - (90 * 24 * 60 * 60);
        let old_entries = vault
            .vault_entries
            .iter()
            .filter(|e| e.last_used < ninety_days_ago)
            .count();

        let favorite_entries = vault.vault_entries.iter().filter(|e| e.favorite).count();

        let categories_count = vault
            .vault_entries
            .iter()
            .map(|e| e.category.clone())
            .collect::<std::collections::HashSet<_>>()
            .len();

        // Calculate overall score (0-100)
        let mut score = 100u8;
        if total_entries == 0 {
            score = 100;
        } else {
            score -= (weak_passwords as u8 * 10).min(30);
            score -= (reused_secrets as u8 * 15).min(30);
            score -= (old_entries as u8 * 5).min(20);
        }

        Ok(crate::models::PasswordHealth {
            total_entries,
            strong_passwords,
            weak_passwords,
            reused_secrets,
            old_entries,
            favorite_entries,
            categories_count,
            overall_score: score,
        })
    })?;
    Ok(health)
}

// ===== Custom TOTP Parameters =====

#[tauri::command]
pub fn update_custom_totp_params(
    entry_id: String,
    custom_period: Option<u32>,
    custom_digits: Option<u32>,
) -> Result<(), String> {
    with_vault(|vault| {
        if let Some(entry) = vault.vault_entries.iter_mut().find(|e| e.id == entry_id) {
            entry.custom_period = custom_period;
            entry.custom_digits = custom_digits;
            Ok(())
        } else {
            Err("Entry not found".to_string())
        }
    })?;
    Ok(())
}

// ===== HOTP Support =====

#[tauri::command]
pub fn enable_hotp(entry_id: String, initial_counter: u64) -> Result<(), String> {
    with_vault(|vault| {
        if let Some(entry) = vault.vault_entries.iter_mut().find(|e| e.id == entry_id) {
            entry.is_hotp = true;
            entry.hotp_counter = Some(initial_counter);
            Ok(())
        } else {
            Err("Entry not found".to_string())
        }
    })?;
    Ok(())
}

#[tauri::command]
pub fn disable_hotp(entry_id: String) -> Result<(), String> {
    with_vault(|vault| {
        if let Some(entry) = vault.vault_entries.iter_mut().find(|e| e.id == entry_id) {
            entry.is_hotp = false;
            entry.hotp_counter = None;
            Ok(())
        } else {
            Err("Entry not found".to_string())
        }
    })?;
    Ok(())
}

#[tauri::command]
pub fn increment_hotp_counter(entry_id: String) -> Result<u64, String> {
    let new_counter = with_vault(|vault| {
        if let Some(entry) = vault.vault_entries.iter_mut().find(|e| e.id == entry_id) {
            if entry.is_hotp {
                if let Some(counter) = &mut entry.hotp_counter {
                    *counter += 1;
                    entry.last_used = now_ts();
                    Ok(*counter)
                } else {
                    Err("HOTP counter not initialized".to_string())
                }
            } else {
                Err("Entry is not configured as HOTP".to_string())
            }
        } else {
            Err("Entry not found".to_string())
        }
    })?;
    Ok(new_counter)
}

// ===== Timezone & Clock Sync =====

#[tauri::command]
pub fn set_timezone_offset(offset_seconds: i32) -> Result<(), String> {
    with_vault(|vault| {
        vault.settings.timezone_offset = offset_seconds;
        Ok(())
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_timezone_offset() -> Result<i32, String> {
    let offset = with_vault(|vault| Ok(vault.settings.timezone_offset))?;
    Ok(offset)
}

#[tauri::command]
pub fn set_clock_drift(drift_seconds: i32) -> Result<(), String> {
    with_vault(|vault| {
        vault.settings.clock_drift_seconds = drift_seconds;
        Ok(())
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_clock_drift() -> Result<i32, String> {
    let drift = with_vault(|vault| Ok(vault.settings.clock_drift_seconds))?;
    Ok(drift)
}

// ===== Device Registration =====

#[tauri::command]
pub fn register_device(
    name: String,
    device_type: String,
    os: String,
) -> Result<crate::models::DeviceEntry, String> {
    let device = with_vault(|vault| {
        let device = crate::models::DeviceEntry {
            id: Uuid::new_v4().to_string(),
            name,
            device_type,
            os,
            last_active: now_ts(),
            trust_level: 0.5,
            is_current: false,
            ip_address: "127.0.0.1".to_string(),
        };
        vault.devices.push(device.clone());
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "device_registered".to_string(),
            message: format!("New device registered: {}", device.name),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });
        Ok(device)
    })?;
    Ok(device)
}

#[tauri::command]
pub fn sync_device(device_id: String) -> Result<(), String> {
    with_vault(|vault| {
        if let Some(device) = vault.devices.iter_mut().find(|d| d.id == device_id) {
            device.last_active = now_ts();
            Ok(())
        } else {
            Err("Device not found".to_string())
        }
    })?;
    Ok(())
}

// ===== Statistics =====

#[tauri::command]
pub fn get_usage_statistics() -> Result<crate::models::UsageStatistics, String> {
    let stats = with_vault(|vault| {
        let total_logins = vault
            .security_events
            .iter()
            .filter(|e| e.event_type == "login" || e.event_type == "unlock")
            .count();

        // Count entry usage by last_used timestamp
        let mut entry_usage: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for entry in &vault.vault_entries {
            let usage_count = if entry.last_used > 0 {
                // Simple heuristic: more recent = more usage
                let days_since_use = (now_ts() - entry.last_used) / (24 * 60 * 60);
                if days_since_use < 1 {
                    10
                } else if days_since_use < 7 {
                    7
                } else if days_since_use < 30 {
                    4
                } else {
                    1
                }
            } else {
                0
            };
            entry_usage.insert(entry.name.clone(), usage_count);
        }

        let mut most_used_entries: Vec<(String, usize)> = entry_usage.into_iter().collect();
        most_used_entries.sort_by(|a, b| b.1.cmp(&a.1));
        most_used_entries.truncate(10);

        // Login frequency by day (last 7 days)
        let mut login_frequency: Vec<(String, usize)> = Vec::new();
        let seven_days_ago = now_ts() - (7 * 24 * 60 * 60);
        for i in 0..7 {
            let day_start = seven_days_ago + (i * 24 * 60 * 60);
            let day_end = day_start + (24 * 60 * 60);
            let count = vault
                .security_events
                .iter()
                .filter(|e| {
                    (e.event_type == "login" || e.event_type == "unlock")
                        && e.timestamp >= day_start
                        && e.timestamp < day_end
                })
                .count();
            let day_start_secs = day_start / 1000;
            let date = chrono::DateTime::from_timestamp(day_start_secs, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| "unknown".to_string());
            login_frequency.push((date, count));
        }

        let average_daily_usage = if login_frequency.is_empty() {
            0.0
        } else {
            let total: usize = login_frequency.iter().map(|(_, c)| c).sum();
            total as f64 / login_frequency.len() as f64
        };

        Ok(crate::models::UsageStatistics {
            total_logins,
            most_used_entries,
            login_frequency,
            average_daily_usage,
        })
    })?;
    Ok(stats)
}

// ===== Encrypted Backup / Restore =====

/// Produce an encrypted, portable backup of the vault protected by a passphrase.
#[tauri::command]
pub fn export_backup(passphrase: String) -> Result<String, String> {
    validate_master_password(&passphrase)?;
    let key = get_key()?;
    store::export_backup(&passphrase, &key).map_err(|e| e.to_string())
}

/// Restore a vault from an encrypted backup blob, re-encrypting it under the
/// current device's vault key. Requires an unlocked vault.
#[tauri::command]
pub fn restore_backup(passphrase: String, backup_json: String) -> Result<(), String> {
    let key = get_key()?;
    let restored = store::decode_backup(&passphrase, &backup_json).map_err(|e| e.to_string())?;
    store::save_vault_with_key(&restored, &key).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_out() -> Result<(), String> {
    let mut guard = session().lock();
    if let Some(ref mut key) = *guard {
        key.zeroize();
    }
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn complete_onboarding() -> Result<(), String> {
    with_vault(|vault| {
        if let Some(ref mut user) = vault.user {
            user.is_onboarded = true;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn update_user(display_name: Option<String>, username: Option<String>) -> Result<User, String> {
    with_vault(|vault| {
        let user = vault.user.as_mut().ok_or("No user logged in")?;
        if let Some(name) = display_name {
            user.display_name = name;
        }
        if let Some(un) = &username {
            user.username = un.clone();
        }
        Ok(user.clone())
    })?;

    if let Some(un) = username {
        store::update_username(&un).map_err(|e| e.to_string())?;
    }

    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    vault.user.ok_or_else(|| "User data missing".to_string())
}

#[tauri::command]
pub fn get_user() -> Result<Option<User>, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    Ok(vault.user)
}
