//! AUTH-3: sign_up on an existing account tries the master password, so it must
//! share the unlock rate-limit budget instead of being an unlimited guessing oracle.
use genvault_lib::{commands, store};

#[test]
fn signup_password_probe_is_rate_limited() {
    let tmp = tempfile::tempdir().unwrap();
    std::env::set_var("GENVAULT_DATA_DIR", tmp.path());

    let key = store::create_account("tester").unwrap();
    store::enroll_secret("password", "MasterPass123!", &key).unwrap();

    let probe = |pw: &str| {
        commands::sign_up(commands::SignUpRequest {
            username: "tester".into(),
            display_name: "Tester".into(),
            master_password: pw.into(),
        })
        .unwrap_err()
    };

    for i in 0..5 {
        let err = probe(&format!("WrongGuess{i}!aA"));
        assert!(!err.contains("Too many"), "locked too early: {err}");
    }
    assert!(probe("MasterPass123!").contains("Too many"));
    assert!(commands::unlock_with_password("MasterPass123!".into())
        .unwrap_err()
        .contains("Too many"));

    std::env::remove_var("GENVAULT_DATA_DIR");
}
