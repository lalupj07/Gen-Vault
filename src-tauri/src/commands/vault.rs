use uuid::Uuid;
use zeroize::Zeroize;

use crate::import_export;
use crate::models::*;
use crate::password_generator;
use crate::rate_limit;
use crate::recovery_codes;
use crate::store;
use crate::totp_gen;
use crate::vault_db;
use super::{
    entry_public, get_key, hash_emergency_code, now_ts, session, verify_emergency_code_hash,
    with_vault,
};
use crate::commands::privacy::ensure_export_allowed;
// ===== Vault Entry Commands =====

#[tauri::command]
pub fn add_vault_entry(
    name: String,
    issuer: String,
    secret: Option<String>,
    category: String,
    icon: String,
    color: String,
    digits: Option<u32>,
    period: Option<u32>,
) -> Result<VaultEntryPublic, String> {
    let digits = digits.unwrap_or(6);
    let period = period.unwrap_or(30);

    let secret = if period == 0 {
        let pw = secret.ok_or_else(|| "Password is required".to_string())?;
        if pw.len() < 1 {
            return Err("Password is required".into());
        }
        pw
    } else {
        secret.unwrap_or_else(|| totp_gen::generate_secret())
    };

    // Only validate OTP math for authenticator entries — password entries use period 0.
    if period > 0 {
        totp_gen::generate_code(
            &secret,
            digits,
            period,
            None,
            None,
            false,
            None,
            &totp_gen::OtpContext::default(),
        )?;
    }

    let entry = VaultEntry {
        id: Uuid::new_v4().to_string(),
        name,
        issuer,
        secret,
        category,
        icon,
        color,
        digits,
        period,
        created_at: now_ts(),
        last_used: now_ts(),
        tags: Vec::new(),
        favorite: false,
        notes: String::new(),
        custom_period: None,
        custom_digits: None,
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
            message: format!("Added vault entry: {}", public.name),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });
        Ok(())
    })?;
    super::log_entry_history(&public.id, &public.name, "created", None, None, None);
    Ok(public)
}

#[tauri::command]
pub fn remove_vault_entry(entry_id: String) -> Result<(), String> {
    let name = with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter()
            .find(|e| e.id == entry_id)
            .ok_or("Entry not found".to_string())?;
        let name = entry.name.clone();

        vault.vault_entries.retain(|e| e.id != entry_id);

        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "vault_entry_removed".to_string(),
            message: format!("Removed vault entry: {}", name),
            timestamp: now_ts(),
            severity: "warning".to_string(),
        });

        Ok(name)
    })?;
    vault_db::delete_entry(&entry_id).map_err(|e| e.to_string())?;
    super::log_entry_history(&entry_id, &name, "deleted", None, None, None);
    Ok(())
}

#[tauri::command]
pub fn update_vault_entry(
    entry_id: String,
    name: Option<String>,
    issuer: Option<String>,
    category: Option<String>,
    notes: Option<String>,
) -> Result<VaultEntryPublic, String> {
    let (public, changes) = with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter_mut()
            .find(|e| e.id == entry_id)
            .ok_or("Entry not found".to_string())?;

        let mut changes: Vec<(String, String, String)> = Vec::new();

        if let Some(n) = name {
            if n != entry.name {
                changes.push(("name".to_string(), entry.name.clone(), n.clone()));
                entry.name = n;
            }
        }
        if let Some(i) = issuer {
            if i != entry.issuer {
                changes.push(("issuer".to_string(), entry.issuer.clone(), i.clone()));
                entry.issuer = i;
            }
        }
        if let Some(c) = category {
            if c != entry.category {
                changes.push(("category".to_string(), entry.category.clone(), c.clone()));
                entry.category = c;
            }
        }
        if let Some(n) = notes {
            if n != entry.notes {
                // Never persist note contents in plaintext history.
                changes.push(("notes".to_string(), "[redacted]".to_string(), "[updated]".to_string()));
                entry.notes = n;
            }
        }

        Ok((entry_public(entry), changes))
    })?;

    for (field, old, new) in changes {
        super::log_entry_history(
            &entry_id,
            &public.name,
            "updated",
            Some(&field),
            Some(&old),
            Some(&new),
        );
    }

    Ok(public)
}

#[derive(serde::Serialize)]
pub struct VaultEntriesPage {
    pub entries: Vec<VaultEntryPublic>,
    pub total: u64,
    pub offset: u64,
    pub limit: u64,
}

#[tauri::command]
pub fn get_vault_entries_page(offset: u64, limit: u64) -> Result<VaultEntriesPage, String> {
    let key = get_key()?;
    let limit = limit.clamp(1, 500);
    let entries = vault_db::list_entries(&key, offset, limit).map_err(|e| e.to_string())?;
    let total = vault_db::count_entries().map_err(|e| e.to_string())?;
    Ok(VaultEntriesPage {
        entries: entries.iter().map(entry_public).collect(),
        total,
        offset,
        limit,
    })
}

