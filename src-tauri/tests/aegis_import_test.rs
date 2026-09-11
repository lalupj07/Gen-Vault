//! Aegis JSON TOTP importer — sanitized fixture only (RFC 6238 test secret).

use std::sync::Mutex;

use genvault_lib::commands;
use genvault_lib::import_export;

static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

/// Minimal plain-text Aegis vault shape (version 1 + unencrypted db), per
/// https://github.com/beemdevelopment/Aegis/blob/master/docs/vault.md
const AEGIS_PLAIN_FIXTURE: &str = r#"{
  "version": 1,
  "header": { "slots": null, "params": null },
  "db": {
    "version": 3,
    "entries": [
      {
        "type": "totp",
        "uuid": "01234567-89ab-cdef-0123-456789abcdef",
        "name": "user@ex.com",
        "issuer": "Example",
        "note": "",
        "favorite": false,
        "icon": null,
        "info": {
          "secret": "JBSWY3DPEHPK3PXP",
          "algo": "SHA1",
          "digits": 6,
          "period": 30
        },
        "groups": []
      }
    ],
    "groups": []
  }
}"#;

fn with_isolated_data_dir<F: FnOnce()>(f: F) {
    let _guard = TEST_ENV_LOCK.lock().expect("test lock");
    let dir = tempfile::tempdir().expect("tempdir");
    std::env::set_var("GENVAULT_DATA_DIR", dir.path());
    let _ = commands::lock_vault();
    f();
    let _ = commands::lock_vault();
    std::env::remove_var("GENVAULT_DATA_DIR");
}

fn unlock_fresh_vault() {
    commands::sign_up(commands::SignUpRequest {
        username: "aegisuser".to_string(),
        display_name: "Aegis User".to_string(),
        master_password: "SecurePass123!".to_string(),
    })
    .expect("sign_up");
}

#[test]
fn import_aegis_totp_entry() {
    let entries = import_export::import_aegis_json(AEGIS_PLAIN_FIXTURE, "Imported").unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].issuer, "Example");
    assert_eq!(entries[0].name, "user@ex.com");
    assert!(entries[0].deleted_at.is_none());
    assert!(!entries[0].secret.is_empty());
}

#[test]
fn import_aegis_rejects_encrypted_db() {
    let json = r#"{"version":1,"header":{"slots":[],"params":{"nonce":"00","tag":"00"}},"db":"Y2lwaGVydGV4dA=="}"#;
    let err = import_export::import_aegis_json(json, "Imported").unwrap_err();
    assert!(
        err.to_lowercase().contains("encrypted") || err.to_lowercase().contains("plain"),
        "expected clear encrypted/plain error, got: {err}"
    );
}

#[test]
fn import_aegis_rejects_unknown_version() {
    let json = r#"{"version":99,"header":{"slots":null,"params":null},"db":{"version":3,"entries":[]}}"#;
    let err = import_export::import_aegis_json(json, "Imported").unwrap_err();
    assert!(
        err.to_lowercase().contains("version"),
        "expected version error, got: {err}"
    );
}

#[test]
fn import_aegis_command_dedups_active_ignores_trash() {
    with_isolated_data_dir(|| {
        unlock_fresh_vault();

        let first = commands::import_aegis_json(AEGIS_PLAIN_FIXTURE.to_string(), "Imported".to_string())
            .expect("first import");
        assert_eq!(first.len(), 1);

        let second = commands::import_aegis_json(AEGIS_PLAIN_FIXTURE.to_string(), "Imported".to_string())
            .expect("duplicate import");
        assert!(
            second.is_empty(),
            "active duplicate must be skipped, got {}",
            second.len()
        );

        let id = first[0].id.clone();
        commands::soft_delete_vault_entry(id).expect("soft_delete");

        let third = commands::import_aegis_json(AEGIS_PLAIN_FIXTURE.to_string(), "Imported".to_string())
            .expect("reimport after trash");
        assert_eq!(
            third.len(),
            1,
            "trashed entry must not block re-import"
        );
        assert!(third[0].deleted_at.is_none());
    });
}
