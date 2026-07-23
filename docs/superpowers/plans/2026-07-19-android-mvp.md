# GenVault Android MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a sideloadable Android APK of GenVault with shared Rust vault crypto, phone UI, optional biometrics, and `genvault-backup` v1 interchange with Windows.

**Architecture:** Extend the existing Tauri 2 + Next.js app with an Android target. Gate Windows-only modules. Fix Android data-dir and protector-key storage (Android Keystore). Reuse `hello` unlock method kind for biometric convenience unlock. Add a mobile shell in the React UI and SAF-based backup import/export.

**Tech Stack:** Tauri 2, Rust, Next.js 14 (static export), `tauri-plugin-biometric`, `tauri-plugin-dialog`, Android SDK/NDK, Android Keystore (Kotlin helper).

**Spec:** `docs/superpowers/specs/2026-07-19-android-mvp-design.md`

## Global Constraints

- Security over convenience; never store TOTP seeds or master password unencrypted.
- Biometrics are convenience unlock only; master password always recovers the vault.
- Backup format must remain `{ "format": "genvault-backup", "version": 1, "kdf": "argon2id", "salt", "data" }`.
- No Play Store work in this plan; signed sideload APK only.
- Out of scope: FIDO, USB backup, HIBP, attachments, stealth, cloud sync, iOS.
- Windows desktop build must keep working; desktop-only features stay behind `cfg(windows)`.
- Signing keystores never committed to git.

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `src-tauri/gen/android/**` | Generated Tauri Android project (init once; commit intentional parts) |
| `src-tauri/Cargo.toml` | Mobile deps: biometric plugin; keep Windows deps gated |
| `src-tauri/tauri.conf.json` | Android bundle identifiers / icons as needed |
| `src-tauri/capabilities/default.json` | Add `biometric:default`, `dialog:default`; mobile windows if required |
| `src-tauri/src/lib.rs` | Register mobile plugins; keep `mobile_entry_point` |
| `src-tauri/src/app_paths.rs` | **Create** — process-wide data dir set from Tauri path API at startup |
| `src-tauri/src/store.rs` | Use `app_paths` for `data_dir()` |
| `src-tauri/src/hello.rs` | Android biometric availability / consent via plugin bridge |
| `src-tauri/src/secure_file.rs` | Android: refuse plaintext protector writes; route HPK through keystore helper |
| `src-tauri/src/android_keystore.rs` | **Create** — Rust FFI to store/load/delete biometric-gated protector key |
| `src-tauri/gen/android/.../KeystoreProtector.kt` | **Create** — Android Keystore AES wrap with user auth |
| `src-tauri/src/commands/auth.rs` | Android-safe messages; ensure enroll/unlock hello paths work on Android |
| `src-tauri/src/commands/security_android.rs` | **Create** — `set_flag_secure` command |
| `src-tauri/tests/android_backup_roundtrip.rs` | **Create** — backup format round-trip test (host) |
| `src/lib/platform.ts` | **Create** — `isAndroid()`, `useMobileShell()` |
| `src/lib/api.ts` | Soften “desktop only” error; backup file helpers if needed |
| `src/components/mobile/MobileShell.tsx` | **Create** — phone navigation shell |
| `src/components/mobile/MobileVaultList.tsx` | **Create** — list + search |
| `src/components/mobile/MobileEntryDetail.tsx` | **Create** — TOTP/password detail + copy |
| `src/components/mobile/MobileSettings.tsx` | **Create** — timeout, biometrics, backup, about |
| `src/components/UnlockScreen.tsx` | Mobile layout tweaks; keep hello unlock |
| `src/app/page.tsx` | Branch desktop vs mobile shell |
| `package.json` | Scripts: `tauri:android:dev`, `tauri:android:build` |
| `.gitignore` | Ignore local keystores, Android build caches if needed |
| `docs/android-mvp-checklist.md` | **Create** — manual device QA checklist |

---