#[tauri::command]
pub fn get_vault_entry_count() -> Result<u64, String> {
    let _key = get_key()?;
    vault_db::count_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_vault_entries() -> Result<Vec<VaultEntryPublic>, String> {
    let key = get_key()?;
    let entries = vault_db::list_all_entries(&key).map_err(|e| e.to_string())?;
    Ok(entries.iter().map(entry_public).collect())
}

/// Reveal entry secret once while vault is unlocked. Requires master password re-auth.
#[tauri::command]
pub fn reveal_entry_secret(entry_id: String, password: String) -> Result<String, String> {
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", &password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    let entry = vault
        .vault_entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Entry not found".to_string())?;
    Ok(entry.secret.clone())
}

/// Reveal entry notes. Requires master password re-auth (same sensitivity as secrets).
#[tauri::command]
pub fn reveal_entry_notes(entry_id: String, password: String) -> Result<String, String> {
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", &password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    let entry = vault
        .vault_entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Entry not found".to_string())?;
    Ok(entry.notes.clone())
}

// ===== TOTP Commands =====

#[tauri::command]
pub fn generate_otp(entry_id: String) -> Result<OtpCode, String> {
    let key = get_key()?;
    let mut vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    let ctx = totp_gen::OtpContext {
        timezone_offset: vault.settings.timezone_offset,
        clock_drift: vault.settings.clock_drift_seconds,
    };

    let idx = vault
        .vault_entries
        .iter()
        .position(|e| e.id == entry_id)
        .ok_or("Entry not found")?;

    let entry = &vault.vault_entries[idx];
    let code = totp_gen::generate_code(
        &entry.secret,
        entry.digits,
        entry.period,
        entry.custom_digits,
        entry.custom_period,
        entry.is_hotp,
        entry.hotp_counter,
        &ctx,
    )?;

    vault.vault_entries[idx].last_used = now_ts();
    store::save_vault_with_key(&vault, &key).map_err(|e| e.to_string())?;
    Ok(code)
}

// generate_otp_from_secret removed â€” secrets must not be processed from the frontend.

#[tauri::command]
pub fn verify_otp(entry_id: String, code: String) -> Result<bool, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    let ctx = totp_gen::OtpContext {
        timezone_offset: vault.settings.timezone_offset,
        clock_drift: vault.settings.clock_drift_seconds,
    };

    let entry = vault
        .vault_entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or("Entry not found")?;

    totp_gen::verify_code(
        &entry.secret,
        &code,
        entry.digits,
        entry.period,
        entry.custom_digits,
        entry.custom_period,
        entry.is_hotp,
        entry.hotp_counter,
        &ctx,
    )
}

#[tauri::command]
pub fn generate_totp_secret() -> String {
    totp_gen::generate_secret()
}

#[tauri::command]
pub fn get_provisioning_uri(entry_id: String, password: String) -> Result<String, String> {
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", &password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;

    let entry = vault
        .vault_entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or("Entry not found")?;

    totp_gen::get_provisioning_uri(
        &entry.secret,
        &entry.name,
        &entry.issuer,
        entry.digits,
        entry.period,
        entry.is_hotp,
    )
}

// ===== Device Commands =====

#[tauri::command]
pub fn get_devices() -> Result<Vec<DeviceEntry>, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    Ok(vault.devices)
}

#[tauri::command]
pub fn add_device(name: String, device_type: String, os: String) -> Result<DeviceEntry, String> {
    let device = DeviceEntry {
        id: Uuid::new_v4().to_string(),
        name,
        device_type,
        os,
        last_active: now_ts(),
        trust_level: 0.5,
        is_current: false,
        ip_address: "0.0.0.0".to_string(),
    };

    with_vault(|vault| {
        vault.devices.push(device.clone());
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "device_added".to_string(),
            message: format!("New device registered: {}", device.name),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });
        Ok(device.clone())
    })
}

#[tauri::command]
pub fn remove_device(device_id: String) -> Result<(), String> {
    with_vault(|vault| {
        vault.devices.retain(|d| d.id != device_id);
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "device_removed".to_string(),
            message: "Device removed".to_string(),
            timestamp: now_ts(),
            severity: "warning".to_string(),
        });
        Ok(())
    })
}

#[tauri::command]
pub fn update_device_trust(device_id: String, trust_level: f64) -> Result<(), String> {
    with_vault(|vault| {
        if let Some(dev) = vault.devices.iter_mut().find(|d| d.id == device_id) {
            dev.trust_level = trust_level;
        }
        Ok(())
    })
}

