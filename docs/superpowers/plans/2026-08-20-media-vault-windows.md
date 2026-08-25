# Media Vault (Windows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Windows Media Vault v1 — import photos/videos/PDFs into encrypted on-device storage, blurred gallery until unlock, staging view via default app, auto-lock wipe — without drivers.

**Architecture:** Rust `media_vault` module (MIME policy, AES-GCM payload + encrypted thumbnails with AAD prefix `media\0`, DEK wrap via existing `folder_lock::crypto_files`, SQLite metadata, separate staging root) exposed through Tauri commands; React `MediaVaultView` + sidebar; startup orphan staging wipe mirrors File Lock.

**Tech Stack:** Tauri 2, Rust (`aes-gcm`, `zeroize`, `rusqlite`, `image` for thumb resize), React/TypeScript.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-media-vault-windows-design.md`
- Windows desktop only; no Android Media Vault in this plan
- Local fixed NTFS import paths only — reject removable volumes, symlinks, reparse points
- Import model (not in-place lock); ciphertext under `%LOCALAPPDATA%\GenVault\media-vault\<id>\`
- Staging under `%LOCALAPPDATA%\GenVault\media-vault-staging\<id>\` — separate from folder/file lock staging
- MIME allowlist: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.heic`, `.mp4`, `.webm`, `.mov`, `.pdf`
- Hard reject import > 2 GB; warn confirm > 256 MB
- Default auto-lock 15 minutes
- Export requires master password re-entry (mirror `reveal_entry_secret` pattern)
- No kernel drivers; never log DEKs or plaintext bytes
- Crash-recover IPC requires vault unlock; startup wipe ungated
- Explorer “Add to Media Vault” verb — **deferred** (Task 10 optional)

## File map

| File | Responsibility |
|------|----------------|
| `src-tauri/src/media_vault/mod.rs` | Module root |
| `src-tauri/src/media_vault/policy.rs` | Import path + MIME validation |
| `src-tauri/src/media_vault/thumb.rs` | Resize images → JPEG bytes for encrypted thumb |
| `src-tauri/src/media_vault/store.rs` | SQLite rows + activity |
| `src-tauri/src/media_vault/service.rs` | Import / view / relock / delete / export |
| `src-tauri/src/commands/media_vault.rs` | Tauri commands |
| `src-tauri/src/lib.rs` | Register module, commands, startup wipe |
| `src-tauri/Cargo.toml` | Add `image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }` |
| `src/lib/api.ts` | Frontend invoke wrappers + types |
| `src/components/MediaVaultView.tsx` | Gallery UI |
| `src/components/Sidebar.tsx` / `src/app/page.tsx` | Nav + routing |
| `src/lib/i18n` or locale keys | `nav.mediaVault` label |

---

### Task 1: Policy + MIME allowlist

**Files:**
- Create: `src-tauri/src/media_vault/mod.rs`
- Create: `src-tauri/src/media_vault/policy.rs`
- Modify: `src-tauri/src/lib.rs` (`mod media_vault;`)
- Test: inline `#[cfg(test)]` in `policy.rs`

**Interfaces:**
- Produces:
  - `policy::validate_import_path(path: &Path, genvault_data_dir: Option<&Path>) -> Result<MediaKind, PolicyError>`
  - `MediaKind` enum: `Image | Video | Pdf`

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn rejects_exe_and_zip() {
    assert!(validate_import_path(Path::new("C:\\x.exe"), None).is_err());
    assert!(validate_import_path(Path::new("C:\\x.zip"), None).is_err());
}

