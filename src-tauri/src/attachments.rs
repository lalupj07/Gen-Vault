use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use uuid::Uuid;

use crate::crypto;
use crate::models::EntryAttachmentMeta;
use crate::store::{self, StoreError};

const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ENTRY: usize = 10;

fn attachments_dir() -> Result<PathBuf, StoreError> {
    let dir = store::data_dir_public()?.join("attachments");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn attachment_path(entry_id: &str, attachment_id: &str) -> Result<PathBuf, StoreError> {
    if !is_safe_id(entry_id) || !is_safe_id(attachment_id) {
        return Err(StoreError::InvalidSecret);
    }
    Ok(attachments_dir()?.join(format!("{entry_id}_{attachment_id}.enc")))
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn sanitize_filename(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("attachment");
    let cleaned: String = base
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'))
        .take(128)
        .collect();
    if cleaned.is_empty() {
        "attachment".to_string()
    } else {
        cleaned
    }
}

pub fn write_attachment(
    entry_id: &str,
    attachment_id: &str,
    plaintext: &[u8],
    vmk: &[u8; 32],
) -> Result<(), StoreError> {
    if plaintext.len() > MAX_ATTACHMENT_BYTES {
        return Err(StoreError::InvalidSecret);
    }
    let encrypted = crypto::encrypt(plaintext, vmk)?;
    std::fs::write(attachment_path(entry_id, attachment_id)?, encrypted)?;
    Ok(())
}

pub fn read_attachment(
    entry_id: &str,
    attachment_id: &str,
    vmk: &[u8; 32],
) -> Result<Vec<u8>, StoreError> {
    let path = attachment_path(entry_id, attachment_id)?;
    if !path.exists() {
        return Err(StoreError::InvalidSecret);
    }
    let encrypted = std::fs::read(path)?;
    crypto::decrypt(&encrypted, vmk).map_err(|_| StoreError::InvalidSecret)
}

pub fn delete_attachment_file(entry_id: &str, attachment_id: &str) -> Result<(), StoreError> {
    let path = attachment_path(entry_id, attachment_id)?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Re-encrypt every attachment under a new vault master key.
pub fn reencrypt_all(
    entries: &[crate::models::VaultEntry],
    old_key: &[u8; 32],
    new_key: &[u8; 32],
) -> Result<(), StoreError> {
    for entry in entries {
        for att in &entry.attachments {
            let path = attachment_path(&entry.id, &att.id)?;
            if !path.exists() {
                continue;
            }
            let plain = read_attachment(&entry.id, &att.id, old_key)?;
            write_attachment(&entry.id, &att.id, &plain, new_key)?;
        }
    }
    Ok(())
}

pub fn decode_upload(data_base64: &str) -> Result<Vec<u8>, String> {
    let data = B64
        .decode(data_base64.trim())
        .map_err(|e| format!("Invalid attachment data: {e}"))?;
    if data.is_empty() {
        return Err("Attachment is empty".to_string());
    }
    if data.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "Attachment exceeds {} MB limit",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        ));
    }
    Ok(data)
}

pub fn new_attachment_meta(filename: &str, mime_type: &str, size: u64) -> EntryAttachmentMeta {
    EntryAttachmentMeta {
        id: Uuid::new_v4().to_string(),
        filename: sanitize_filename(filename),
        mime_type: if mime_type.is_empty() {
            "application/octet-stream".to_string()
        } else {
            mime_type.to_string()
        },
        size,
        created_at: chrono::Utc::now().timestamp(),
    }
}

pub fn max_per_entry() -> usize {
    MAX_ATTACHMENTS_PER_ENTRY
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path() {
        assert_eq!(sanitize_filename("..\\evil\\note.txt"), "note.txt");
    }
}