// ===== Session Commands =====

#[tauri::command]
pub fn get_sessions() -> Result<Vec<Session>, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    Ok(vault.sessions)
}

// ===== Security Events =====

#[tauri::command]
pub fn get_security_events() -> Result<Vec<SecurityEvent>, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    Ok(vault.security_events)
}

#[tauri::command]
pub fn add_security_event(event_type: String, message: String, severity: String) -> Result<(), String> {
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type,
            message,
            timestamp: now_ts(),
            severity,
        });
        Ok(())
    })
}

// ===== Settings Commands =====

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    Ok(vault.settings)
}

#[tauri::command]
pub fn update_settings(settings: AppSettings) -> Result<(), String> {
    let allowed_fonts = [
        "system", "sans", "rounded", "serif", "mono", "plex", "noto", "book", "display",
    ];
    if !allowed_fonts.contains(&settings.ui_font.as_str()) {
        return Err(format!("Unsupported ui_font: {}", settings.ui_font));
    }
    let allowed_langs = [
        "en", "es", "de", "fr", "hi", "ja", "zh", "pt", "ar", "ko", "it", "ru",
    ];
    if !allowed_langs.contains(&settings.language.as_str()) {
        return Err(format!("Unsupported language: {}", settings.language));
    }
    with_vault(|vault| {
        vault.settings = settings;
        Ok(())
    })
}

// ===== Utility Commands =====

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn rotate_vault_key(password: String, pin: Option<String>) -> Result<(), String> {
    let old_key = get_key()?;
    let new_key = store::rotate_vault_key(&old_key, &password, pin.as_deref())
        .map_err(|e| e.to_string())?;

    {
        let mut guard = session().lock();
        if let Some(ref mut key) = *guard {
            key.zeroize();
        }
        *guard = Some(new_key);
    }

    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "vault_key_rotated".to_string(),
            message: "Vault encryption key rotated (recovery codes invalidated)".to_string(),
            timestamp: now_ts(),
            severity: "critical".to_string(),
        });
        Ok(())
    })
}

