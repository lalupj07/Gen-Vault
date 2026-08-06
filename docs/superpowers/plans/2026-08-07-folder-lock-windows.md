# Folder Lock (Windows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Windows Folder Lock v1 — encrypt local NTFS folders under the vault key, Explorer context menu, temporary staging unlock, auto-lock wipe — without drivers.

**Architecture:** Rust `folder_lock` module (path policy, AES-GCM file blobs with AAD, DEK wrap via existing `crypto`, SQLite metadata, staging wipe) exposed through Tauri commands; React Folder Lock view + sidebar; `genvault://folder-lock` deep links; Windows shell `IExplorerCommand` sparse package registered by the installer.

**Tech Stack:** Tauri 2, Rust (`aes-gcm`, `zeroize`, `rusqlite`), React/TypeScript, Windows shell sparse package / custom protocol.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-folder-lock-windows-design.md`
- Windows desktop only; no Android / web-demo Folder Lock in this plan
- Local fixed NTFS only — reject removable volumes
- Encrypt-on-disk; unlock decrypts to `%LOCALAPPDATA%\GenVault\folder-lock-staging\<id>\`
- Ciphertext under `%LOCALAPPDATA%\GenVault\folder-lock\<id>\` (via `app_paths`)
- No kernel drivers / minifilters
- AES-256-GCM + existing Argon2id vault unlock; folder DEK 32 bytes wrapped with vault key
- Default auto-lock 15 minutes; size warn at 2 GB
- One active staging unlock session in v1
- Stub at original path: `README.txt` + `.genvault-locked` containing folder id
- Never log DEKs or file plaintext
- Authenticator / existing vault commands unchanged

## File map

| File | Responsibility |
|------|----------------|
| `src-tauri/src/folder_lock/mod.rs` | Module root |
| `src-tauri/src/folder_lock/policy.rs` | PathPolicy validation |
| `src-tauri/src/folder_lock/crypto_files.rs` | Per-file encrypt/decrypt with AAD; DEK wrap |
| `src-tauri/src/folder_lock/store.rs` | Metadata persistence + activity |
| `src-tauri/src/folder_lock/service.rs` | Lock / unlock / relock / wipe staging / crash recovery |
| `src-tauri/src/commands/folder_lock.rs` | Tauri commands |
| `src-tauri/src/crypto.rs` | Add `encrypt_with_aad` / `decrypt_with_aad` |
| `src-tauri/src/lib.rs` | Register module + commands |
| `src/lib/api.ts` | Frontend API wrappers |
| `src/components/FolderLockView.tsx` | Module UI |
| `src/components/Sidebar.tsx` / `page.tsx` | Nav + routing |
| `src-tauri/windows/shell/` | Explorer command package + register scripts |
| `src-tauri/tests/folder_lock_*.rs` | Unit/integration tests |

---

### Task 1: PathPolicy + AAD crypto helpers

**Files:**
- Create: `src-tauri/src/folder_lock/mod.rs`
- Create: `src-tauri/src/folder_lock/policy.rs`
- Modify: `src-tauri/src/crypto.rs` (add AAD encrypt/decrypt)
- Create: `src-tauri/src/folder_lock/crypto_files.rs`
- Modify: `src-tauri/src/lib.rs` (`mod folder_lock;`)
- Test: `src-tauri/src/folder_lock/policy.rs` + `crypto_files.rs` inline `#[cfg(test)]`

**Interfaces:**
- Produces:
  - `policy::validate_lock_path(path: &Path) -> Result<(), PolicyError>`
  - `crypto::encrypt_with_aad(data, key, aad) -> Result<Vec<u8>, CryptoError>` (nonce \|\| ct)
  - `crypto::decrypt_with_aad(data, key, aad) -> Result<Vec<u8>, CryptoError>`
  - `crypto_files::encrypt_file_bytes(plain, dek, folder_id, rel_path) -> Result<Vec<u8>, CryptoError>`
  - `crypto_files::decrypt_file_bytes(blob, dek, folder_id, rel_path) -> Result<Vec<u8>, CryptoError>`
  - `crypto_files::wrap_dek(dek, vault_key) -> Result<Vec<u8>, CryptoError>`
  - `crypto_files::unwrap_dek(wrapped, vault_key) -> Result<[u8; 32], CryptoError>`

- [ ] **Step 1: Write failing policy tests**

In `policy.rs` tests: reject `\Windows\System32`, accept a temp user dir path on Windows; reject path under GenVault data dir when provided.

- [ ] **Step 2: Implement `validate_lock_path`**

Reject if: not a directory; (Windows) volume is removable via `GetDriveTypeW`; path prefix matches Windows, Program Files, Program Files (x86), or user profile root exactly; path is inside GenVault `app_paths::get()`. Normalize with `canonicalize` when possible.

- [ ] **Step 3: Add AAD helpers to `crypto.rs`**

Use `aes_gcm::aead::Payload { msg, aad }`. Same nonce-prepended format as `encrypt`/`decrypt`.

- [ ] **Step 4: Implement `crypto_files` wrap + file helpers + tests**

AAD string: `format!("{folder_id}\0{rel_path}")` UTF-8. Round-trip test + wrong-AAD fails.

