//! Android Autofill IPC — metadata search + fill after unlock/travel gates.
//!
//! Username convention: prefer a `username:` line in `notes` (case-insensitive
//! prefix); otherwise use `name`. Password entries use `period == 0`; TOTP use
//! `period > 0`. Search candidates never include secrets (password / OTP seed).

use serde::{Deserialize, Serialize};

use crate::models::VaultEntry;
use crate::totp_gen;
use super::{get_key, load_active_vault, now_ts, save_active_vault};

/// Picker row — no password, OTP code, or TOTP seed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutofillCandidate {
    pub id: String,
    pub title: String,
    pub username_hint: String,
    pub has_otp: bool,
    pub has_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutofillFillPayload {
    pub username: Option<String>,
    pub password: Option<String>,
    pub otp: Option<String>,
}

fn is_active(e: &VaultEntry) -> bool {
    e.deleted_at.is_none()
}

/// Parse `username:` from notes (first matching line); else entry `name`.
pub(crate) fn username_for_entry(entry: &VaultEntry) -> String {
    for line in entry.notes.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed
            .strip_prefix("username:")
            .or_else(|| trimmed.strip_prefix("Username:"))
            .or_else(|| trimmed.strip_prefix("USERNAME:"))
        {
            let u = rest.trim();
            if !u.is_empty() {
                return u.to_string();
            }
        }
    }
    entry.name.clone()
}

fn entry_matches(entry: &VaultEntry, query: &str, package_name: Option<&str>) -> bool {
    let q = query.trim().to_lowercase();
    let pkg = package_name
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty());

    let hay = format!(
        "{} {} {} {}",
        entry.name, entry.issuer, entry.category, entry.tags.join(" ")
    )
    .to_lowercase();

    let query_ok = q.is_empty() || hay.contains(&q);
    let pkg_ok = match pkg.as_deref() {
        None => true,
        Some(p) => {
            hay.contains(p)
                || entry.issuer.to_lowercase().contains(p)
                || p.split('.').any(|seg| seg.len() > 2 && hay.contains(seg))
        }
    };
    query_ok && pkg_ok
}

pub(crate) fn candidate_from_entry(entry: &VaultEntry) -> AutofillCandidate {
    AutofillCandidate {
        id: entry.id.clone(),
        title: if entry.issuer.is_empty() {
            entry.name.clone()
        } else {
            format!("{} — {}", entry.issuer, entry.name)
        },
        username_hint: username_for_entry(entry),
        has_otp: entry.period > 0,
        has_password: entry.period == 0,
    }
}

/// Pure filter used by `autofill_search` and unit tests.
pub(crate) fn filter_autofill_candidates(
    entries: &[VaultEntry],
    query: &str,
    package_name: Option<&str>,
    travel_mode: bool,
    autofill_enabled: bool,
) -> Result<Vec<AutofillCandidate>, String> {
    if !autofill_enabled {
        return Ok(Vec::new());
    }
    if travel_mode {
        return Err("Autofill unavailable while travel mode is enabled".into());
    }
    let mut out: Vec<AutofillCandidate> = entries
        .iter()
        .filter(|e| is_active(e))
        .filter(|e| entry_matches(e, query, package_name))
        .map(candidate_from_entry)
        .collect();
    // Prefer favorites, then recent.
    out.sort_by(|a, b| {
        let ea = entries.iter().find(|e| e.id == a.id);
        let eb = entries.iter().find(|e| e.id == b.id);
        let fa = ea.map(|e| e.favorite).unwrap_or(false);
        let fb = eb.map(|e| e.favorite).unwrap_or(false);
        fb.cmp(&fa).then_with(|| {
            let la = ea.map(|e| e.last_used).unwrap_or(0);
            let lb = eb.map(|e| e.last_used).unwrap_or(0);
            lb.cmp(&la)
        })
    });
    Ok(out)
}

fn build_fill_payload(entry: &VaultEntry, otp: Option<String>) -> AutofillFillPayload {
    let username = Some(username_for_entry(entry));
    if entry.period == 0 {
        AutofillFillPayload {
            username,
            password: Some(entry.secret.clone()),
            otp: None,
        }
    } else {
        AutofillFillPayload {
            username,
            password: None,
            otp,
        }
    }
}

#[tauri::command]
pub fn autofill_search(
    query: String,
    package_name: Option<String>,
) -> Result<Vec<AutofillCandidate>, String> {
    let key = get_key()?;
    let vault = load_active_vault(&key)?;
    filter_autofill_candidates(
        &vault.vault_entries,
        &query,
        package_name.as_deref(),
        vault.settings.travel_mode,
        vault.settings.autofill_enabled,
    )
}