#[tauri::command]
pub fn delete_account_cmd(password: String) -> Result<(), String> {
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", &password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    store::delete_account().map_err(|e| e.to_string())?;
    let _ = rate_limit::reset();
    let mut guard = session().lock();
    if let Some(ref mut key) = *guard {
        key.zeroize();
    }
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn get_security_score() -> Result<u32, String> {
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;

    let mut score: u32 = 40; // Base score

    if let Some(ref user) = vault.user {
        // TOTP is always enabled in offline mode
        score += 15;
        if user.biometric_enabled { score += 10; }
        if user.is_onboarded { score += 5; }
    }

    // More entries = more protected accounts
    let entry_bonus = (vault.vault_entries.len() as u32 * 3).min(15);
    score += entry_bonus;

    if vault.settings.auto_lock { score += 10; }
    if vault.settings.biometric { score += 5; }
    if recovery_codes::has_recovery_codes() { score += 15; }

    Ok(score.min(100))
}

#[tauri::command]
pub fn export_vault() -> Result<String, String> {
    ensure_export_allowed()?;
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;

    // Export entries (without secrets for security)
    let export: Vec<serde_json::Value> = vault
        .vault_entries
        .iter()
        .map(|e| {
            serde_json::json!({
                "name": e.name,
                "issuer": e.issuer,
                "category": e.category,
                "created_at": e.created_at,
            })
        })
        .collect();

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}
// ===== Password Generator =====

#[tauri::command]
pub fn generate_password(
    length: usize,
    uppercase: bool,
    lowercase: bool,
    numbers: bool,
    symbols: bool,
    exclude_ambiguous: bool,
) -> Result<String, String> {
    Ok(password_generator::generate_password(
        length,
        uppercase,
        lowercase,
        numbers,
        symbols,
        exclude_ambiguous,
    ))
}

#[tauri::command]
pub fn generate_passphrase(word_count: usize, separator: String, capitalize: bool) -> Result<String, String> {
    Ok(password_generator::generate_passphrase(word_count, &separator, capitalize))
}

#[tauri::command]
pub fn check_password_strength(password: String) -> Result<(u8, String), String> {
    Ok(password_generator::check_password_strength(&password))
}

// ===== Import/Export =====

#[tauri::command]
pub fn import_otpauth_uri(uri: String, category: String) -> Result<VaultEntryPublic, String> {
    let entry = import_export::uri_to_vault_entry(&uri, &category)?;
    let public = entry_public(&entry);
    with_vault(|vault| {
        vault.vault_entries.push(entry);
        Ok(())
    })?;
    Ok(public)
}

#[tauri::command]
pub fn import_google_authenticator(json: String, category: String) -> Result<Vec<VaultEntryPublic>, String> {
    let entries = import_export::import_google_authenticator(&json, &category)?;
    let public: Vec<VaultEntryPublic> = entries.iter().map(entry_public).collect();
    with_vault(|vault| {
        vault.vault_entries.extend(entries);
        Ok(())
    })?;
    Ok(public)
}

#[tauri::command]
pub fn import_authy_csv(csv: String, category: String) -> Result<Vec<VaultEntryPublic>, String> {
    let entries = import_export::import_authy_csv(&csv, &category)?;
    let public: Vec<VaultEntryPublic> = entries.iter().map(entry_public).collect();
    with_vault(|vault| {
        vault.vault_entries.extend(entries);
        Ok(())
    })?;
    Ok(public)
}

#[tauri::command]
pub fn import_manual_entry(
    name: String,
    issuer: String,
    secret: String,
    category: String,
    digits: Option<u32>,
    period: Option<u64>,
) -> Result<VaultEntryPublic, String> {
    let entry = import_export::import_manual_entry(name, issuer, secret, category, digits, period)?;
    let public = entry_public(&entry);
    with_vault(|vault| {
        vault.vault_entries.push(entry);
        Ok(())
    })?;
    Ok(public)
}

// ===== Search & Filters =====

#[tauri::command]
pub fn search_vault_entries(query: String) -> Result<Vec<VaultEntryPublic>, String> {
    with_vault(|vault| {
        let query_lower = query.to_lowercase();
        Ok(vault.vault_entries.iter()
            .filter(|entry| {
                entry.name.to_lowercase().contains(&query_lower) ||
                entry.issuer.to_lowercase().contains(&query_lower) ||
                entry.category.to_lowercase().contains(&query_lower) ||
                entry.tags.iter().any(|tag| tag.to_lowercase().contains(&query_lower))
            })
            .map(entry_public)
            .collect())
    })
}

#[tauri::command]
pub fn filter_vault_entries_by_category(category: String) -> Result<Vec<VaultEntryPublic>, String> {
    with_vault(|vault| {
        Ok(vault.vault_entries.iter()
            .filter(|entry| entry.category == category)
            .map(entry_public)
            .collect())
    })
}

#[tauri::command]
pub fn filter_vault_entries_by_tags(tags: Vec<String>) -> Result<Vec<VaultEntryPublic>, String> {
    with_vault(|vault| {
        Ok(vault.vault_entries.iter()
            .filter(|entry| tags.iter().all(|tag| entry.tags.contains(tag)))
            .map(entry_public)
            .collect())
    })
}

#[tauri::command]
pub fn get_favorite_entries() -> Result<Vec<VaultEntryPublic>, String> {
    with_vault(|vault| {
        Ok(vault.vault_entries.iter()
            .filter(|entry| entry.favorite)
            .map(entry_public)
            .collect())
    })
}

#[tauri::command]
pub fn toggle_entry_favorite(entry_id: String) -> Result<bool, String> {
    let (name, new_favorite, old_favorite) = with_vault(|vault| {
        if let Some(entry) = vault.vault_entries.iter_mut().find(|e| e.id == entry_id) {
            let old = entry.favorite;
            entry.favorite = !entry.favorite;
            Ok((entry.name.clone(), entry.favorite, old))
        } else {
            Err("Entry not found".to_string())
        }
    })?;
    super::log_entry_history(
        &entry_id,
        &name,
        "updated",
        Some("favorite"),
        Some(&old_favorite.to_string()),
        Some(&new_favorite.to_string()),
    );
    Ok(new_favorite)
}

#[tauri::command]
pub fn update_entry_tags(entry_id: String, tags: Vec<String>) -> Result<(), String> {
    let (name, old_tags) = with_vault(|vault| {
        if let Some(entry) = vault.vault_entries.iter_mut().find(|e| e.id == entry_id) {
            let old = entry.tags.join(",");
            entry.tags = tags.clone();
            Ok((entry.name.clone(), old))
        } else {
            Err("Entry not found".to_string())
        }
    })?;
    super::log_entry_history(
        &entry_id,
        &name,
        "updated",
        Some("tags"),
        Some(&old_tags),
        Some(&tags.join(",")),
    );
    Ok(())
}

// ===== Emergency Access Codes =====

#[tauri::command]
pub fn generate_emergency_codes(count: usize) -> Result<Vec<String>, String> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let codes: Vec<String> = (0..count)
        .map(|_| {
            (0..16)
                .map(|_| {
                    let chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                    chars.chars().nth(rng.gen_range(0..chars.len())).unwrap()
                })
                .collect::<String>()
                .chars()
                .collect::<Vec<char>>()
                .chunks(4)
                .map(|c| c.iter().collect::<String>())
                .collect::<Vec<String>>()
                .join("-")
        })
        .collect();

    let emergency_codes: Vec<crate::models::EmergencyCode> = codes
        .iter()
        .map(|code| crate::models::EmergencyCode {
            code_hash: hash_emergency_code(code),
            used: false,
            created_at: now_ts(),
        })
        .collect();

    with_vault(|vault| {
        vault.emergency_codes = emergency_codes;
        Ok(())
    })?;

    Ok(codes)
}

