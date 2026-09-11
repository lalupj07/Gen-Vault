//! Android Autofill plugin — prefs sync + open system Autofill settings.
//!
//! Search/fill IPC from AutofillService → Rust is process-isolated from the
//! Tauri WebView session; Kotlin stubs expose `autofillSearch` / `autofillFill`
//! for a future JNI bridge. WebView uses `autofill_*` Tauri commands.

#[cfg(target_os = "android")]
use std::sync::OnceLock;

#[cfg(target_os = "android")]
use serde::Serialize;
#[cfg(target_os = "android")]
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Wry,
};

#[cfg(target_os = "android")]
const PLUGIN_PKG: &str = "com.genvault.auth";
#[cfg(target_os = "android")]
const PLUGIN_CLASS: &str = "AutofillPlugin";

#[cfg(target_os = "android")]
static HANDLE: OnceLock<PluginHandle<Wry>> = OnceLock::new();

#[cfg(target_os = "android")]
#[derive(Serialize)]
struct EnabledPayload {
    enabled: bool,
}

#[cfg(target_os = "android")]
fn plugin_handle() -> Result<&'static PluginHandle<Wry>, String> {
    HANDLE
        .get()
        .ok_or_else(|| "autofill plugin not initialized".to_string())
}

#[cfg(target_os = "android")]
pub fn init() -> TauriPlugin<Wry> {
    Builder::<Wry, ()>::new("autofill")
        .setup(|_app, api| {
            let handle = api.register_android_plugin(PLUGIN_PKG, PLUGIN_CLASS)?;
            let _ = HANDLE.set(handle);
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
#[allow(dead_code)]
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("autofill").build()
}

/// Sync vault preference into SharedPreferences so AutofillService can read it.
#[cfg(target_os = "android")]
pub fn sync_enabled(enabled: bool) -> Result<(), String> {
    plugin_handle()?
        .run_mobile_plugin("setEnabled", EnabledPayload { enabled })
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
#[allow(dead_code)]
pub fn sync_enabled(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "android")]
pub fn open_system_settings() -> Result<(), String> {
    plugin_handle()?
        .run_mobile_plugin("openSystemSettings", ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
pub fn open_system_settings() -> Result<(), String> {
    Err("Autofill settings are only available on Android".into())
}