### Task 1: Android project scaffold + compile gates

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json` (only if init requires)
- Create: `src-tauri/gen/android/**` (via CLI)
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing `genvault_lib::run`
- Produces: Android project that links the Rust lib; npm scripts for android dev/build

- [ ] **Step 1: Prerequisites check**

Run (PowerShell):

```powershell
rustc --version
cargo --version
npx tauri --version
# Android Studio / SDK / NDK must be installed; JAVA_HOME and ANDROID_HOME set
echo $env:ANDROID_HOME
echo $env:JAVA_HOME
```

Expected: versions print; `ANDROID_HOME` and `JAVA_HOME` non-empty. If missing, install Android Studio + NDK and stop until fixed.

- [ ] **Step 2: Add Rust Android targets**

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Expected: targets installed (or already present).

- [ ] **Step 3: Init Tauri Android project**

From repo root:

```powershell
npx tauri android init
```

Expected: `src-tauri/gen/android` created without fatal errors.

- [ ] **Step 4: Gate compile-breaking desktop-only deps for Android**

In `src-tauri/Cargo.toml`, ensure `ctap-hid-fido2` and `windows` remain under `[target.'cfg(windows)'.dependencies]` only (already true). If `keyring` fails to compile for Android, gate it:

```toml
[target.'cfg(not(target_os = "android"))'.dependencies]
keyring = "3"

[target.'cfg(target_os = "android")'.dependencies]
# keyring omitted — Android uses app data dir + Keystore for protectors
```

Then wrap all `keyring::Entry` usages in `store.rs` with `#[cfg(not(target_os = "android"))]` and provide Android stubs that return `StoreError::Keyring("unavailable".into())` or no-op deletes.

- [ ] **Step 5: Stub USB/FIDO modules already gated**

Verify `fido.rs` and `usb_drives.rs` use `#[cfg(windows)]` for native code and non-Windows stubs return errors/false. No change if already correct; fix compile errors only.

- [ ] **Step 6: Add npm scripts**

In `package.json` `scripts`:

```json
"tauri:android:dev": "tauri android dev",
"tauri:android:build": "tauri android build"
```

- [ ] **Step 7: Gitignore local secrets / heavy caches**

Append to `.gitignore` if missing:

```
*.jks
*.keystore
!src-tauri/icons/**
src-tauri/gen/android/**/build/
src-tauri/gen/android/**/.gradle/
local.properties
```

- [ ] **Step 8: First Android build attempt**

```powershell
npm run tauri:android:build
```

Expected: build progresses; fix only compile errors needed to link. Emulator/device not required yet for a successful Gradle assemble of a debug APK.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore src-tauri/Cargo.toml src-tauri/src src-tauri/gen/android src-tauri/tauri.conf.json
git commit -m "build: scaffold Tauri Android target and compile gates"
```

---

### Task 2: App data directory on Android

**Files:**
- Create: `src-tauri/src/app_paths.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/store.rs` (`data_dir` ~lines 74–86)
- Test: host unit test via `GENVAULT_DATA_DIR` (existing override)

**Interfaces:**
- Consumes: `tauri::Manager` path resolver `app.path().app_data_dir()`
- Produces:
  - `app_paths::init(path: PathBuf)`
  - `app_paths::data_dir() -> Result<PathBuf, String>`

- [ ] **Step 1: Write failing test for override still working**

In `src-tauri/src/store.rs` or a small `#[cfg(test)]` module, ensure:

```rust
#[test]
fn data_dir_honors_env_override() {
    let tmp = tempfile::tempdir().unwrap();
    std::env::set_var("GENVAULT_DATA_DIR", tmp.path());
    let dir = crate::store::data_dir_public().unwrap();
    assert_eq!(dir, tmp.path());
    std::env::remove_var("GENVAULT_DATA_DIR");
}
```

- [ ] **Step 2: Run test**

```powershell
cd src-tauri; cargo test data_dir_honors_env_override --locked
```

Expected: PASS (already works) or FAIL if broken — fix before changing.

- [ ] **Step 3: Implement `app_paths.rs`**

```rust
use std::path::PathBuf;
use std::sync::OnceLock;

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init(path: PathBuf) {
    let _ = DATA_DIR.set(path);
}

pub fn get() -> Option<PathBuf> {
    DATA_DIR.get().cloned()
}
```

Register in `lib.rs` `run()`:

```rust
.setup(|app| {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app_paths::init(dir);
    Ok(())
})
```

(Add `use tauri::Manager;`.)

- [ ] **Step 4: Update `store::data_dir`**

```rust
fn data_dir() -> Result<PathBuf, StoreError> {
    if let Ok(override_dir) = std::env::var("GENVAULT_DATA_DIR") {
        let dir = PathBuf::from(override_dir);
        fs::create_dir_all(&dir)?;
        return Ok(dir);
    }
    if let Some(dir) = crate::app_paths::get() {
        fs::create_dir_all(&dir)?;
        return Ok(dir);
    }
    let dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .ok_or(StoreError::NoDataDir)?
        .join("GenVault");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}
```

