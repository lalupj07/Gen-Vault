use rand::Rng;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::crypto;
use crate::store::{self, StoreError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryWrap {
    pub salt: Vec<u8>,
    pub wrapped_vmk: Vec<u8>,
    pub used: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RecoveryStore {
    wraps: Vec<RecoveryWrap>,
}

fn wraps_path() -> Result<std::path::PathBuf, StoreError> {
    Ok(store::data_dir_public()?.join("recovery_wraps.dat"))
}

pub fn normalize_code(code: &str) -> String {
    code.replace('-', "").replace(' ', "").to_uppercase()
}

fn generate_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let raw: String = (0..16)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect();
    format!(
        "{}-{}-{}-{}",
        &raw[0..4],
        &raw[4..8],
        &raw[8..12],
        &raw[12..16]
    )
}

fn load_store() -> Result<RecoveryStore, StoreError> {
    let path = wraps_path()?;
    if !path.exists() {
        return Ok(RecoveryStore::default());
    }
    let data = store::read_protected_file(&path)?;
    Ok(serde_json::from_slice(&data)?)
}

fn save_store(store_data: &RecoveryStore) -> Result<(), StoreError> {
    let json = serde_json::to_vec(store_data)?;
    store::write_protected_file(&wraps_path()?, &json)
}

/// Enroll `count` one-time recovery codes. Each wraps an independent copy of the VMK.
/// Returns plaintext codes exactly once — caller must display them to the user.
pub fn enroll_recovery_codes(vmk: &[u8; 32], count: usize) -> Result<Vec<String>, StoreError> {
    if count < 8 {
        return Err(StoreError::Keyring("At least 8 recovery codes required".to_string()));
    }

    let mut codes = Vec::with_capacity(count);
    let mut wraps = Vec::with_capacity(count);

    for _ in 0..count {
        let code = generate_code();
        let salt = crypto::generate_salt();
        let mut wrap_key = crypto::derive_key(&normalize_code(&code), &salt)?;
        let wrapped_vmk = crypto::encrypt(vmk, &wrap_key);
        wrap_key.zeroize();
        let wrapped_vmk = wrapped_vmk?;
        wraps.push(RecoveryWrap {
            salt,
            wrapped_vmk,
            used: false,
        });
        codes.push(code);
    }

    save_store(&RecoveryStore { wraps })?;
    Ok(codes)
}

pub fn has_recovery_codes() -> bool {
    load_store()
        .map(|s| !s.wraps.is_empty())
        .unwrap_or(false)
}

pub fn unused_recovery_count() -> Result<usize, StoreError> {
    let store_data = load_store()?;
    Ok(store_data.wraps.iter().filter(|w| !w.used).count())
}

/// Check whether a recovery code is valid without consuming it.
pub fn verify_recovery_code(code: &str) -> Result<bool, StoreError> {
    let normalized = normalize_code(code);
    if normalized.len() != 16 {
        return Ok(false);
    }
    let store_data = load_store()?;
    for wrap in &store_data.wraps {
        if wrap.used {
            continue;
        }
        let mut wrap_key = crypto::derive_key(&normalized, &wrap.salt)?;
        let decrypted = crypto::decrypt(&wrap.wrapped_vmk, &wrap_key);
        wrap_key.zeroize();
        if let Ok(mut vmk_bytes) = decrypted {
            let ok = vmk_bytes.len() == 32;
            vmk_bytes.zeroize();
            if ok {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Recover the VMK using a one-time recovery code. Marks the wrap as used.
pub fn recover_vmk_with_code(code: &str) -> Result<[u8; 32], StoreError> {
    let normalized = normalize_code(code);
    if normalized.len() != 16 {
        return Err(StoreError::InvalidSecret);
    }

    let mut store_data = load_store()?;
    for wrap in &mut store_data.wraps {
        if wrap.used {
            continue;
        }
        let mut wrap_key = crypto::derive_key(&normalized, &wrap.salt)?;
        let decrypted = crypto::decrypt(&wrap.wrapped_vmk, &wrap_key);
        wrap_key.zeroize();
        if let Ok(mut vmk_bytes) = decrypted {
            if vmk_bytes.len() == 32 {
                let mut vmk = [0u8; 32];
                vmk.copy_from_slice(&vmk_bytes);
                vmk_bytes.zeroize();
                wrap.used = true;
                if let Err(e) = save_store(&store_data) {
                    vmk.zeroize();
                    return Err(e);
                }
                return Ok(vmk);
            }
            vmk_bytes.zeroize();
        }
    }
    Err(StoreError::InvalidSecret)
}

pub fn delete_all_recovery_codes() -> Result<(), StoreError> {
    let path = wraps_path()?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}
