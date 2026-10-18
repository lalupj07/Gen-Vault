//! AUTH-4: attacker-controlled hex (backup salt/data) must error, never panic.
use genvault_lib::{crypto, store};

#[test]
fn hex_to_bytes_rejects_non_ascii_without_panic() {
    assert!(crypto::hex_to_bytes("é0").is_err());
    assert!(crypto::hex_to_bytes("+1").is_err());
    assert!(crypto::hex_to_bytes("abc").is_err());
    assert_eq!(crypto::hex_to_bytes("0aFF").unwrap(), vec![0x0a, 0xff]);
}

#[test]
fn decode_backup_with_malformed_hex_errors() {
    let bad = r#"{"format":"genvault-backup","salt":"ééé0","data":"00"}"#;
    assert!(store::decode_backup("BackupPass123!", bad).is_err());
}