#[test]
fn accepts_jpg_in_temp() {
    let dir = std::env::temp_dir().join("genvault_mv_policy");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let f = dir.join("a.jpg");
    fs::write(&f, b"\xff\xd8\xff").unwrap();
    assert!(matches!(validate_import_path(&f, None), Ok(MediaKind::Image)));
    let _ = fs::remove_dir_all(&dir);
}
```

- [ ] **Step 2: Implement `validate_import_path`**

Reuse system-path / removable / GenVault-data / symlink checks from `file_lock/policy.rs` (copy pattern, do not share symlink helper across modules unless already extracted). Map extension → `MediaKind`; reject unknown ext.

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml media_vault::policy -- --test-threads=1`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/media_vault/ src-tauri/src/lib.rs
git commit -m "feat(media-vault): import path and MIME policy"
```

---

### Task 2: Store schema

**Files:**
- Create: `src-tauri/src/media_vault/store.rs`
- Test: inline tests with `tempfile`

**Interfaces:**
- Consumes: Task 1 `MediaKind`
- Produces:
  - `MediaVaultStore::new(data_dir: PathBuf) -> Result<Self, StoreError>`
  - `insert(row: MediaItemRow) -> Result<(), StoreError>`
  - `list() -> Result<Vec<MediaItemRow>, StoreError>`
  - `get(id: &str) -> Result<MediaItemRow, StoreError>`
  - `update_status(id: &str, status: ItemStatus) -> Result<(), StoreError>`
  - `delete(id: &str) -> Result<(), StoreError>`
  - `add_activity(id: &str, action: &str, detail: &str) -> Result<(), StoreError>`
  - `search(query: &str) -> Result<Vec<MediaItemRow>, StoreError>`

- [ ] **Step 1: Schema**

File `media_vault.db` under data dir. Tables: `media_items` (id, title, album, mime, size_bytes, imported_at, favorite, status, wrapped_dek BLOB, original_name), `media_vault_activity` (id, item_id, action, detail, ts).

- [ ] **Step 2: CRUD + tests**

Insert/list/get/delete round-trip test.

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml media_vault::store -- --test-threads=1`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(media-vault): SQLite metadata store"
```

---

### Task 3: Thumbnail generation

**Files:**
- Create: `src-tauri/src/media_vault/thumb.rs`
- Modify: `src-tauri/Cargo.toml` (add `image` dep)
- Modify: `src-tauri/src/media_vault/mod.rs` (`pub mod thumb;`)

**Interfaces:**
- Produces:
  - `thumb::generate_jpeg_thumb(plain: &[u8], max_edge: u32) -> Result<Vec<u8>, ThumbError>`
  - Returns empty for non-image callers (service skips thumb gen for video/pdf)

- [ ] **Step 1: Add `image` dependency**

```toml
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }
```

- [ ] **Step 2: Implement resize → JPEG quality 75, max edge 256**

Test with tiny embedded PNG bytes in `#[cfg(test)]`.

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml media_vault::thumb -- --test-threads=1`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(media-vault): encrypted thumbnail generation helper"
```

---

### Task 4: Import + crypto service

**Files:**
- Create: `src-tauri/src/media_vault/service.rs`
- Modify: `src-tauri/src/media_vault/mod.rs` (`pub mod service;`)

**Interfaces:**
- Consumes: Task 1–3; `folder_lock::crypto_files::{encrypt_file_bytes, decrypt_file_bytes, wrap_dek, unwrap_dek}` with AAD `format!("media\0{id}\0{basename}")`
- Produces:
  - `MediaVaultService::new(data_dir: PathBuf) -> Result<Self, ServiceError>`
  - `import(path: &Path, vault_key: &[u8; 32], delete_original: bool, confirm_large: bool) -> Result<MediaItemPublic, ServiceError>`
  - `import_batch(paths: &[PathBuf], vault_key: &[u8; 32], delete_original: bool, confirm_large: bool) -> Result<BatchImportResult, ServiceError>`
  - `NEEDS_LARGE_CONFIRM` error when size > 256 MB and not confirmed
  - Payload file: `media-vault/<id>/payload.gvm`; thumb: `media-vault/<id>/thumb.gvt` (encrypted thumb bytes)

- [ ] **Step 1: `import` workflow**

Validate → size checks → read file → encrypt payload → optional thumb → wrap DEK → write blobs → DB insert → activity `imported` → if `delete_original`: secure-wipe source (reuse file_lock secure wipe helpers or inline one-pass zero).

- [ ] **Step 2: Batch partial success**

`BatchImportResult { imported: Vec<MediaItemPublic>, failed: Vec<{ path, error }> }`

- [ ] **Step 3: Integration test**

Temp dir: import JPG → assert ciphertext exists, DB row `stored`, original removed when `delete_original=true`.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml media_vault::service -- --test-threads=1`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(media-vault): import service with encrypted payload and thumb"
```

---

### Task 5: View, relock, delete, export

**Files:**
- Modify: `src-tauri/src/media_vault/service.rs`

**Interfaces:**
- Produces:
  - `view(id: &str, vault_key: &[u8; 32]) -> Result<PathBuf, ServiceError>` — decrypt to staging, status `viewing`, return staging file path
  - `relock(id: &str) -> Result<(), ServiceError>` — wipe staging, status `stored`
  - `relock_all_viewing() -> Result<(), ServiceError>`
  - `delete_item(id: &str, vault_key: &[u8; 32]) -> Result<(), ServiceError>` — wipe blobs + staging + DB
  - `export(id: &str, dest: &Path, vault_key: &[u8; 32]) -> Result<(), ServiceError>`
  - `wipe_orphan_staging() -> Result<(), ServiceError>` — startup helper
  - `decrypt_thumb(id: &str, vault_key: &[u8; 32]) -> Result<Vec<u8>, ServiceError>` — JPEG bytes for UI grid

- [ ] **Step 1: View + relock**

Mirror `file_lock` staging wipe (read-only clear + `wipe_dir_tree`).

- [ ] **Step 2: Open with OS**

Command layer calls `view` then `open::that(staging_path)` on Windows (reuse pattern from file_lock commands if present).

