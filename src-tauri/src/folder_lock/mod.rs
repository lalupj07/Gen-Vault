//! Folder Lock — Windows local NTFS folder encryption (no drivers).

pub mod crypto_files;
pub mod policy;

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
