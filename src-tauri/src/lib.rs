mod app_paths;
#[cfg(target_os = "android")]
mod android_keystore;
mod attachments;
pub mod commands;
pub mod crypto;
mod entry_history;
mod fido;
mod guest;
pub mod folder_lock;
pub mod file_lock;
pub mod media_vault;
mod hello;
mod hibp;
mod import_export;
pub mod models;
mod password_generator;
mod rate_limit;
pub mod recovery_codes;
mod secure_file;
mod security_questions;
pub mod store;
mod templates;
mod totp_gen;
mod usb_drives;
pub mod vault_db;

use commands::*;
use tauri::Emitter;

#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_keystore::init());
    builder
        .setup(|app| {
            #[cfg(target_os = "android")]
            {
                let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                app_paths::init(dir);
            }
            #[cfg(windows)]
            {
                let _ = wipe_folder_lock_orphans_on_startup();
                let _ = wipe_file_lock_orphans_on_startup();
                let _ = wipe_media_vault_orphans_on_startup();
                let args: Vec<String> = std::env::args().collect();
                if let Some(link) = folder_lock::deep_link::find_in_args(&args) {
                    stash_deep_link(link.clone());
                    let _ = app.emit("folder-lock-deep-link", &link);
                }
                if let Some(link) = file_lock::deep_link::find_in_args(&args) {
                    stash_file_lock_deep_link(link.clone());
                    let _ = app.emit("file-lock-deep-link", &link);
                }

                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

                let panic_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if event.state() != ShortcutState::Pressed {
                                return;
                            }
                            if shortcut == &panic_shortcut {
                                let _ = execute_panic_lock();
                                let _ = app.emit("panic-locked", ());
                            }
                        })
                        .build(),
                )?;
                let _ = app.global_shortcut().register(panic_shortcut);
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            check_account_exists,
            get_login_hint,
            get_auth_screen_mode,
            reset_local_account,
            erase_vault_and_reset,
            sign_up,
            log_in,
            log_out,
            lock_vault,
            panic_lock,
            get_travel_mode,
            set_travel_mode,
            setup_master_password_from_legacy,
            complete_onboarding,
            update_user,
            get_user,
            // Layered unlock
            get_unlock_info,
            unlock_with_password,
            unlock_with_pin,
            unlock_with_hello,
            hello_available,
            unlock_with_security_key,
            fido_available,
            get_hardware_keys,
            register_hardware_key,
            test_hardware_key,
            remove_hardware_key,
            set_master_password,
            set_pin,
            remove_pin,
            has_pin,
            enroll_hello,
            remove_unlock_method,
            set_biometric_settings,
            // Session Management
            get_session_history,
            revoke_session,
            revoke_all_sessions,
            // Stealth Mode
            set_stealth_mode,
            get_stealth_mode,
            // Theme Selection
            set_theme,
            get_theme,
            // Templates
            get_templates,
            create_entry_from_template,
            // Command Palette
            get_command_palette_items,
            // Password Health Dashboard
            get_password_health,
            // Custom TOTP Parameters
            update_custom_totp_params,
            // HOTP Support
            enable_hotp,
            disable_hotp,
            increment_hotp_counter,
            // Timezone & Clock Sync
            set_timezone_offset,
            get_timezone_offset,
            set_clock_drift,
            get_clock_drift,
            // Device Registration
            register_device,
            sync_device,
            // Statistics
            get_usage_statistics,
            // Encrypted backup
            export_backup,
            restore_backup,
            // Vault
            add_vault_entry,
            remove_vault_entry,
            update_vault_entry,
            get_vault_entries,
            reveal_entry_secret,
            reveal_entry_notes,
            get_vault_entries_page,
            get_vault_entry_count,
            // TOTP
            generate_otp,
            verify_otp,
            generate_totp_secret,
            get_provisioning_uri,
            // Devices
            get_devices,
            add_device,
            remove_device,
            update_device_trust,
            // Sessions
            get_sessions,
            revoke_session,
            revoke_all_sessions,
            // Security
            get_security_events,
            add_security_event,
            get_security_score,
            // Settings
            get_settings,
            update_settings,
            // Account
            rotate_vault_key,
            delete_account_cmd,
            export_vault,
            // Security Questions
            get_security_questions,
            get_enrolled_security_questions,
            get_random_security_questions,
            enroll_security_answers,
            verify_security_answers,
            verify_security_answers_for_reset,
            reset_password_with_security_answers,
            has_security_questions,
            // Account recovery codes (preferred over security questions)
            generate_account_recovery_codes,
            regenerate_account_recovery_codes,
            has_account_recovery_codes,
            unused_account_recovery_codes_count,
            verify_recovery_code_for_reset,
            reset_password_with_recovery_code,
            // Password Generator
            generate_password,
            generate_passphrase,
            check_password_strength,
            // Import/Export
            import_otpauth_uri,
            import_google_authenticator,
            import_authy_csv,
            import_manual_entry,
            // Search & Filters
            search_vault_entries,
            filter_vault_entries_by_category,
            filter_vault_entries_by_tags,
            get_favorite_entries,
            toggle_entry_favorite,
            update_entry_tags,
            // Emergency Access Codes
            generate_emergency_codes,
            get_emergency_codes,
            use_emergency_code,
            has_emergency_codes,
            // Security Audit
            run_security_audit,
            check_pwned_password,
            // Auto-Lock Timer
            set_auto_lock,
            get_auto_lock_settings,
            // Export Formats
            export_vault_json,
            export_vault_secrets_json,
            export_vault_csv,
            // Bulk Operations
            bulk_delete_entries,
            bulk_update_category,
            bulk_add_tags,
            bulk_remove_tags,
            create_vault_transfer,
            import_vault_transfer,
            get_entry_history,
            create_vault_share,
            import_vault_share,
            get_vault_shares,
            revoke_vault_share,
            set_language,
            get_language,
            list_entry_attachments,
            add_entry_attachment,
            remove_entry_attachment,
            export_entry_attachment,
            list_removable_drives,
            export_backup_to_usb,
            // Folder Lock (Windows)
            folder_lock_list,
            folder_lock_search,
            folder_lock_lock,
            folder_lock_unlock,
            folder_lock_relock,
            folder_lock_restore,
            folder_lock_set_favorite,
            folder_lock_activity,
            folder_lock_settings_get,
            folder_lock_settings_set,
            folder_lock_crash_recover,
            folder_lock_take_deep_link,
            // File Lock (Windows)
            file_lock_list,
            file_lock_search,
            file_lock_lock,
            file_lock_lock_batch,
            file_lock_unlock,
            file_lock_relock,
            file_lock_restore,
            file_lock_set_favorite,
            file_lock_activity,
            file_lock_settings_get,
            file_lock_settings_set,
            file_lock_crash_recover,
            file_lock_take_deep_link,
            // Media Vault (Windows)
            media_vault_list,
            media_vault_search,
            media_vault_import,
            media_vault_import_batch,
            media_vault_view,
            media_vault_relock,
            media_vault_relock_all,
            media_vault_delete,
            media_vault_export,
            media_vault_thumb,
            media_vault_set_favorite,
            media_vault_set_title,
            media_vault_set_album,
            media_vault_activity,
            media_vault_settings_get,
            media_vault_settings_set,
            media_vault_crash_recover,
            // Utility
            get_app_version,
            get_platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GenVault");
}
