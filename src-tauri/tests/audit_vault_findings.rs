//! Negative tests for the 2026-10-02 vault-files audit (VAULT-n findings).
//! Uses `GENVAULT_DATA_DIR` isolation (same pattern as soft_delete_test).

use std::sync::Mutex;

use genvault_lib::commands;
use genvault_lib::import_export;
use genvault_lib::models::{EntryAttachmentMeta, VaultEntry};
use genvault_lib::store;

static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());
const MASTER: &str = "SecurePass123!";

fn with_isolated_data_dir<F: FnOnce(&std::path::Path)>(f: F) {
    let _guard = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_var("GENVAULT_DATA_DIR", dir.path());
    let _ = commands::lock_vault();
    f(dir.path());
    let _ = commands::lock_vault();
    std::env::remove_var("GENVAULT_DATA_DIR");
}

fn unlock_fresh_vault() {
    commands::sign_up(commands::SignUpRequest {
        username: "audituser".to_string(),
        display_name: "Audit User".to_string(),
        master_password: MASTER.to_string(),
    })
    .expect("sign_up");
}

fn add_entry(name: &str) -> String {
    commands::add_vault_entry(
        name.to_string(),
        "Issuer".to_string(),
        None,
        "Test".to_string(),
        "x".to_string(),
        "#00e5ff".to_string(),
        Some(6),
        Some(30),
    )
    .expect("add entry")
    .id
}

fn set_travel_mode_on() {
    let key = store::unlock_with_secret("password", MASTER).expect("key");
    let mut vault = store::load_vault_with_key(&key).expect("load");
    vault.settings.travel_mode = true;
    store::save_vault_with_key(&vault, &key).expect("save");
}

fn sample_entry(id: &str) -> VaultEntry {
    VaultEntry {
        id: id.to_string(),
        name: "Shared".to_string(),
        issuer: "Evil".to_string(),
        secret: "JBSWY3DPEHPK3PXP".to_string(),
        category: "Test".to_string(),
        icon: String::new(),
        color: String::new(),
        digits: 6,
        period: 30,
        created_at: 1,
        last_used: 1,
        tags: Vec::new(),
        favorite: false,
        notes: String::new(),
        custom_period: None,
        custom_digits: None,
        hotp_counter: None,
        is_hotp: false,
        attachments: vec![EntryAttachmentMeta {
            id: "att".to_string(),
            filename: "x".to_string(),
            mime_type: "text/plain".to_string(),
            size: 1,
            created_at: 1,
        }],
        deleted_at: Some(1),
    }
}

// VAULT-1: transfer / share must honour travel mode.
#[test]
fn transfer_and_share_refused_in_travel_mode() {
    with_isolated_data_dir(|_| {
        unlock_fresh_vault();
        let id = add_entry("TravelShare");
        set_travel_mode_on();

        let t = commands::create_vault_transfer(MASTER.to_string()).unwrap_err();
        assert!(t.to_lowercase().contains("travel"), "transfer: {t}");
        let s = commands::create_vault_share(vec![id], MASTER.to_string(), Some(1)).unwrap_err();
        assert!(s.to_lowercase().contains("travel"), "share: {s}");
    });
}

// VAULT-2: update_settings must not be a password-free travel-mode off switch.
#[test]
fn update_settings_cannot_disable_travel_mode() {
    with_isolated_data_dir(|_| {
        unlock_fresh_vault();
        set_travel_mode_on();
        let mut settings = commands::get_settings().expect("settings");
        assert!(settings.travel_mode);
        settings.travel_mode = false;
        commands::update_settings(settings).expect("update_settings");
        assert!(commands::get_settings().expect("settings").travel_mode);
    });
}

// VAULT-3: `travel-hide` entries are hidden in Rust, not only in the UI.
#[test]
fn travel_hidden_entries_not_returned_by_backend() {
    with_isolated_data_dir(|_| {
        unlock_fresh_vault();
        let hidden = add_entry("HiddenBank");
        let shown = add_entry("ShownMail");
        commands::update_entry_tags(hidden.clone(), vec!["travel-hide".to_string()])
            .expect("tag");
        set_travel_mode_on();

        let ids: Vec<String> = commands::get_vault_entries()
            .expect("list")
            .into_iter()
            .map(|e| e.id)
            .collect();
        assert!(ids.contains(&shown) && !ids.contains(&hidden));
        assert_eq!(commands::get_vault_entry_count().expect("count"), 1);
        assert!(commands::search_vault_entries("HiddenBank".to_string())
            .expect("search")
            .is_empty());
        assert!(commands::generate_otp(hidden.clone()).is_err());
        assert!(commands::reveal_entry_secret(hidden, MASTER.to_string()).is_err());
    });
}