- [ ] **Step 5: `cargo test --manifest-path src-tauri/Cargo.toml folder_lock -- --test-threads=1`**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(folder-lock): path policy and AAD file crypto helpers"
```

---

### Task 2: Store + lock/unlock service (core)

**Files:**
- Create: `src-tauri/src/folder_lock/store.rs`
- Create: `src-tauri/src/folder_lock/service.rs`
- Test: integration test with `tempfile`

**Interfaces:**
- Consumes: Task 1 APIs; vault unlocked key from existing session (pass `[u8; 32]` vault key into service methods — command layer obtains it)
- Produces:
  - `service::lock_folder(src: &Path, vault_key: &[u8; 32], confirm_large: bool) -> Result<LockedFolderPublic, ServiceError>`
  - `service::unlock_to_staging(id: &str, vault_key: &[u8; 32]) -> Result<PathBuf, ServiceError>`
  - `service::relock(id: &str) -> Result<(), ServiceError>`
  - `service::wipe_orphan_staging() -> Result<(), ServiceError>`
  - `service::restore_to_original(id: &str, vault_key: &[u8; 32]) -> Result<(), ServiceError>`

- [ ] **Step 1: Metadata schema**

SQLite table `folder_lock` in GenVault data dir file `folder_lock.db` (or reuse vault_db connection if straightforward — prefer separate file under `app_paths` for isolation): id, display_name, original_path_enc, dek_wrapped, status, favorite, size_bytes, created_at, last_locked_at, last_unlocked_at. Activity table `folder_lock_activity`.

- [ ] **Step 2: Lock implementation**

Create id (uuid); encrypt files to `folder-lock/<id>/files/<safe_relpath>.gvf` (encode path); write `manifest.enc` listing relative paths (encrypted JSON with DEK); wipe originals; write stub README + `.genvault-locked` with id.

- [ ] **Step 3: Unlock / relock / orphan wipe**

Decrypt to staging; `relock` wipes staging with overwrite (one pass zeros) then remove_dir_all; `wipe_orphan_staging` clears all staging children.

- [ ] **Step 4: Integration test**

Create temp tree with 2 files → lock → assert stub + ciphertext → unlock → assert staging contents → relock → staging gone → restore_to_original → files back.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(folder-lock): lock/unlock service with staging wipe"
```

---

### Task 3: Tauri commands + frontend API

**Files:**
- Create: `src-tauri/src/commands/folder_lock.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `lib.rs` invoke_handler
- Modify: `src/lib/api.ts`

**Interfaces:**
- Commands: `folder_lock_list`, `folder_lock_lock`, `folder_lock_unlock`, `folder_lock_relock`, `folder_lock_restore`, `folder_lock_set_favorite`, `folder_lock_search`, `folder_lock_activity`, `folder_lock_settings_get/set`, `folder_lock_crash_recover` (called on startup)
- Gate every mutating command on vault unlocked (reuse existing session check pattern from vault commands)

- [ ] **Step 1: Mirror auth patterns from `commands/vault.rs` for unlock-required**
- [ ] **Step 2: Wire api.ts methods**
- [ ] **Step 3: Call `folder_lock_crash_recover` from app setup (lib.rs setup hook, Windows only)**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(folder-lock): Tauri commands and frontend API"
```

---

### Task 4: Folder Lock UI + sidebar

**Files:**
- Create: `src/components/FolderLockView.tsx`
- Modify: `Sidebar.tsx`, `page.tsx` (and i18n keys if used)

- [ ] **Step 1: UI list + lock/unlock/relock/restore + search + favorites + activity + auto-lock setting + disclosure about staging**
- [ ] **Step 2: Sidebar item `folder-lock` with FolderLock icon**
- [ ] **Step 3: Wire `activeView === 'folder-lock'`**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(folder-lock): desktop module UI and sidebar entry"
```

---

### Task 5: Deep link protocol `genvault://folder-lock`

**Files:**
- Modify: `src-tauri/tauri.conf.json` (deep link / protocol if supported) or Windows registry register in installer
- Modify: Rust/JS to handle incoming URL → navigate Folder Lock + prefill lock path

- [ ] **Step 1: Register `genvault` scheme for Windows builds**
- [ ] **Step 2: Parse `action` + `path` query; emit event to UI**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(folder-lock): genvault:// deep link handling"
```

---

### Task 6: Explorer context menu package

**Files:**
- Create: `src-tauri/windows/shell/` (AppxManifest sparse package or documented COM registration + `Register-FolderLockShell.ps1`)
- Modify: `BUILD_RELEASE.md` / installer docs with register/unregister steps

- [ ] **Step 1: Sparse package or static verb that launches `genvault://folder-lock?action=lock&path="%V"`**
- [ ] **Step 2: Document MSI/MSIX post-install registration; uninstall removes it**
- [ ] **Step 3: Manual verify on a Windows machine**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(folder-lock): Explorer Lock with GenVault shell registration"
```

---

### Task 7: Auto-lock timer + polish

**Files:**
- Modify: `FolderLockView.tsx` / small Rust session tracker
- Settings persistence for timeout minutes

- [ ] **Step 1: On unlock start timer; on fire call `folder_lock_relock`**
- [ ] **Step 2: Manual “Lock now”; show remaining time**
- [ ] **Step 3: Final cargo test + Jest smoke (api exports if added)**
- [ ] **Step 4: Update spec status to Implemented**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(folder-lock): auto-lock timer and v1 polish"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Path policy / NTFS local only | 1 |
| Encrypt + DEK wrap + AAD | 1–2 |
| Staging unlock + wipe + crash recovery | 2–3 |
| Restore to original | 2–3 |
| UI / favorites / search / activity | 4 |
| Explorer menu | 5–6 |
| Auto-lock 15m | 7 |
| No drivers | all |

## Resolved plan-time notes

- Stub: README + `.genvault-locked` (id), not junction.  
- One staging session v1.  
- Shell: sparse package / protocol launch preferred over in-proc DLL for safer unload.  