#[tauri::command]
pub fn get_emergency_codes() -> Result<Vec<(bool, i64)>, String> {
    let codes = with_vault(|vault| {
        Ok(vault
            .emergency_codes
            .iter()
            .map(|c| (c.used, c.created_at))
            .collect::<Vec<_>>())
    })?;
    Ok(codes)
}

#[tauri::command]
pub fn use_emergency_code(code: String) -> Result<bool, String> {
    let valid = with_vault(|vault| {
        if let Some(ec) = vault
            .emergency_codes
            .iter_mut()
            .find(|c| !c.used && verify_emergency_code_hash(&code, &c.code_hash))
        {
            ec.used = true;
            Ok(true)
        } else {
            Ok(false)
        }
    })?;
    Ok(valid)
}

#[tauri::command]
pub fn has_emergency_codes() -> Result<bool, String> {
    let has_codes = with_vault(|vault| {
        Ok(!vault.emergency_codes.is_empty())
    })?;
    Ok(has_codes)
}

// ===== Security Audit =====

fn sha1_hex(input: &str) -> String {
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    format!("{:X}", hasher.finalize())
}

#[tauri::command]
pub fn check_pwned_password(password: String) -> Result<u32, String> {
    let _key = get_key()?;
    if password.len() < 8 {
        return Err("Value must be at least 8 characters to check".to_string());
    }
    crate::hibp::pwned_count(&password)
}

#[tauri::command]
pub fn run_security_audit() -> Result<crate::models::SecurityAuditResult, String> {
    let (entries, hibp_enabled) = with_vault(|vault| {
        Ok((
            vault.vault_entries.clone(),
            vault.settings.hibp_audit_enabled,
        ))
    })?;

    let mut weak_passwords = Vec::new();
    let mut reused_secrets = Vec::new();
    let mut old_entries = Vec::new();
    let total_entries = entries.len();

    let now = chrono::Utc::now().timestamp();
    let old_threshold = now - (90 * 24 * 60 * 60);

    let mut secret_counts = std::collections::HashMap::new();
    for entry in &entries {
        *secret_counts.entry(&entry.secret).or_insert(0) += 1;
    }

    for entry in &entries {
        if entry.secret.len() < 16 {
            weak_passwords.push(entry.name.clone());
        }
        if secret_counts.get(&entry.secret).is_some_and(|&count| count > 1) {
            reused_secrets.push(entry.name.clone());
        }
        if entry.last_used < old_threshold {
            old_entries.push(entry.name.clone());
        }
    }

    weak_passwords.sort();
    weak_passwords.dedup();
    reused_secrets.sort();
    reused_secrets.dedup();
    old_entries.sort();
    old_entries.dedup();

    let mut compromised_credentials = Vec::new();
    let mut hibp_check_performed = false;
    let mut hibp_error = None;

    if hibp_enabled {
        hibp_check_performed = true;
        let mut seen = std::collections::HashSet::new();

        'hibp: for entry in &entries {
            // Never send TOTP/HOTP seeds or free-form notes to HIBP.
            // Only password-style entries (period == 0) may be checked.
            if entry.period != 0 || entry.is_hotp {
                continue;
            }
            let mut candidates: Vec<&str> = Vec::new();
            if entry.secret.len() >= 8 {
                candidates.push(entry.secret.as_str());
            }

            for text in candidates {
                let key = sha1_hex(text);
                if !seen.insert(key) {
                    continue;
                }
                match crate::hibp::pwned_count(text) {
                    Ok(count) if count > 0 => {
                        if !compromised_credentials.contains(&entry.name) {
                            compromised_credentials.push(entry.name.clone());
                        }
                    }
                    Ok(_) => {}
                    Err(e) => {
                        hibp_error = Some(e);
                        break 'hibp;
                    }
                }
            }
        }
    }

    compromised_credentials.sort();
    compromised_credentials.dedup();

    let mut score = 100u8;
    score = score.saturating_sub((weak_passwords.len() as u8) * 5);
    score = score.saturating_sub((reused_secrets.len() as u8) * 10);
    score = score.saturating_sub((old_entries.len() as u8) * 2);
    score = score.saturating_sub((compromised_credentials.len() as u8) * 15);

    Ok(crate::models::SecurityAuditResult {
        weak_passwords,
        reused_secrets,
        old_entries,
        compromised_credentials,
        hibp_check_performed,
        hibp_error,
        total_entries,
        security_score: score,
    })
}