- [ ] **Step 5: Re-run tests**

```powershell
cd src-tauri; cargo test data_dir_honors_env_override --locked
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_paths.rs src-tauri/src/lib.rs src-tauri/src/store.rs
git commit -m "fix: use Tauri app data dir for vault storage on mobile"
```

---

### Task 3: Backup round-trip regression test (host)

**Files:**
- Create: `src-tauri/tests/android_backup_roundtrip.rs` (runs on host; locks format)

**Interfaces:**
- Consumes: `store::export_backup`, `store::decode_backup`
- Produces: CI-safe guarantee of `format: genvault-backup` / `version: 1`

- [ ] **Step 1: Write the test**

Copy helpers (`with_isolated_data_dir`, `sample_entry`) from `src-tauri/tests/e2e_smoke.rs` into the new test file (or share a `tests/common.rs` if you prefer). Concrete test body:

```rust
use genvault_lib::crypto;
use genvault_lib::models::VaultData;
use genvault_lib::store;
use serde_json::Value;

#[test]
fn genvault_backup_v1_roundtrip_preserves_format() {
    with_isolated_data_dir(|_| {
        let vmk = crypto::generate_key();
        let mut vault = VaultData::default();
        vault.vault_entries.push(sample_entry("BackupTest"));
        store::save_vault_with_key(&vault, &vmk).expect("save");

        let json = store::export_backup("BackupPassphrase9!", &vmk).expect("export");
        let parsed: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["format"], "genvault-backup");
        assert_eq!(parsed["version"], 1);
        assert_eq!(parsed["kdf"], "argon2id");
        assert!(parsed["salt"].as_str().unwrap().len() > 0);
        assert!(parsed["data"].as_str().unwrap().len() > 0);

        let restored = store::decode_backup("BackupPassphrase9!", &json).expect("decode");
        assert_eq!(restored.vault_entries.len(), 1);
        assert_eq!(restored.vault_entries[0].name, "BackupTest");
    });
}
```

- [ ] **Step 2: Run test**

```powershell
cd src-tauri; cargo test genvault_backup_v1_roundtrip_preserves_format --locked -- --test-threads=1
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/android_backup_roundtrip.rs
git commit -m "test: lock genvault-backup v1 format for Android interchange"
```

---

### Task 4: Android Keystore protector + biometric unlock

**Files:**
- Create: `src-tauri/src/android_keystore.rs`
- Create: Kotlin helper under `src-tauri/gen/android/` (package `com.genxis.genvault`)
- Modify: `src-tauri/src/secure_file.rs`
- Modify: `src-tauri/src/hello.rs`
- Modify: `src-tauri/src/store.rs` (`enroll_hello`, `unlock_with_hello`, protector load/save)
- Modify: `src-tauri/src/commands/auth.rs`
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-biometric` for mobile)
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json` / npm deps `@tauri-apps/plugin-biometric`

**Interfaces:**
- Consumes: existing method kind `"hello"`; `store::enroll_hello`, `store::unlock_with_hello`
- Produces:
  - `android_keystore::store_hpk(hpk: &[u8; 32]) -> Result<(), String>`
  - `android_keystore::load_hpk() -> Result<[u8; 32], String>` (biometric-gated)
  - `android_keystore::delete_hpk() -> Result<(), String>`
  - `hello::is_available()` / `hello::request_consent()` work on Android
  - Frontend keeps calling `api.unlockWithHello()` / `api.enrollHello()`

**Security rules (must hold):**
- HPK must not be written plaintext on Android.
- Biometric failure/cancel → unlock fails; password unlock still works.
- Removing biometric removes `"hello"` method and deletes Keystore entry; password remains.

- [ ] **Step 1: Add biometric plugin**

```powershell
npm run tauri add biometric
```

Ensure `capabilities/default.json` includes `"biometric:default"`.

Register in `lib.rs` only on mobile:

```rust
#[cfg(mobile)]
{
    builder = builder.plugin(tauri_plugin_biometric::init());
}
```

(Adapt to how `Builder` is currently constructed — chain `.plugin(...)` before `.run`.)

- [ ] **Step 2: Implement Android Keystore Kotlin helper**

