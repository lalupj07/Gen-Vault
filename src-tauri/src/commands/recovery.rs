use uuid::Uuid;

use crate::models::{SecurityEvent, SecurityQuestion};
use crate::rate_limit;
use crate::recovery_codes;
use crate::security_questions;
use crate::store;
use super::{get_key, load_active_vault, now_ts, session, validate_master_password, with_vault};
// ===== Security Questions =====

#[tauri::command]
pub fn get_security_questions() -> Result<Vec<SecurityQuestion>, String> {
    Ok(security_questions::get_all_questions())
}

#[tauri::command]
pub fn get_random_security_questions(count: usize) -> Result<Vec<SecurityQuestion>, String> {
    Ok(security_questions::get_random_questions(count))
}

#[tauri::command]
pub fn get_enrolled_security_questions() -> Result<Vec<SecurityQuestion>, String> {
    let ids = store::get_enrolled_question_ids().map_err(|e| e.to_string())?;
    Ok(security_questions::get_questions_by_ids(&ids))
}

#[tauri::command]
pub fn enroll_security_answers(_answers: Vec<(String, String)>) -> Result<(), String> {
    Err("Security question recovery is deprecated. Use account recovery codes instead.".to_string())
}

#[tauri::command]
pub fn verify_security_answers(answers: Vec<(String, String)>) -> Result<bool, String> {
    let key = get_key()?;
    let vault = load_active_vault(&key)?;

    if vault.security_answers.is_empty() {
        return Err("No security questions enrolled".to_string());
    }

    let required = vault.security_answers.len().min(3);
    let mut correct_count = 0;
    for (question_id, answer) in &answers {
        let normalized = store::normalize_answer(answer);
        if let Some(stored) = vault.security_answers.iter().find(|sa| sa.question_id == *question_id) {
            let answer_key = crate::crypto::derive_key(&normalized, &stored.salt).map_err(|e| format!("Crypto error: {:?}", e))?;
            if let Ok(decrypted) = crate::crypto::decrypt(&stored.encrypted_answer, &answer_key) {
                if decrypted == normalized.as_bytes() {
                    correct_count += 1;
                }
            }
        }
    }

    Ok(correct_count >= required)
}

#[tauri::command]
pub fn verify_security_answers_for_reset(_answers: Vec<(String, String)>) -> Result<bool, String> {
    // Purge legacy recovery_key.enc if present; Q&A reset is permanently disabled.
    let _ = store::delete_recovery_key();
    Err("Security question recovery is disabled. Use account recovery codes.".to_string())
}

#[tauri::command]
pub fn reset_password_with_security_answers(
    _username: String,
    _new_password: String,
    _answers: Vec<(String, String)>,
) -> Result<(), String> {
    let _ = store::delete_recovery_key();
    Err("Security question recovery is disabled. Use account recovery codes.".to_string())
}

#[tauri::command]
pub fn has_security_questions() -> Result<bool, String> {
    // Never advertise legacy Q&A; delete leftover recovery_key.enc.
    if store::has_recovery_key() {
        let _ = store::delete_recovery_key();
    }
    Ok(false)
}

// ===== Account Recovery Codes =====

#[tauri::command]
pub fn generate_account_recovery_codes() -> Result<Vec<String>, String> {
    if recovery_codes::has_recovery_codes() {
        return Err("Recovery codes already enrolled. Use regenerate to create new codes.".to_string());
    }
    let key = get_key()?;
    let codes = recovery_codes::enroll_recovery_codes(&key, 10).map_err(|e| e.to_string())?;
    let _ = store::delete_recovery_key();
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "recovery_codes_enrolled".to_string(),
            message: "Account recovery codes enrolled".to_string(),
            timestamp: now_ts(),
            severity: "critical".to_string(),
        });
        Ok(())
    })?;
    Ok(codes)
}

#[tauri::command]
pub fn regenerate_account_recovery_codes() -> Result<Vec<String>, String> {
    let key = get_key()?;
    recovery_codes::delete_all_recovery_codes().map_err(|e| e.to_string())?;
    let codes = recovery_codes::enroll_recovery_codes(&key, 10).map_err(|e| e.to_string())?;
    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "recovery_codes_regenerated".to_string(),
            message: "Account recovery codes regenerated".to_string(),
            timestamp: now_ts(),
            severity: "critical".to_string(),
        });
        Ok(())
    })?;
    Ok(codes)
}

#[tauri::command]
pub fn has_account_recovery_codes() -> Result<bool, String> {
    Ok(recovery_codes::has_recovery_codes())
}

#[tauri::command]
pub fn unused_account_recovery_codes_count() -> Result<usize, String> {
    recovery_codes::unused_recovery_count().map_err(|e| e.to_string())
}

/// Intentionally does not confirm validity (anti-oracle). Clients should go
/// straight to `reset_password_with_recovery_code`.
#[tauri::command]
pub fn verify_recovery_code_for_reset(_code: String) -> Result<bool, String> {
    rate_limit::check_allowed("password_reset")?;
    Err("Enter your recovery code and new password together to reset.".to_string())
}

#[tauri::command]
pub fn reset_password_with_recovery_code(
    username: String,
    recovery_code: String,
    new_password: String,
) -> Result<(), String> {
    rate_limit::check_allowed("password_reset")?;
    validate_master_password(&new_password)?;

    let meta = store::load_meta().map_err(|e| format!("Failed to load metadata: {}", e))?;
    let provided = username.trim();
    if provided.is_empty() {
        return Err("Enter the vault username to reset your password.".to_string());
    }
    if meta.username.trim().to_lowercase() != provided.to_lowercase() {
        return Err(
            "Username mismatch. Use the same username shown on the login screen for this vault."
                .to_string(),
        );
    }

    let vmk = match recovery_codes::recover_vmk_with_code(&recovery_code) {
        Ok(k) => k,
        Err(e) => {
            let _ = rate_limit::record_failure("password_reset");
            return Err(format!("Invalid recovery code: {}", e));
        }
    };

    rate_limit::record_success("password_reset").map_err(|e| e.to_string())?;
    *session().lock() = Some(vmk);
    store::enroll_secret("password", &new_password, &vmk)
        .map_err(|e| format!("Failed to set new password: {}", e))?;

    with_vault(|vault| {
        vault.security_events.push(SecurityEvent {
            id: Uuid::new_v4().to_string(),
            event_type: "password_reset".to_string(),
            message: "Password reset using account recovery code".to_string(),
            timestamp: now_ts(),
            severity: "critical".to_string(),
        });
        Ok(())
    })?;

    Ok(())
}