// VAULT-8: malformed otpauth URIs must error, never panic (release = abort).
#[test]
fn otpauth_uri_edge_cases_do_not_panic() {
    for uri in ["otpauth://", "otpauth://\u{e9}", "otpauth:/", ""] {
        assert!(import_export::parse_otpauth_uri(uri).is_err(), "{uri:?}");
    }
    let long = format!("otpauth://totp/a?secret={}", "A".repeat(10_000));
    assert!(import_export::parse_otpauth_uri(&long).is_err());
}

// VAULT-11: import size caps; Google import cannot smuggle a seed in as a password entry.
#[test]
fn import_limits_and_period_zero_rejected() {
    let huge = "x".repeat(import_export::MAX_IMPORT_BYTES + 1);
    assert!(import_export::import_google_authenticator(&huge, "c").is_err());
    assert!(import_export::import_authy_csv(&huge, "c").is_err());
    assert!(import_export::import_aegis_json(&huge, "c").is_err());

    let json = r#"{"accounts":[{"name":"a","secret":"JBSWY3DPEHPK3PXP","period":0}]}"#;
    assert!(import_export::import_google_authenticator(json, "c").is_err());
}

// VAULT-9: CSV export neutralizes spreadsheet formulas and quotes fields.
#[test]
fn csv_export_neutralizes_formulas() {
    with_isolated_data_dir(|_| {
        unlock_fresh_vault();
        add_entry("=HYPERLINK(\"http://x\",\"a,b\")");
        let csv = commands::export_vault_csv().expect("csv");
        assert!(csv.contains("\"'=HYPERLINK(\"\"http://x\"\",\"\"a,b\"\")\""), "{csv}");
        assert!(!csv.lines().any(|l| l.starts_with('=')));
    });
}

// VAULT-10: decrypted share payload fields are sanitized and size-capped.
#[test]
fn share_payload_entries_sanitized() {
    with_isolated_data_dir(|_| {
        unlock_fresh_vault();
        let pass = "Correct-Horse-Battery-9";
        let payload = import_export::create_share_payload(
            &[sample_entry("..\\..\\evil")],
            pass,
            "share-1",
            "attacker",
            Some(1),
        )
        .expect("payload");
        assert_eq!(commands::import_vault_share(pass.to_string(), payload).expect("import"), 1);
        let e = commands::get_vault_entries()
            .expect("list")
            .into_iter()
            .find(|e| e.name == "Shared")
            .expect("imported entry must be active (deleted_at cleared)");
        assert!(!e.id.contains(['.', '\\', '/']), "id not sanitized: {}", e.id);
        assert!(e.attachments.is_empty());

        let mut bad = sample_entry("ok-id");
        bad.secret = "!!!not-base32!!!".to_string();
        let payload = import_export::create_share_payload(&[bad], pass, "s2", "a", None).unwrap();
        assert!(commands::import_vault_share(pass.to_string(), payload).is_err());

        let oversized = format!("gvshare:v1:{}", "A".repeat(64 * 1024));
        let err = commands::import_vault_share(pass.to_string(), oversized).unwrap_err();
        assert!(err.contains("too large"), "{err}");
    });
}

#[cfg(windows)]
fn make_junction(link: &std::path::Path, target: &std::path::Path) {
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .expect("mklink");
    assert!(status.status.success(), "mklink /J failed");
}

// VAULT-4: staging wipe must delete links, never wipe their targets.
#[cfg(windows)]
#[test]
fn folder_relock_does_not_follow_junction_out_of_staging() {
    use genvault_lib::folder_lock::service::FolderLockService;
    let tmp = tempfile::tempdir().unwrap();
    let data = tmp.path().join("data");
    let src = tmp.path().join("locked");
    let victim = tmp.path().join("victim");
    std::fs::create_dir_all(&src).unwrap();
    std::fs::create_dir_all(&victim).unwrap();
    std::fs::write(src.join("a.txt"), b"alpha").unwrap();
    std::fs::write(victim.join("keep.txt"), b"must survive").unwrap();

    let svc = FolderLockService::new(data).unwrap();
    let key = genvault_lib::crypto::generate_key();
    let row = svc.lock_folder(&src, &key, true).unwrap();
    let staging = svc.unlock_to_staging(&row.id, &key).unwrap();
    make_junction(&staging.join("link"), &victim);

    svc.relock(&row.id).unwrap();
    assert!(!staging.exists());
    assert_eq!(std::fs::read(victim.join("keep.txt")).unwrap(), b"must survive");
}