- [ ] **Step 3: Delete + export tests**

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(media-vault): view, relock, delete, and export"
```

---

### Task 6: Tauri commands + startup wipe

**Files:**
- Create: `src-tauri/src/commands/media_vault.rs`
- Modify: `src-tauri/src/commands/mod.rs` (`pub mod media_vault; pub use media_vault::*;`)
- Modify: `src-tauri/src/lib.rs` (register commands + `wipe_media_vault_orphans_on_startup()` in setup)

**Interfaces:**
- Commands (all require `get_key()` except startup wipe fn):
  - `media_vault_list`, `media_vault_search`, `media_vault_import`, `media_vault_import_batch`
  - `media_vault_view`, `media_vault_relock`, `media_vault_relock_all`
  - `media_vault_delete`, `media_vault_export` (args: `id`, `dest_path`, `password` — verify password via existing store unlock check before export)
  - `media_vault_thumb` (returns base64 JPEG for grid — decrypt in memory only)
  - `media_vault_set_favorite`, `media_vault_set_title`, `media_vault_set_album`
  - `media_vault_activity`, `media_vault_settings_get`, `media_vault_settings_set`
  - `media_vault_crash_recover` (requires unlock; calls orphan wipe)

- [ ] **Step 1: Implement commands mirroring `commands/file_lock.rs` patterns**

Map `ServiceError::NeedsLargeConfirm` → `NEEDS_LARGE_CONFIRM:<bytes>` string.

- [ ] **Step 2: Register in `generate_handler!`**

- [ ] **Step 3: Startup**

```rust
let _ = wipe_media_vault_orphans_on_startup();
```

- [ ] **Step 4: Manual smoke**

`cargo build --manifest-path src-tauri/Cargo.toml` — Expected: success

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(media-vault): Tauri commands and startup orphan wipe"
```

---

### Task 7: Frontend API

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Types: `MediaItem`, `MediaVaultSettings`, `MediaVaultActivity`, `MediaImportBatchResult`
- Methods: `mediaVaultList`, `mediaVaultImport`, `mediaVaultImportBatch`, `mediaVaultView`, `mediaVaultRelock`, `mediaVaultDelete`, `mediaVaultExport`, `mediaVaultThumb`, `mediaVaultSettingsGet`, `mediaVaultSettingsSet`, etc.

- [ ] **Step 1: Add types + invoke wrappers**

- [ ] **Step 2: `npm run build`**

Expected: PASS (TypeScript compiles)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(media-vault): frontend API bindings"
```

---

### Task 8: MediaVaultView UI

**Files:**
- Create: `src/components/MediaVaultView.tsx`
- Modify: `src/components/Sidebar.tsx` (add `media-vault` entry with icon e.g. `Images` from lucide)
- Modify: `src/app/page.tsx` (route case + auto-lock timer pattern from FileLockView)

**Interfaces:**
- Consumes: `api.mediaVault*` from Task 7
- Props: mirror `FileLockView` — `vaultLocked`, `onAutoLock`, settings

- [ ] **Step 1: Gallery grid**

When `vaultLocked`: show blurred placeholders (CSS blur on generic icon). When unlocked: fetch thumbs via `mediaVaultThumb` (object URLs from base64).

- [ ] **Step 2: Import flow**

File picker + drag-drop; confirm delete-original; handle `NEEDS_LARGE_CONFIRM` dialog.

- [ ] **Step 3: View / delete / export**

View → invoke + show auto-lock banner. Delete → confirm. Export → `promptMasterPassword` + save path dialog (`@tauri-apps/plugin-dialog` or existing pattern).

- [ ] **Step 4: Settings + activity panel**

Auto-lock minutes (1–240).

- [ ] **Step 5: `npm run build`**

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(media-vault): gallery UI and sidebar entry"
```

---

### Task 9: Security pass + docs

**Files:**
- Modify: `CHANGELOG.md` (unreleased or next version section)
- Modify: `docs/superpowers/specs/2026-08-20-media-vault-windows-design.md` (`Status: Implemented`)

- [ ] **Step 1: Verify invariants**

Symlink reject, crash-recover gated, export password check, no plaintext thumbs on disk, staging wipe on relock.

- [ ] **Step 2: Run test suite**

```bash
npm test -- --passWithNoTests
cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=1
```

- [ ] **Step 3: Update CHANGELOG + spec status**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: Media Vault v1 changelog and spec status"
```

---

### Task 10 (optional): Explorer “Add to Media Vault”

**Files:**
- Modify: `src-tauri/windows/shell/Register-FolderLockShell.ps1` or new `Register-MediaVaultShell.ps1`
- Modify: `src-tauri/src/lib.rs` (parse `--add-media <path>` argv like file lock)

Defer unless time remains after Task 9.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| MIME allowlist | 1 |
| Import + delete original | 4 |
| Encrypted payload + thumb | 4, 5 |
| Gallery blur when locked | 8 |
| Staging view + auto-lock | 5, 6, 8 |
| Crash orphan wipe | 5, 6 |
| Export password step-up | 5, 6 |
| Activity / favorites / search | 2, 6, 8 |
| 256 MB warn / 2 GB cap | 1, 4 |
| Security invariants | 9 |

## Self-review

- No TBD placeholders in task steps
- AAD prefix `media\0` consistent across Tasks 4–5
- Staging path names match spec
- Explorer verb explicitly optional Task 10
