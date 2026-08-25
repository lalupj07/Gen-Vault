//! Privacy commands — panic lock and related (Phase 1).

use crate::commands::{
    file_lock::wipe_file_lock_orphans_on_startup,
    folder_lock::wipe_folder_lock_orphans_on_startup,
    lock_vault,
    media_vault::wipe_media_vault_orphans_on_startup,
};
use crate::media_vault::service::MediaVaultService;
use crate::store;

#[cfg(windows)]
fn wipe_all_staging_best_effort() {
    if let Ok(dir) = store::data_dir_public() {
        if let Ok(svc) = MediaVaultService::new(dir) {
            let _ = svc.relock_all_viewing();
        }
    }
    let _ = wipe_folder_lock_orphans_on_startup();
    let _ = wipe_file_lock_orphans_on_startup();
    let _ = wipe_media_vault_orphans_on_startup();
}

/// Lock session and best-effort wipe lock-suite staging. Idempotent when already locked.
pub(crate) fn execute_panic_lock() -> Result<(), String> {
    #[cfg(windows)]
    wipe_all_staging_best_effort();
    lock_vault()
}

#[tauri::command]
pub fn panic_lock() -> Result<(), String> {
    execute_panic_lock()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panic_lock_idempotent_when_locked() {
        let _ = lock_vault();
        assert!(execute_panic_lock().is_ok());
        assert!(execute_panic_lock().is_ok());
    }
}
