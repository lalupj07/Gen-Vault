//! Soft-delete / trash: hide from active lists, restore, travel blocks.
//! Uses `GENVAULT_DATA_DIR` isolation (same pattern as e2e_smoke).

use std::sync::Mutex;

use genvault_lib::commands;

static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

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
        username: "trashuser".to_string(),
        display_name: "Trash User".to_string(),
        master_password: "SecurePass123!".to_string(),
    })
    .expect("sign_up");
}

#[test]
fn soft_delete_hides_then_restore() {
    with_isolated_data_dir(|| {
        unlock_fresh_vault();

        let entry = commands::add_vault_entry(
            "SoftDel".to_string(),
            "Issuer".to_string(),
            None,
            "Test".to_string(),
            "🔐".to_string(),
            "#00e5ff".to_string(),
            Some(6),
            Some(30),
        )
        .expect("add entry");
        let entry_id = entry.id.clone();

        commands::soft_delete_vault_entry(entry_id.clone()).expect("soft_delete");

        let active = commands::get_vault_entries().expect("active list");
        assert!(
            active.iter().all(|e| e.id != entry_id),
            "soft-deleted entry must not appear in active list"
        );

        let trashed = commands::list_trashed_entries().expect("trash list");
        assert!(
            trashed.iter().any(|e| e.id == entry_id),
            "soft-deleted entry must appear in trash"
        );
        assert!(
            trashed
                .iter()
                .find(|e| e.id == entry_id)
                .and_then(|e| e.deleted_at)
                .is_some(),
            "trashed entry must expose deleted_at"
        );

        commands::restore_vault_entry(entry_id.clone()).expect("restore");

        let active_again = commands::get_vault_entries().expect("active after restore");
        assert!(
            active_again.iter().any(|e| e.id == entry_id),
            "restored entry must appear in active list"
        );
        let trash_after = commands::list_trashed_entries().expect("trash after restore");
        assert!(
            trash_after.iter().all(|e| e.id != entry_id),
            "restored entry must leave trash"
        );
    });
}
