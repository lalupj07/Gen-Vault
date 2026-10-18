//! AUTH-1/AUTH-2: a duress (decoy) session must not overwrite real-vault credentials or data.
use genvault_lib::{commands, recovery_codes, store};

#[test]
fn duress_session_cannot_touch_real_credentials() {
    let tmp = tempfile::tempdir().unwrap();
    std::env::set_var("GENVAULT_DATA_DIR", tmp.path());

    let master = "MasterPass123!";
    let duress = "DuressPass456!";
    let real_key = store::create_account("tester").unwrap();
    store::enroll_secret("password", master, &real_key).unwrap();
    store::enroll_duress(master, duress).unwrap();
    let backup = store::export_backup("BackupPass123!", &real_key, false).unwrap();

    commands::unlock_with_password(duress.into()).expect("duress unlock");
    assert!(commands::is_duress_session());

    assert!(commands::set_master_password("NewMasterPass789!".into()).is_err());
    assert!(commands::generate_account_recovery_codes().is_err());
    assert!(commands::regenerate_account_recovery_codes().is_err());
    assert!(commands::remove_unlock_method("hello".into()).is_err());
    assert!(commands::remove_pin().is_err());
    assert!(commands::remove_hardware_key("any".into()).is_err());

    // Restore during duress lands in the decoy, never re-keys the real vault files.
    commands::restore_backup("BackupPass123!".into(), backup).expect("restore into decoy");

    commands::lock_vault().unwrap();

    let unlocked = store::unlock_with_secret("password", master).expect("real password intact");
    assert_eq!(unlocked, real_key);
    store::load_vault_with_key(&real_key).expect("real vault still decrypts with real key");
    assert!(!recovery_codes::has_recovery_codes());

    std::env::remove_var("GENVAULT_DATA_DIR");
}