Create a class that:
1. Generates an AES key in Android Keystore with alias `genvault_hello_hpk`, `setUserAuthenticationRequired(true)`, `BIOMETRIC_STRONG`.
2. Encrypts/decrypts the 32-byte HPK with that key (AES-GCM); ciphertext file may live in app files dir as `hello_protector.android.dat` (ciphertext only).
3. Exposes static methods callable from Rust via Tauri plugin JNI or `tauri::plugin::Plugin` mobile binding.

If wiring a full custom plugin is too heavy, use an `invoke`-style plugin command pair implemented in Kotlin per Tauri mobile plugin docs — but **Rust `store::enroll_hello` / `unlock_with_hello` must call into it**, not the WebView.

- [ ] **Step 3: Rust `android_keystore` module**

```rust
#[cfg(target_os = "android")]
pub fn store_hpk(hpk: &[u8; 32]) -> Result<(), String> { /* call Kotlin */ }

#[cfg(target_os = "android")]
pub fn load_hpk() -> Result<[u8; 32], String> { /* biometric + decrypt */ }

#[cfg(target_os = "android")]
pub fn delete_hpk() -> Result<(), String> { /* delete key + ciphertext */ }

#[cfg(not(target_os = "android"))]
pub fn store_hpk(_: &[u8; 32]) -> Result<(), String> {
    Err("android keystore unavailable".into())
}
// similarly for load/delete stubs
```

- [ ] **Step 4: Wire `enroll_hello` / protector load on Android**

In `store::enroll_hello`, after generating `hpk`:

```rust
#[cfg(target_os = "android")]
{
    crate::android_keystore::store_hpk(&hpk)?;
}
#[cfg(not(target_os = "android"))]
{
    save_protector_key("hello_protector.dat", &hpk)?;
}
```

In `unlock_with_hello` protector load:

```rust
#[cfg(target_os = "android")]
let hpk = crate::android_keystore::load_hpk().map_err(|_| StoreError::InvalidSecret)?;
#[cfg(not(target_os = "android"))]
let hpk = load_protector_key("hello_protector.dat", "hello")?;
```

On Android, `hello::request_consent` may return `Ok(true)` if Keystore load itself enforces biometric; **or** call biometric status first. Prefer: Keystore enforces auth; `request_consent` on Android checks `is_available` and returns Ok(true) so double-prompt is avoided. Document the choice in a one-line comment in `hello.rs`.

- [ ] **Step 5: Update `hello.rs` availability on Android**

```rust
#[cfg(target_os = "android")]
pub fn is_available() -> bool {
    // Query biometric status via plugin FFI or android_keystore::is_available()
    crate::android_keystore::biometric_available()
}

#[cfg(target_os = "android")]
pub fn request_consent(_message: &str) -> Result<bool, String> {
    // If Keystore gates load_hpk, skip second prompt:
    Ok(crate::android_keystore::biometric_available())
}
```

- [ ] **Step 6: Soften auth command errors for Android**

In `commands/auth.rs` `unlock_with_hello`, change user-facing string from `"Windows Hello verification was not completed"` to `"Biometric verification was not completed"`.

- [ ] **Step 7: Host compile check**

```powershell
cd src-tauri; cargo test --locked -- --test-threads=1
```

Expected: PASS on Windows host.

- [ ] **Step 8: Android build**

```powershell
npm run tauri:android:build
```

Expected: APK builds with Keystore helper linked.

- [ ] **Step 9: Commit**

```bash
git add src-tauri package.json package-lock.json
git commit -m "feat: Android Keystore biometric unlock for hello method"
```

---

### Task 5: Mobile platform helper + shell UI

**Files:**
- Create: `src/lib/platform.ts`
- Create: `src/components/mobile/MobileShell.tsx`
- Create: `src/components/mobile/MobileVaultList.tsx`
- Create: `src/components/mobile/MobileEntryDetail.tsx`
- Create: `src/components/mobile/MobileAddEntry.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/api.ts` (error string)
- Modify: `src/components/UnlockScreen.tsx` (responsive padding)

**Interfaces:**
- Consumes: `api.getPlatform()`, `api.getVaultEntries()`, `api.generateOtp`, existing unlock APIs
- Produces:
  - `isMobileShell(): Promise<boolean>` — true when `platform === 'android'` OR width &lt; 768 in Tauri android
  - Mobile routes in-shell: `list | detail | add | settings`

- [ ] **Step 1: Fix api.ts non-Tauri message**

Change throw text to:

```typescript
throw new Error('GenVault requires the GenVault application. Browser mode is disabled for security.');
```

- [ ] **Step 2: Create `platform.ts`**

```typescript
import { api } from './api';

export async function getOsPlatform(): Promise<string> {
  try {
    return await api.getPlatform();
  } catch {
    return 'unknown';
  }
}

export async function useAndroidShell(): Promise<boolean> {
  const os = await getOsPlatform();
  return os === 'android';
}
```

- [ ] **Step 3: Build MobileVaultList / Detail / Add**

Reuse existing `api` methods only:
- List: `getVaultEntries`, filter by search string client-side
- Detail: `generateOtp` for TOTP; show password field; copy + existing clipboard clear patterns from desktop components
- Add: call existing add vault entry / TOTP import commands already exposed in `api.ts` (QR via existing `QRScanner` if camera permission granted)

Keep styling consistent with current dark theme CSS variables in `globals.css` — single column, large tap targets (≥44px), safe-area padding:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

- [ ] **Step 4: MobileShell**

Bottom nav: Vault | Add | Settings. Detail is a stack push over list. Lock button calls `api.lockVault()`.

- [ ] **Step 5: Branch in `page.tsx`**

After auth resolves unlocked state:

```tsx
const [androidShell, setAndroidShell] = useState(false);
useEffect(() => {
  useAndroidShell().then(setAndroidShell);
}, []);

if (androidShell && isAuthenticated && !vaultLocked) {
  return <MobileShell /* pass entries refresh callbacks */ />;
}
// existing desktop layout...
```

Unlock / onboarding screens remain shared (responsive).

- [ ] **Step 6: Manual UI smoke on emulator**

```powershell
npm run tauri:android:dev
```

Expected: unlock → list renders without desktop sidebar.

- [ ] **Step 7: Commit**

```bash
git add src/lib/platform.ts src/lib/api.ts src/components/mobile src/app/page.tsx src/components/UnlockScreen.tsx
git commit -m "feat: add Android mobile vault shell UI"
```

---

### Task 6: Backup import/export via SAF (dialog plugin)

**Files:**
- Modify: `package.json` (dialog plugin)
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs`
- Create: helpers in `src/components/mobile/MobileSettings.tsx`
- Modify: `src/lib/api.ts` if needed

**Interfaces:**
- Consumes: `api.exportBackup(passphrase)`, `api.restoreBackup(passphrase, backupJson)`
- Produces: Settings actions “Export backup” / “Restore backup” using `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs` **or** read/write via dialog save/open returning path + fs plugin

- [ ] **Step 1: Add dialog + fs plugins**

```powershell
npm run tauri add dialog
npm run tauri add fs
```

Capabilities: `"dialog:default"` and scoped `fs` permissions limited to user-selected paths (follow Tauri 2 fs scope docs — prefer dialog-picked files only).

- [ ] **Step 2: Export flow in MobileSettings**

```typescript
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

async function exportBackup(passphrase: string) {
  const json = await api.exportBackup(passphrase);
  const path = await save({
    defaultPath: 'genvault-backup.json',
    filters: [{ name: 'GenVault Backup', extensions: ['json'] }],
  });
  if (!path) return; // cancel = no-op
  await writeTextFile(path, json);
}
```

- [ ] **Step 3: Restore flow**

```typescript
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

async function restoreBackup(passphrase: string) {
  const path = await open({
    multiple: false,
    filters: [{ name: 'GenVault Backup', extensions: ['json'] }],
  });
  if (!path || Array.isArray(path)) return;
  const confirmed = window.confirm(
    'Restore replaces all vault entries on this device. Continue?'
  );
  if (!confirmed) return;
  const json = await readTextFile(path);
  await api.restoreBackup(passphrase, json);
}
```

Wrong passphrase: show generic error; vault unchanged (backend already behaves this way).

- [ ] **Step 4: Settings biometrics toggle**

Use existing `api.helloAvailable()`, `api.enrollHello()`, `api.removeUnlockMethod('hello')`, `api.setBiometricSettings(enabled)` — hide Windows-only FIDO/USB controls on Android.

- [ ] **Step 5: Idle timeout**

Wire existing settings APIs for auto-lock timeout if already exposed; otherwise only surface controls that already exist in `api.ts` / backend. Do not invent new timeout commands in this task.

- [ ] **Step 6: Device test**

Export on Android → copy file → restore on same device. Optionally restore a Windows-produced `genvault-backup` file.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri/capabilities package.json package-lock.json src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat: Android backup export/restore via system file picker"
```

