//! Soft-delete / trash: hide from active lists, restore, travel blocks, 30-day purge.
//! Uses `GENVAULT_DATA_DIR` isolation (same pattern as e2e_smoke).

use std::sync::Mutex;

use genvault_lib::commands;
use genvault_lib::store;

static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

/// Matches `TRASH_RETENTION_MS` in vault commands (30 days in millis).
const TRASH_RETENTION_MS: i64 = 30 * 86_400 * 1_000;

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

fn add_sample_entry(name: &str) -> String {
    let entry = commands::add_vault_entry(
        name.to_string(),
        "Issuer".to_string(),
        None,
        "Test".to_string(),
        "🔐".to_string(),
        "#00e5ff".to_string(),
        Some(6),
        Some(30),
    )
    .expect("add entry");
    entry.id
}

#[test]
fn soft_delete_hides_then_restore() {
    with_isolated_data_dir(|| {
        unlock_fresh_vault();

        let entry_id = add_sample_entry("SoftDel");

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

#[test]
fn trash_restore_and_purge_refuse_in_travel_mode() {
    with_isolated_data_dir(|| {
        unlock_fresh_vault();
        let entry_id = add_sample_entry("TravelTrash");
        commands::soft_delete_vault_entry(entry_id.clone()).expect("soft_delete");

        let key = store::unlock_with_secret("password", "SecurePass123!").expect("unlock key");
        let mut vault = store::load_vault_with_key(&key).expect("load vault");
        vault.settings.travel_mode = true;
        store::save_vault_with_key(&vault, &key).expect("save travel on");

        let restore_err = commands::restore_vault_entry(entry_id.clone()).unwrap_err();
        assert!(
            restore_err.to_lowercase().contains("travel"),
            "restore must refuse in travel mode, got: {restore_err}"
        );

        let purge_err = commands::purge_vault_entry(entry_id.clone()).unwrap_err();
        assert!(
            purge_err.to_lowercase().contains("travel"),
            "purge must refuse in travel mode, got: {purge_err}"
        );

        let still = commands::list_trashed_entries().expect("trash still listed");
        assert!(
            still.iter().any(|e| e.id == entry_id),
            "entry must remain in trash after travel refusal"
        );
    });
}

#[test]
fn purge_expired_trash_removes_old_deleted_at() {
    with_isolated_data_dir(|| {
        unlock_fresh_vault();
        let entry_id = add_sample_entry("OldTrash");
        commands::soft_delete_vault_entry(entry_id.clone()).expect("soft_delete");

        let key = store::unlock_with_secret("password", "SecurePass123!").expect("unlock key");
        let mut vault = store::load_vault_with_key(&key).expect("load vault");
        let now = chrono::Utc::now().timestamp_millis();
        let entry = vault
            .vault_entries
            .iter_mut()
            .find(|e| e.id == entry_id)
            .expect("entry");
        entry.deleted_at = Some(now - TRASH_RETENTION_MS - 1);
        store::save_vault_with_key(&vault, &key).expect("backdate deleted_at");

        let purged = commands::purge_expired_trash().expect("purge_expired");
        assert!(purged >= 1, "expected at least one expired purge, got {purged}");

        let trash = commands::list_trashed_entries().expect("trash after purge");
        assert!(
            trash.iter().all(|e| e.id != entry_id),
            "expired trash entry must be gone"
        );
        let active = commands::get_vault_entries().expect("active after purge");
        assert!(
            active.iter().all(|e| e.id != entry_id),
            "purged entry must not reappear active"
        );
    });
}
