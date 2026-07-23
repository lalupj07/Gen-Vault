//! End-to-end smoke tests for vault storage, SQLite migration, and recovery codes.
//! Uses `GENVAULT_DATA_DIR` to isolate test data (no OS keyring required).

use std::sync::Mutex;

use genvault_lib::crypto;
use genvault_lib::models::{VaultData, VaultEntry};
use genvault_lib::recovery_codes;
use genvault_lib::store;
use genvault_lib::vault_db;

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
fn e2e_vault_save_load_and_sqlite_migration() {
    with_isolated_data_dir(|_| {
        let vmk = crypto::generate_key();
        let entry = sample_entry("SmokeTest");
        let entry_id = entry.id.clone();

        let mut vault = VaultData::default();
        vault.vault_entries.push(entry);

        store::save_vault_with_key(&vault, &vmk).expect("save vault");
        let loaded = store::load_vault_with_key(&vmk).expect("load vault");

        assert_eq!(loaded.vault_entries.len(), 1);
        assert_eq!(loaded.vault_entries[0].id, entry_id);
        assert!(vault_db::count_entries().expect("count") >= 1);

        let page = vault_db::list_entries(&vmk, 0, 10).expect("page");
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].name, "SmokeTest");
    });
}

#[test]
fn e2e_recovery_codes_enroll_verify_and_consume() {
    with_isolated_data_dir(|_| {
        let vmk = crypto::generate_key();
        let codes = recovery_codes::enroll_recovery_codes(&vmk, 8).expect("enroll codes");
        assert_eq!(codes.len(), 8);
        assert!(recovery_codes::has_recovery_codes());

        let first = &codes[0];
        assert!(recovery_codes::verify_recovery_code(first).expect("verify"));

        let recovered = recovery_codes::recover_vmk_with_code(first).expect("recover vmk");
        assert_eq!(recovered, vmk);

        assert!(!recovery_codes::verify_recovery_code(first).expect("used code invalid"));
        assert_eq!(recovery_codes::unused_recovery_count().expect("count"), 7);
    });
}

#[test]
fn e2e_vault_entry_crud_via_sqlite() {
    with_isolated_data_dir(|_| {
        let vmk = crypto::generate_key();
        let entry = sample_entry("CrudTest");
        let entry_id = entry.id.clone();

        vault_db::upsert_entry(&entry, &vmk).expect("upsert");
        assert_eq!(vault_db::count_entries().expect("count"), 1);

        let fetched = vault_db::get_entry(&entry_id, &vmk)
            .expect("get")
            .expect("exists");
        assert_eq!(fetched.name, "CrudTest");

        vault_db::delete_entry(&entry_id).expect("delete");
        assert_eq!(vault_db::count_entries().expect("count"), 0);
    });
}

#[test]
fn e2e_sign_up_command() {
    with_isolated_data_dir(|_| {
        let user = genvault_lib::commands::sign_up(genvault_lib::commands::SignUpRequest {
            username: "alice".to_string(),
            display_name: "Alice".to_string(),
            master_password: "SecurePass123!".to_string(),
        })
        .expect("sign_up command");
        assert_eq!(user.username, "alice");
        assert_eq!(user.display_name, "Alice");
        assert!(!store::is_incomplete_account().expect("check"));
    });
}

#[test]
fn e2e_signup_without_keyring() {
    with_isolated_data_dir(|_| {
        let vmk = store::create_account("testuser").expect("create account");
        store::enroll_secret("password", "TestPass123!@#", &vmk).expect("enroll");
        assert!(!store::is_incomplete_account().expect("check"));
        let meta = store::load_meta().expect("meta");
        assert_eq!(meta.methods.len(), 1);
        assert_eq!(meta.methods[0].kind, "password");
    });
}

#[test]
fn e2e_full_signup_flow() {
    with_isolated_data_dir(|_| {
        let password = "TestPass123!@#";
        let vmk = store::create_account("testuser").expect("create account");
        store::enroll_secret("password", password, &vmk).expect("enroll");

        let mut vault = store::load_vault_with_key(&vmk).expect("load");
        vault.user = Some(genvault_lib::models::User {
            id: uuid::Uuid::new_v4().to_string(),
            username: "testuser".to_string(),
            display_name: "Test User".to_string(),
            created_at: 1,
            last_login: 1,
            is_onboarded: false,
            mfa_enabled: true,
            biometric_enabled: false,
            security_tier: "Advanced".to_string(),
        });
        store::save_vault_with_key(&vault, &vmk).expect("save user");

        let loaded = store::load_vault_with_key(&vmk).expect("reload");
        assert!(loaded.user.is_some());
        assert!(!store::should_reset_for_signup(password).expect("reset check"));
    });
}

#[test]
fn e2e_signup_reset_incomplete_and_orphan() {
    with_isolated_data_dir(|_| {
        let password = "TestPass123!@#";
        store::create_account("orphan").expect("create");
        assert!(store::should_reset_for_signup(password).expect("incomplete reset"));

        store::delete_account().expect("cleanup");

        let vmk = store::create_account("orphan2").expect("create2");
        store::enroll_secret("password", password, &vmk).expect("enroll");
        assert!(store::should_reset_for_signup(password).expect("orphan reset"));
    });
}

#[test]
fn e2e_encrypted_backup_roundtrip() {
    with_isolated_data_dir(|_| {
        let vmk = crypto::generate_key();
        let mut vault = VaultData::default();
        vault.vault_entries.push(sample_entry("BackupTest"));

        store::save_vault_with_key(&vault, &vmk).expect("save");
        let backup_json = store::export_backup("TestPass123!@#", &vmk).expect("export");
        let restored = store::decode_backup("TestPass123!@#", &backup_json).expect("decode");

        assert_eq!(restored.vault_entries.len(), 1);
        assert_eq!(restored.vault_entries[0].name, "BackupTest");
    });
}
