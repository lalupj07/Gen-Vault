//! Android Keystore-backed Hello (biometric) protector key storage.
//! HPK never touches disk in plaintext; ciphertext lives in app files dir only.

#[cfg(target_os = "android")]
use std::sync::OnceLock;

#[cfg(target_os = "android")]
use serde::{Deserialize, Serialize};
#[cfg(target_os = "android")]
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Wry,
};
#[cfg(target_os = "android")]
use tauri_plugin_biometric::BiometricExt;

#[cfg(target_os = "android")]
const PLUGIN_PKG: &str = "com.genvault.auth";
#[cfg(target_os = "android")]
const PLUGIN_CLASS: &str = "HelloKeystorePlugin";

#[cfg(target_os = "android")]
static APP: OnceLock<AppHandle> = OnceLock::new();
#[cfg(target_os = "android")]
static HANDLE: OnceLock<PluginHandle<Wry>> = OnceLock::new();

#[cfg(target_os = "android")]
#[derive(Serialize)]
struct HpkPayload {
    hpk: String,
}

#[cfg(target_os = "android")]
#[derive(Deserialize)]
struct HpkResponse {
    hpk: String,
}

#[cfg(target_os = "android")]
#[derive(Deserialize)]
struct AvailableResponse {
    available: bool,
}

#[cfg(target_os = "android")]
fn plugin_handle() -> Result<&'static PluginHandle<Wry>, String> {
    HANDLE
        .get()
        .ok_or_else(|| "hello-keystore plugin not initialized".to_string())
}

#[cfg(target_os = "android")]
pub fn init() -> TauriPlugin<Wry> {
    Builder::<Wry, ()>::new("hello-keystore")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_PKG, PLUGIN_CLASS)?;
            let _ = HANDLE.set(handle);
            let _ = APP.set(app.clone());
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("hello-keystore").build()
}

#[cfg(target_os = "android")]
pub fn store_hpk(_: &[u8; 32]) -> Result<(), String> {
    Err("Hello HPK storage is disabled; use password + biometric presence".into())
}

#[cfg(not(target_os = "android"))]
pub fn store_hpk(_: &[u8; 32]) -> Result<(), String> {
    Err("android keystore unavailable".into())
}

#[cfg(target_os = "android")]
pub fn load_hpk() -> Result<[u8; 32], String> {
    Err("Hello HPK load is disabled; use password + biometric presence".into())
}

#[cfg(not(target_os = "android"))]
pub fn load_hpk() -> Result<[u8; 32], String> {
    Err("android keystore unavailable".into())
}

#[cfg(target_os = "android")]
pub fn delete_hpk() -> Result<(), String> {
    plugin_handle()?
        .run_mobile_plugin("deleteHpk", ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
pub fn delete_hpk() -> Result<(), String> {
    Err("android keystore unavailable".into())
}

#[cfg(target_os = "android")]
pub fn authenticate_presence() -> Result<(), String> {
    plugin_handle()?
        .run_mobile_plugin("authenticatePresence", ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
pub fn authenticate_presence() -> Result<(), String> {
    Err("android keystore unavailable".into())
}

#[cfg(target_os = "android")]
pub fn biometric_available() -> bool {
    if let Some(app) = APP.get() {
        if let Ok(status) = app.biometric().status() {
            return status.is_available;
        }
        if let Ok(r) = plugin_handle()
            .and_then(|h| {
                h.run_mobile_plugin::<AvailableResponse>("biometricAvailable", ())
                    .map_err(|e| e.to_string())
            })
        {
            return r.available;
        }
    }
    false
}

#[cfg(not(target_os = "android"))]
pub fn biometric_available() -> bool {
    false
}