#[tauri::command]
pub fn autofill_fill(entry_id: String) -> Result<AutofillFillPayload, String> {
    let key = get_key()?;
    let mut vault = load_active_vault(&key)?;
    if !vault.settings.autofill_enabled {
        return Err("Autofill is disabled".into());
    }
    if vault.settings.travel_mode {
        return Err("Autofill unavailable while travel mode is enabled".into());
    }

    let idx = vault
        .vault_entries
        .iter()
        .position(|e| e.id == entry_id && is_active(e))
        .ok_or_else(|| "Entry not found".to_string())?;

    let entry = &vault.vault_entries[idx];
    let otp = if entry.period > 0 {
        let ctx = totp_gen::OtpContext {
            timezone_offset: vault.settings.timezone_offset,
            clock_drift: vault.settings.clock_drift_seconds,
        };
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
        Some(code.code)
    } else {
        None
    };

    let payload = build_fill_payload(entry, otp);
    vault.vault_entries[idx].last_used = now_ts();
    save_active_vault(&vault, &key)?;
    Ok(payload)
}

#[tauri::command]
pub fn get_autofill_enabled() -> Result<bool, String> {
    let key = get_key()?;
    let vault = load_active_vault(&key)?;
    Ok(vault.settings.autofill_enabled)
}

#[tauri::command]
pub fn set_autofill_enabled(enabled: bool) -> Result<(), String> {
    let key = get_key()?;
    let mut vault = load_active_vault(&key)?;
    vault.settings.autofill_enabled = enabled;
    save_active_vault(&vault, &key)?;
    // Best-effort sync to Android SharedPreferences for AutofillService.
    #[cfg(target_os = "android")]
    {
        let _ = crate::android_autofill::sync_enabled(enabled);
    }
    Ok(())
}

#[tauri::command]
pub fn open_autofill_settings() -> Result<(), String> {
    crate::android_autofill::open_system_settings()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry(id: &str, name: &str, issuer: &str, deleted: bool) -> VaultEntry {
        VaultEntry {
            id: id.to_string(),
            name: name.to_string(),
            issuer: issuer.to_string(),
            secret: "SECRET_MUST_NOT_LEAK".to_string(),
            category: "Login".to_string(),
            icon: String::new(),
            color: String::new(),
            digits: 6,
            period: 0,
            created_at: 1,
            last_used: 1,
            tags: vec!["banking".to_string()],
            favorite: false,
            notes: "username: alice@example.com\nother: x".to_string(),
            custom_period: None,
            custom_digits: None,
            hotp_counter: None,
            is_hotp: false,
            attachments: Vec::new(),
            deleted_at: if deleted { Some(99) } else { None },
        }
    }

    #[test]
    fn trashed_entry_not_returned() {
        let entries = vec![
            sample_entry("a", "Active Bank", "com.bank", false),
            sample_entry("b", "Trashed Bank", "com.bank", true),
        ];
        let got = filter_autofill_candidates(&entries, "bank", None, false, true).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "a");
        assert!(!format!("{got:?}").contains("SECRET_MUST_NOT_LEAK"));
    }

    #[test]
    fn travel_mode_refused() {
        let entries = vec![sample_entry("a", "Active", "x", false)];
        let err = filter_autofill_candidates(&entries, "", None, true, true).unwrap_err();
        assert!(err.to_lowercase().contains("travel"));
    }

    #[test]
    fn disabled_returns_empty() {
        let entries = vec![sample_entry("a", "Active", "x", false)];
        let got = filter_autofill_candidates(&entries, "", None, false, false).unwrap();
        assert!(got.is_empty());
    }

    #[test]
    fn username_from_notes_else_name() {
        let mut e = sample_entry("a", "Display Name", "Issuer", false);
        assert_eq!(username_for_entry(&e), "alice@example.com");
        e.notes = String::new();
        assert_eq!(username_for_entry(&e), "Display Name");
    }

    #[test]
    fn candidate_has_flags_no_secret() {
        let mut pw = sample_entry("p", "Site", "site.com", false);
        pw.period = 0;
        let mut otp = sample_entry("o", "App", "app.com", false);
        otp.period = 30;
        otp.notes.clear();
        let c_pw = candidate_from_entry(&pw);
        let c_otp = candidate_from_entry(&otp);
        assert!(c_pw.has_password && !c_pw.has_otp);
        assert!(c_otp.has_otp && !c_otp.has_password);
        assert!(!c_pw.username_hint.is_empty());
        assert!(!format!("{c_pw:?}").contains("SECRET"));
    }
}
