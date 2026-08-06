//! Per-file AES-GCM helpers and folder DEK wrap for Folder Lock.

use crate::crypto::{self, CryptoError};
use zeroize::Zeroize;

fn file_aad(folder_id: &str, rel_path: &str) -> Vec<u8> {
    format!("{folder_id}\0{rel_path}").into_bytes()
}

/// Encrypt file plaintext; AAD binds folder id + relative path.
pub fn encrypt_file_bytes(
    plain: &[u8],
    dek: &[u8; 32],
    folder_id: &str,
    rel_path: &str,
) -> Result<Vec<u8>, CryptoError> {
    let aad = file_aad(folder_id, rel_path);
    crypto::encrypt_with_aad(plain, dek, &aad)
}

/// Decrypt file blob; fails if AAD (path/id) does not match.
pub fn decrypt_file_bytes(
    blob: &[u8],
    dek: &[u8; 32],
    folder_id: &str,
    rel_path: &str,
) -> Result<Vec<u8>, CryptoError> {
    let aad = file_aad(folder_id, rel_path);
    crypto::decrypt_with_aad(blob, dek, &aad)
}

/// Wrap a folder DEK with the vault key (AES-GCM, empty AAD via standard encrypt).
pub fn wrap_dek(dek: &[u8; 32], vault_key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
    crypto::encrypt(dek, vault_key)
}

/// Unwrap folder DEK; zeroes temporary buffers after copy-out.
pub fn unwrap_dek(wrapped: &[u8], vault_key: &[u8; 32]) -> Result<[u8; 32], CryptoError> {
    let mut plain = crypto::decrypt(wrapped, vault_key)?;
    if plain.len() != 32 {
        plain.zeroize();
        return Err(CryptoError::InvalidFormat);
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&plain);
    plain.zeroize();
    Ok(dek)
}
