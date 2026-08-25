//! Locks genvault-backup v1 format for Android/Windows interchange.
//! Host-only regression test; no Android build required.

use std::sync::Mutex;

use genvault_lib::crypto;
use genvault_lib::models::{VaultData, VaultEntry};
use genvault_lib::store;
use serde_json::Value;

static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

fn with_isolated_data_dir<F: FnOnce(&std::path::Path)>(f: F) {
    let _guard = TEST_ENV_LOCK.lock().expect("test lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_var("GENVAULT_DATA_DIR", dir.path());
    f(dir.path());
    std::env::remove_var("GENVAULT_DATA_DIR");
}

fn sample_entry(name: &str) -> VaultEntry {
    VaultEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        issuer: "GenVault Test".to_string(),
        secret: crypto::bytes_to_hex(&crypto::generate_key()),
        category: "Test".to_string(),
        icon: "🔐".to_string(),
        color: "#00e5ff".to_string(),
        digits: 6,
        period: 30,
        created_at: 1_700_000_000_000,
        last_used: 1_700_000_000_000,
        tags: vec!["smoke".to_string()],
        favorite: false,
        notes: String::new(),
        custom_period: None,
        custom_digits: None,
        hotp_counter: None,
        is_hotp: false,
        attachments: Vec::new(),
    }
}

#[test]
fn genvault_backup_v1_roundtrip_preserves_format() {
    with_isolated_data_dir(|_| {
        let vmk = crypto::generate_key();
        let mut vault = VaultData::default();
        vault.vault_entries.push(sample_entry("BackupTest"));
        store::save_vault_with_key(&vault, &vmk).expect("save");

        let json = store::export_backup("BackupPassphrase9!", &vmk, false).expect("export");
        let parsed: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["format"], "genvault-backup");
        assert_eq!(parsed["version"], 1);
        assert_eq!(parsed["kdf"], "argon2id");
        assert!(parsed["salt"].as_str().unwrap().len() > 0);
        assert!(parsed["data"].as_str().unwrap().len() > 0);

        let restored = store::decode_backup("BackupPassphrase9!", &json).expect("decode");
        assert_eq!(restored.vault_entries.len(), 1);
        assert_eq!(restored.vault_entries[0].name, "BackupTest");
    });
}