// ===== Auto-Lock Timer =====

#[tauri::command]
pub fn set_auto_lock(enabled: bool, timeout_mins: u32) -> Result<(), String> {
    with_vault(|vault| {
        vault.settings.auto_lock = enabled;
        vault.settings.lock_timeout_mins = timeout_mins;
        Ok(())
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_auto_lock_settings() -> Result<(bool, u32), String> {
    let settings = with_vault(|vault| {
        Ok((vault.settings.auto_lock, vault.settings.lock_timeout_mins))
    })?;
    Ok(settings)
}

// ===== Export Formats =====

#[tauri::command]
pub fn export_vault_json() -> Result<String, String> {
    ensure_export_allowed()?;
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    let public: Vec<VaultEntryPublic> = vault.vault_entries.iter().map(entry_public).collect();
    serde_json::to_string_pretty(&public).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_vault_secrets_json(password: String) -> Result<String, String> {
    ensure_export_allowed()?;
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", &password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    Ok(import_export::to_google_auth_export(&vault.vault_entries))
}

#[tauri::command]
pub fn export_vault_csv() -> Result<String, String> {
    ensure_export_allowed()?;
    // Notes omitted — may contain secrets; use password-gated secret export for sensitive data.
    let csv = with_vault(|vault| {
        let mut csv = String::from(
            "Name,Issuer,Category,Icon,Color,Digits,Period,CreatedAt,LastUsed,Tags,Favorite\n",
        );
        for entry in &vault.vault_entries {
            let tags_str = entry.tags.join(";");
            csv.push_str(&format!(
                "{},{},{},{},{},{},{},{},{},{},{}\n",
                entry.name,
                entry.issuer,
                entry.category,
                entry.icon,
                entry.color,
                entry.digits,
                entry.period,
                entry.created_at,
                entry.last_used,
                tags_str,
                entry.favorite,
            ));
        }
        Ok(csv)
    })?;
    Ok(csv)
}

// ===== Bulk Operations =====

#[tauri::command]
pub fn bulk_delete_entries(entry_ids: Vec<String>) -> Result<usize, String> {
    let (deleted_count, removed_entries): (usize, Vec<(String, String)>) = with_vault(|vault| {
        let mut removed = Vec::new();
        for id in &entry_ids {
            if let Some(entry) = vault.vault_entries.iter().find(|e| e.id == *id) {
                removed.push((id.clone(), entry.name.clone()));
            }
        }
        let original_len = vault.vault_entries.len();
        vault.vault_entries.retain(|entry| !entry_ids.contains(&entry.id));
        let count = original_len - vault.vault_entries.len();
        if count != removed.len() {
            removed.retain(|(id, _)| !vault.vault_entries.iter().any(|e| e.id == *id));
        }
        Ok((count, removed))
    })?;
    for id in &entry_ids {
        let _ = vault_db::delete_entry(id);
    }
    for (id, name) in removed_entries {
        super::log_entry_history(&id, &name, "deleted", None, None, None);
    }
    Ok(deleted_count)
}

#[tauri::command]
pub fn bulk_update_category(entry_ids: Vec<String>, new_category: String) -> Result<usize, String> {
    let updated_count = with_vault(|vault| {
        let mut count = 0;
        for entry in &mut vault.vault_entries {
            if entry_ids.contains(&entry.id) {
                entry.category = new_category.clone();
                count += 1;
            }
        }
        Ok(count)
    })?;
    Ok(updated_count)
}

#[tauri::command]
pub fn bulk_add_tags(entry_ids: Vec<String>, tags: Vec<String>) -> Result<usize, String> {
    let updated_count = with_vault(|vault| {
        let mut count = 0;
        for entry in &mut vault.vault_entries {
            if entry_ids.contains(&entry.id) {
                for tag in &tags {
                    if !entry.tags.contains(tag) {
                        entry.tags.push(tag.clone());
                    }
                }
                count += 1;
            }
        }
        Ok(count)
    })?;
    Ok(updated_count)
}

#[tauri::command]
pub fn bulk_remove_tags(entry_ids: Vec<String>, tags: Vec<String>) -> Result<usize, String> {
    let updated_count = with_vault(|vault| {
        let mut count = 0;
        for entry in &mut vault.vault_entries {
            if entry_ids.contains(&entry.id) {
                entry.tags.retain(|t| !tags.contains(t));
                count += 1;
            }
        }
        Ok(count)
    })?;
    Ok(updated_count)
}

// ===== Vault QR Transfer =====

#[tauri::command]
pub fn create_vault_transfer(passphrase: String) -> Result<String, String> {
    super::validate_master_password(&passphrase)?;
    let key = get_key()?;
    let vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    import_export::create_transfer_payload(&vault.vault_entries, &passphrase)
}

#[tauri::command]
pub fn import_vault_transfer(passphrase: String, payload: String) -> Result<usize, String> {
    super::validate_master_password(&passphrase)?;
    let imported = import_export::import_transfer_payload(&payload, &passphrase)?;
    let count = imported.len();
    let key = get_key()?;
    let mut vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;
    for entry in imported {
        if !vault.vault_entries.iter().any(|e| e.id == entry.id) {
            vault.vault_entries.push(entry);
        }
    }
    store::save_vault_with_key(&vault, &key).map_err(|e| e.to_string())?;
    Ok(count)
}

// ===== Entry History =====

#[tauri::command]
pub fn get_entry_history(entry_id: Option<String>, limit: u32) -> Result<Vec<EntryHistoryRecord>, String> {
    let _key = get_key()?;
    let limit = limit.clamp(1, 500);
    if let Some(id) = entry_id {
        crate::entry_history::list_for_entry(&id, limit).map_err(|e| e.to_string())
    } else {
        crate::entry_history::list_all(limit).map_err(|e| e.to_string())
    }
}

// ===== Vault Sharing =====

#[tauri::command]
pub fn create_vault_share(
    entry_ids: Vec<String>,
    passphrase: String,
    expires_hours: Option<u32>,
) -> Result<VaultShareExport, String> {
    super::validate_master_password(&passphrase)?;
    if entry_ids.is_empty() {
        return Err("Select at least one entry to share".to_string());
    }

    let share_id = Uuid::new_v4().to_string();
    let (payload, entry_names, _shared_by, expires_at) = with_vault(|vault| {
        let username = vault
            .user
            .as_ref()
            .map(|u| u.username.clone())
            .unwrap_or_else(|| "unknown".to_string());

        let mut selected = Vec::new();
        let mut names = Vec::new();
        for id in &entry_ids {
            let entry = vault
                .vault_entries
                .iter()
                .find(|e| e.id == *id)
                .ok_or_else(|| format!("Entry not found: {}", id))?;
            names.push(entry.name.clone());
            selected.push(entry.clone());
        }

        let expires_at = expires_hours.map(|h| now_ts() + i64::from(h) * 3_600_000);
        let payload = import_export::create_share_payload(
            &selected,
            &passphrase,
            &share_id,
            &username,
            expires_hours,
        )?;

        vault.vault_shares.push(VaultShare {
            id: share_id.clone(),
            entry_ids: entry_ids.clone(),
            entry_names: names.clone(),
            created_at: now_ts(),
            expires_at,
            revoked: false,
        });

        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "vault_share_created".to_string(),
            message: format!("Shared {} entries", names.len()),
            timestamp: now_ts(),
            severity: "info".to_string(),
        });

        Ok((payload, names, username, expires_at))
    })?;

    Ok(VaultShareExport {
        share_id,
        payload,
        entry_count: entry_names.len(),
        expires_at,
    })
}

#[tauri::command]
pub fn import_vault_share(passphrase: String, payload: String) -> Result<usize, String> {
    super::validate_master_password(&passphrase)?;
    let package = import_export::import_share_payload(&payload, &passphrase)?;
    let count = package.entries.len();
    let key = get_key()?;
    let mut vault = store::load_vault_with_key(&key).map_err(|e| e.to_string())?;

    for entry in package.entries {
        if !vault.vault_entries.iter().any(|e| e.id == entry.id) {
            super::log_entry_history(&entry.id, &entry.name, "imported", Some("share"), None, Some(&package.share_id));
            vault.vault_entries.push(entry);
        }
    }

    vault.security_events.push(SecurityEvent {
        id: Uuid::new_v4().to_string(),
        event_type: "vault_share_imported".to_string(),
        message: format!("Imported {} shared entries from {}", count, package.shared_by),
        timestamp: now_ts(),
        severity: "info".to_string(),
    });

    store::save_vault_with_key(&vault, &key).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn get_vault_shares() -> Result<Vec<VaultSharePublic>, String> {
    let now = now_ts();
    let shares = with_vault(|vault| {
        Ok(vault
            .vault_shares
            .iter()
            .map(|s| VaultSharePublic {
                id: s.id.clone(),
                entry_names: s.entry_names.clone(),
                created_at: s.created_at,
                expires_at: s.expires_at,
                revoked: s.revoked,
                expired: s.expires_at.is_some_and(|exp| now > exp),
            })
            .collect::<Vec<_>>())
    })?;
    Ok(shares)
}

#[tauri::command]
pub fn revoke_vault_share(share_id: String) -> Result<(), String> {
    with_vault(|vault| {
        if let Some(share) = vault.vault_shares.iter_mut().find(|s| s.id == share_id) {
            share.revoked = true;
            Ok(())
        } else {
            Err("Share not found".to_string())
        }
    })?;
    Ok(())
}

// ===== Language / i18n =====

#[tauri::command]
pub fn set_language(language: String) -> Result<(), String> {
    let allowed = [
        "en", "es", "de", "fr", "hi", "ja", "zh", "pt", "ar", "ko", "it", "ru",
    ];
    if !allowed.contains(&language.as_str()) {
        return Err(format!("Unsupported language: {language}"));
    }
    with_vault(|vault| {
        vault.settings.language = language;
        Ok(())
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_language() -> Result<String, String> {
    with_vault(|vault| Ok(vault.settings.language.clone()))
}

// ===== Entry Attachments =====

#[tauri::command]
pub fn list_entry_attachments(entry_id: String) -> Result<Vec<EntryAttachmentMeta>, String> {
    with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter()
            .find(|e| e.id == entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        Ok(entry.attachments.clone())
    })
}

#[tauri::command]
pub fn add_entry_attachment(
    entry_id: String,
    filename: String,
    mime_type: String,
    data_base64: String,
) -> Result<EntryAttachmentMeta, String> {
    let data = crate::attachments::decode_upload(&data_base64)?;
    let key = get_key()?;
    let meta = crate::attachments::new_attachment_meta(&filename, &mime_type, data.len() as u64);

    with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter()
            .find(|e| e.id == entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        if entry.attachments.len() >= crate::attachments::max_per_entry() {
            return Err(format!(
                "Maximum of {} attachments per entry",
                crate::attachments::max_per_entry()
            ));
        }
        Ok(())
    })?;

    crate::attachments::write_attachment(&entry_id, &meta.id, &data, &key)
        .map_err(|e| e.to_string())?;

    with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter_mut()
            .find(|e| e.id == entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        entry.attachments.push(meta.clone());
        Ok(())
    })?;

    super::log_entry_history(
        &entry_id,
        &meta.filename,
        "attachment_added",
        None,
        None,
        None,
    );
    Ok(meta)
}

#[tauri::command]
pub fn remove_entry_attachment(entry_id: String, attachment_id: String) -> Result<(), String> {
    let filename = with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter_mut()
            .find(|e| e.id == entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        let idx = entry
            .attachments
            .iter()
            .position(|a| a.id == attachment_id)
            .ok_or_else(|| "Attachment not found".to_string())?;
        let name = entry.attachments[idx].filename.clone();
        entry.attachments.remove(idx);
        Ok(name)
    })?;

    crate::attachments::delete_attachment_file(&entry_id, &attachment_id)
        .map_err(|e| e.to_string())?;
    super::log_entry_history(&entry_id, &filename, "attachment_removed", None, None, None);
    Ok(())
}

#[tauri::command]
pub fn export_entry_attachment(
    entry_id: String,
    attachment_id: String,
    password: String,
) -> Result<String, String> {
    let key = get_key()?;
    let mut unlocked = store::unlock_with_secret("password", &password).map_err(|e| e.to_string())?;
    let ok = unlocked == key;
    unlocked.zeroize();
    if !ok {
        return Err("Incorrect master password".to_string());
    }
    let (filename, data) = with_vault(|vault| {
        let entry = vault
            .vault_entries
            .iter()
            .find(|e| e.id == entry_id)
            .ok_or_else(|| "Entry not found".to_string())?;
        let attachment = entry
            .attachments
            .iter()
            .find(|a| a.id == attachment_id)
            .ok_or_else(|| "Attachment not found".to_string())?;
        Ok((attachment.filename.clone(), attachment.id.clone()))
    })?;

    let bytes = crate::attachments::read_attachment(&entry_id, &data, &key)
        .map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    super::log_entry_history(&entry_id, &filename, "attachment_exported", None, None, None);
    Ok(B64.encode(bytes))
}

// ===== USB Backup =====

#[tauri::command]
pub fn list_removable_drives() -> Vec<crate::usb_drives::RemovableDrive> {
    crate::usb_drives::list_removable_drives()
}

#[tauri::command]
pub fn export_backup_to_usb(passphrase: String, drive_letter: String) -> Result<String, String> {
    ensure_export_allowed()?;
    super::validate_master_password(&passphrase)?;
    let key = get_key()?;
    crate::usb_drives::export_backup_to_drive(&passphrase, &drive_letter, &key)
        .map_err(|_| "USB export failed — check drive letter, free space, and removable media".to_string())
}
