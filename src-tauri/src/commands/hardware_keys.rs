use base64::{engine::general_purpose::STANDARD as B64, Engine};
use uuid::Uuid;

use crate::models::{HardwareSecurityKey, HardwareSecurityKeyPublic};
use crate::rate_limit;
use crate::store;
use super::{ensure_not_duress, get_key, now_ts, set_duress_session};
use super::auth::finalize_unlock;

fn to_public(key: &HardwareSecurityKey, unlock_enrolled: bool) -> HardwareSecurityKeyPublic {
    HardwareSecurityKeyPublic {
        id: key.id.clone(),
        name: key.name.clone(),
        device_type: key.device_type.clone(),
        registered_at: key.registered_at,
        last_used: key.last_used,
        unlock_enrolled,
    }
}

#[tauri::command]
pub fn fido_available() -> bool {
    crate::fido::is_available()
}

#[tauri::command]
pub fn get_hardware_keys() -> Result<Vec<HardwareSecurityKeyPublic>, String> {
    let keys = store::list_security_keys().map_err(|e| e.to_string())?;
    let unlock_enrolled = store::has_security_key_unlock().unwrap_or(false);
    Ok(keys
        .iter()
        .map(|k| to_public(k, unlock_enrolled))
        .collect())
}

#[tauri::command]
pub fn register_hardware_key(name: String, pin: Option<String>) -> Result<HardwareSecurityKeyPublic, String> {
    if name.trim().is_empty() {
        return Err("Key name is required".to_string());
    }
    ensure_not_duress()?;
    if !crate::fido::is_available() {
        return Err("No FIDO2 security key detected. Insert a USB key and try again.".to_string());
    }

    let vmk = get_key()?;
    let reg = crate::fido::register_key(pin.as_deref())?;

    let record = HardwareSecurityKey {
        id: Uuid::new_v4().to_string(),
        name: name.trim().to_string(),
        credential_id: B64.encode(&reg.credential_id),
        public_key: B64.encode(&reg.public_key),
        device_type: "FIDO2/USB".to_string(),
        registered_at: now_ts(),
        last_used: now_ts(),
    };

    store::add_security_key_record(record.clone()).map_err(|e| e.to_string())?;

    if !store::has_security_key_unlock().unwrap_or(false) {
        store::enroll_security_key_unlock(&vmk).map_err(|e| e.to_string())?;
    }

    Ok(to_public(&record, true))
}

#[tauri::command]
pub fn test_hardware_key(key_id: String, pin: Option<String>) -> Result<(), String> {
    let keys = store::list_security_keys().map_err(|e| e.to_string())?;
    let key = keys
        .iter()
        .find(|k| k.id == key_id)
        .ok_or_else(|| "Security key not found".to_string())?;

    let credential_id = B64
        .decode(&key.credential_id)
        .map_err(|e| format!("Invalid credential data: {e}"))?;
    let public_key = B64
        .decode(&key.public_key)
        .map_err(|e| format!("Invalid public key data: {e}"))?;

    crate::fido::authenticate_key(&credential_id, &public_key, pin.as_deref())?;
    store::touch_security_key(&key_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_hardware_key(key_id: String) -> Result<(), String> {
    let _session = get_key()?;
    ensure_not_duress()?;
    store::remove_security_key_record(&key_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unlock_with_security_key(
    key_id: String,
    password: String,
    pin: Option<String>,
) -> Result<crate::models::User, String> {
    rate_limit::check_allowed("unlock")?;
    if password.is_empty() {
        return Err("Master password is required with security key unlock".to_string());
    }

    let keys = store::list_security_keys().map_err(|e| e.to_string())?;
    let key = keys
        .iter()
        .find(|k| k.id == key_id)
        .ok_or_else(|| "Security key not found".to_string())?;

    let credential_id = B64
        .decode(&key.credential_id)
        .map_err(|e| format!("Invalid credential data: {e}"))?;
    let public_key = B64
        .decode(&key.public_key)
        .map_err(|e| format!("Invalid public key data: {e}"))?;

    // FIDO assertion = presence; VMK from password wrap only (not DPAPI FPK).
    match crate::fido::authenticate_key(&credential_id, &public_key, pin.as_deref()) {
        Ok(()) => match store::unlock_with_secret("password", &password) {
            Ok(vmk) => {
                rate_limit::record_success("unlock").map_err(|e| e.to_string())?;
                store::touch_security_key(&key_id).map_err(|e| e.to_string())?;
                set_duress_session(false);
                finalize_unlock(vmk)
            }
            Err(e) => {
                let _ = rate_limit::record_failure("unlock");
                Err(e.to_string())
            }
        },
        Err(e) => {
            let _ = rate_limit::record_failure("unlock");
            Err(e)
        }
    }
}