---

### Task 7: FLAG_SECURE + camera permission + release APK

**Files:**
- Create: `src-tauri/src/commands/security_android.rs` (or inline in vault commands)
- Modify: `src-tauri/src/lib.rs` (register command)
- Modify: AndroidManifest in `src-tauri/gen/android` for `CAMERA` if QR used
- Modify: Kotlin/Java activity to set `WindowManager.LayoutParams.FLAG_SECURE` when vault unlocked (command-triggered)
- Create: `docs/android-mvp-checklist.md`
- Modify: `package.json` if release script added

**Interfaces:**
- Produces: `set_screen_secure(enabled: bool) -> Result<(), String>`
- Frontend: call `set_screen_secure(true)` when unlocked on Android; `false` on lock

- [ ] **Step 1: Implement `set_screen_secure`**

Rust command calls into Android main activity to add/clear `FLAG_SECURE`. No-op on non-Android:

```rust
#[tauri::command]
pub fn set_screen_secure(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    { /* JNI / plugin call */ }
    #[cfg(not(target_os = "android"))]
    { let _ = enabled; }
    Ok(())
}
```

- [ ] **Step 2: Call from auth lifecycle**

In mobile shell / auth context: after successful unlock → `set_screen_secure(true)`; on `lockVault` / logout → `set_screen_secure(false)`.

- [ ] **Step 3: Camera permission**

Ensure AndroidManifest includes:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

Request at runtime when opening QR scanner (browser `getUserMedia` / html5-qrcode).

- [ ] **Step 4: Signed release APK (sideload)**

Generate a local keystore **outside the repo** (e.g. `%USERPROFILE%\.genvault\android-release.jks`). Configure Gradle signing via `local.properties` or env vars — never commit the JKS.

```powershell
npm run tauri:android:build
```

Locate release APK under `src-tauri/gen/android/app/build/outputs/apk/` (exact path may vary; document it in checklist).

- [ ] **Step 5: Write checklist**

`docs/android-mvp-checklist.md`:

```markdown
# Android MVP manual checklist
- [ ] Install signed APK
- [ ] Create vault + master password
- [ ] Add TOTP (QR or manual) + password entry
- [ ] Lock / unlock with password
- [ ] Enroll biometric; unlock with biometric; cancel falls back to password
- [ ] Auto-lock works
- [ ] Export backup; restore on device
- [ ] Restore Windows genvault-backup v1 file
- [ ] Recents/screenshot blocked while unlocked (FLAG_SECURE)
- [ ] Windows desktop build still runs
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src docs/android-mvp-checklist.md src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "feat: FLAG_SECURE, camera permission, Android release checklist"
```

---

### Task 8: Verification gate (definition of done)

**Files:** none new (run existing)

- [ ] **Step 1: Host tests**

```powershell
npm test
cd src-tauri; cargo test --locked -- --test-threads=1
```

Expected: PASS (or only pre-existing failures unrelated to Android — do not ignore new failures).

- [ ] **Step 2: Windows still builds**

```powershell
npm run tauri:build
```

Expected: Windows MSI/NSIS build still succeeds (or project’s usual Windows build script).

- [ ] **Step 3: Complete `docs/android-mvp-checklist.md` on a device/emulator**

All boxes checked.

- [ ] **Step 4: Final commit if checklist/docs tweaked**

```bash
git add docs/android-mvp-checklist.md
git commit -m "docs: record Android MVP verification results"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Tauri Android shared Rust + Next UI | 1, 5 |
| Platform gates Windows vs Android | 1, 4 |
| Core MVP screens | 5, 6 |
| Master password + optional biometrics | 4, 5, 6 |
| `genvault-backup` v1 bidirectional | 3, 6 |
| Keystore-backed biometric wrap | 4 |
| SAF file picker backup | 6 |
| FLAG_SECURE | 7 |
| Sideload APK | 7, 8 |
| Offline-first / no new network | (no network tasks added) |
| Rate limit unlock | existing `auth.rs` reused |
| Out of scope items not built | YAGNI across tasks |

## Consistency notes

- Unlock method kind remains `"hello"` on Android for API compatibility with `UnlockScreen` / `enrollHello`.
- `restore_backup` requires an unlocked vault — mobile UX: create account → unlock → restore (documented in settings copy).
