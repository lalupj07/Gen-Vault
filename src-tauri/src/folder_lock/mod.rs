//! Folder Lock — Windows local NTFS folder encryption (no drivers).

pub mod crypto_files;
pub mod deep_link;
pub mod policy;
pub mod service;
pub mod store;

use std::path::Path;

/// If `path` is a symlink or junction, delete the link itself (never its target)
/// and return `true`. Staging wipes must call this before following any entry.
pub(crate) fn remove_if_link(path: &Path) -> std::io::Result<bool> {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e),
    };
    #[cfg(windows)]
    let reparse = {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    };
    #[cfg(not(windows))]
    let reparse = false;
    if !meta.file_type().is_symlink() && !reparse {
        return Ok(false);
    }
    if std::fs::remove_file(path).is_err() {
        std::fs::remove_dir(path)?;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;

    #[test]
    fn aad_round_trip_and_tamper() {
        let key = crypto::generate_key();
        let folder_id = "fld-test";
        let rel = "docs/a.txt";
        let plain = b"hello folder lock";
        let blob = crypto_files::encrypt_file_bytes(plain, &key, folder_id, rel).unwrap();
        let out = crypto_files::decrypt_file_bytes(&blob, &key, folder_id, rel).unwrap();
        assert_eq!(out, plain);
        assert!(crypto_files::decrypt_file_bytes(&blob, &key, folder_id, "other.txt").is_err());
    }

    #[test]
    fn dek_wrap_round_trip() {
        let vault = crypto::generate_key();
        let dek = crypto::generate_key();
        let wrapped = crypto_files::wrap_dek(&dek, &vault).unwrap();
        let unwrapped = crypto_files::unwrap_dek(&wrapped, &vault).unwrap();
        assert_eq!(unwrapped, dek);
        let wrong = crypto::generate_key();
        assert!(crypto_files::unwrap_dek(&wrapped, &wrong).is_err());
    }
}