#[cfg(windows)]
#[test]
fn media_relock_does_not_follow_junction_out_of_staging() {
    use genvault_lib::media_vault::service::MediaVaultService;
    let tmp = tempfile::tempdir().unwrap();
    let data = tmp.path().join("data");
    let src = tmp.path().join("doc.pdf");
    let victim = tmp.path().join("victim");
    std::fs::create_dir_all(&victim).unwrap();
    std::fs::write(&src, b"%PDF-1.4 test").unwrap();
    std::fs::write(victim.join("keep.txt"), b"must survive").unwrap();

    let svc = MediaVaultService::new(data).unwrap();
    let key = genvault_lib::crypto::generate_key();
    let item = svc.import(&src, &key, false, true).unwrap();
    let out = svc.view(&item.id, &key).unwrap();
    make_junction(&out.parent().unwrap().join("link"), &victim);

    svc.relock(&item.id).unwrap();
    assert_eq!(std::fs::read(victim.join("keep.txt")).unwrap(), b"must survive");
}

// VAULT-6: duress session must not list real lock-suite items.
#[cfg(windows)]
#[test]
fn duress_session_hides_lock_suite_metadata() {
    with_isolated_data_dir(|_| {
        unlock_fresh_vault();
        let outside = tempfile::tempdir().unwrap();
        let src = outside.path().join("secret.txt");
        std::fs::write(&src, b"real").unwrap();
        commands::file_lock_lock(src.to_string_lossy().into_owned(), true).expect("lock");
        assert_eq!(commands::file_lock_list().expect("list").len(), 1);

        commands::enroll_duress_password(MASTER.to_string(), "Decoy-Pass-456!".to_string())
            .expect("enroll duress");
        commands::lock_vault().unwrap();
        commands::unlock_with_password("Decoy-Pass-456!".to_string()).expect("duress unlock");

        assert!(commands::file_lock_list().expect("list").is_empty());
        assert!(commands::file_lock_search("secret".to_string()).expect("search").is_empty());
        assert!(commands::file_lock_activity(None).expect("activity").is_empty());
        assert!(commands::folder_lock_list().expect("list").is_empty());
        assert!(commands::media_vault_list().expect("list").is_empty());
    });
}

// VAULT-7: guest grant id is path-validated; VAULT-12: sidecar expiry is authenticated.
#[cfg(windows)]
#[test]
fn guest_grant_id_validated_and_expiry_tamper_rejected() {
    with_isolated_data_dir(|_| {
        assert!(commands::guest_unlock("..\\..\\x".to_string(), "whatever-pass".to_string())
            .is_err());

        unlock_fresh_vault();
        let outside = tempfile::tempdir().unwrap();
        let src = outside.path().join("g.txt");
        std::fs::write(&src, b"guest data").unwrap();
        let row = commands::file_lock_lock(src.to_string_lossy().into_owned(), true)
            .expect("lock");
        let pass = "long-passphrase-12";
        let grant = commands::guest_grant_create(
            "file".to_string(),
            row.id.clone(),
            "lbl".to_string(),
            pass.to_string(),
            5,
        )
        .expect("grant");
        commands::guest_unlock(grant.id.clone(), pass.to_string()).expect("valid unlock");

        let sidecar = store::data_dir_public()
            .unwrap()
            .join("guest-grants")
            .join(format!("{}.grant", grant.id));
        let raw = store::read_protected_file(&sidecar).expect("read sidecar");
        let mut v: serde_json::Value = serde_json::from_slice(&raw).unwrap();
        let exp = v["expires_at"].as_i64().unwrap();
        v["expires_at"] = serde_json::json!(exp + 86_400);
        store::write_protected_file(&sidecar, &serde_json::to_vec(&v).unwrap()).unwrap();

        assert!(
            commands::guest_unlock(grant.id, pass.to_string()).is_err(),
            "tampered expiry must not unwrap"
        );
    });
}
