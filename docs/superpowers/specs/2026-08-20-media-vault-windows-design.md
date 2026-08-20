# GenVault Media Vault (Windows) — Design

**Date:** 2026-08-20  
**Status:** Implemented (Windows v1)  
**Product:** GenVault (GenXis Innovations)  
**Platform:** Windows desktop (Tauri 2) only for v1  
**Related:** Third module in the lock suite after Folder Lock and File Lock. Does **not** implement USB Vault or File Shredder.

## Goal

Give users a **private encrypted gallery** inside GenVault for photos, videos, and sensitive documents (e.g. ID scans, bank PDFs) — stored only under GenVault-controlled ciphertext, browsable in-app with **blur until unlock**, viewable temporarily via staging, never synced to cloud by default.

**Success criteria**

1. User can import one or many local media files into Media Vault from the UI (drag-drop + file picker).  
2. Ciphertext lives under `%LOCALAPPDATA%\GenVault\media-vault\<id>\`; originals are **removed from import path only after successful encrypt** (user chooses delete-after-import vs keep-original in v1: default **delete after confirm**).  
3. Gallery shows blurred thumbnails / generic icons until vault is unlocked; full preview requires unlock + optional step-up for export.  
4. View/decrypt opens file in **private staging**; auto-lock wipes staging like File Lock.  
5. Crash recovery wipes orphan media staging on next launch.  
6. No kernel drivers.  
7. Reuses vault key, AES-256-GCM, AAD patterns, symlink/reparse rejection, and read-only clearing from Folder/File Lock.  
8. Activity log, favorites, search (by title/tags), and optional album grouping work for registered items.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Module | Media Vault (single deep feature; not USB/Shredder in same sprint) |
| Model | **Import into vault** (not in-place lock at original path — unlike File Lock) |
| Scope v1 | Local fixed NTFS **files** only; MIME allowlist below |
| Explorer | **Optional v1** — “Add to GenVault Media” context menu on images/PDF only (follow-up if timeboxed) |
| Unlock / view | Decrypt to `media-vault-staging\<id>\<filename>`; open with OS default app from staging |
| Staging | **Separate** root from folder-lock-staging and file-lock-staging |
| Thumbnails | Encrypted thumbnail blob per item (max edge 256px, JPEG quality ~75); generated at import |
| Large file warn | Confirm when any file **> 256 MB** (video); hard reject **> 2 GB** in v1 |
| Auto-lock default | 15 minutes (`media_vault_settings.json`) |
| Delete original | Confirm dialog; default recommendation “Move into vault (remove original)” |
| Drivers | Forbidden |
| Stack | Mirror `file_lock` module shape: `media_vault/{policy,crypto,store,service}.rs` + commands + `MediaVaultView.tsx` |

## MIME / extension allowlist (v1)

| Category | Extensions / types |
|----------|-------------------|
| Images | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.heic` (best-effort; reject if decode fails) |
| Video | `.mp4`, `.webm`, `.mov` (metadata only in gallery; open via staging) |
| Documents | `.pdf` only in v1 (no `.docx` — macro/ole risk) |

Reject all executables, archives (`.zip`), and unknown extensions at policy layer.

## Non-goals (v1)

- Android Media Vault  
- In-app video player (use OS default from staging)  
- Cloud sync, sharing links, or multi-device gallery  
- USB Vault, File Shredder, in-place File Lock for photos  
- OCR, face detection, or AI tagging  
- Editing media in-place (view/export only)  
- Nested albums beyond flat “album” tag string on each row  

## Architecture

```
Import UI (drag-drop / picker) / optional Explorer verb
        │ Tauri invoke
        ▼
React — MediaVaultView (+ sidebar entry)
        │ grid/list, blur when locked, albums filter, activity
        ▼
Rust media_vault module
        ├── policy::validate_import_file (allowlist, size, volume, symlinks)
        ├── crypto — reuse folder_lock AAD + DEK wrap; separate AAD prefix `media\0`
        ├── store — media_vault.db (rows + activity + encrypted thumb)
        └── service — import / view / relock / delete / crash_recover
                ├── Ciphertext: %LOCALAPPDATA%\GenVault\media-vault\<id>\payload.gvm
                ├── Thumbnail:  %LOCALAPPDATA%\GenVault\media-vault\<id>\thumb.gvt (encrypted)
                └── Staging:    %LOCALAPPDATA%\GenVault\media-vault-staging\<id>\<filename>
```

Vault unlock (`get_key()`) gates all mutating commands. View/decrypt requires unlock; thumbnail decrypt for grid requires unlock (no persistent clear-text thumbs on disk).

**AAD:** `format!("media\0{id}\0{original_filename}")` UTF-8 (filename basename only, normalized).

## Data model (SQLite)

`media_items` row (public DTO omits paths to ciphertext):

| Field | Notes |
|-------|--------|
| `id` | UUID v4 |
| `title` | User-editable; default from filename |
| `album` | Optional string tag |
| `mime` | Detected at import |
| `size_bytes` | Original size |
| `imported_at` | Unix ts |
| `favorite` | bool |
| `status` | `stored` \| `viewing` (staging open) |
| `wrapped_dek` | AES-GCM blob |
| `original_name` | Basename only (for staging filename) |

Activity events mirror Folder/File Lock (`imported`, `viewed`, `relocked`, `deleted`, `import_failed`).

## Workflows

### Import (single or batch)

1. Require vault unlocked.  
2. `validate_import_file`: allowlist, not system path, not GenVault data dir, fixed NTFS, no symlinks/reparse points, size ≤ 2 GB.  
3. If size > 256 MB → `NEEDS_LARGE_CONFIRM:<bytes>`.  
4. Generate id + DEK; read file; encrypt payload to `payload.gvm`; generate encrypted thumbnail (images only; PDF/video use static icon in UI).  
5. Insert DB row + activity `imported`.  
6. If user confirmed delete-original: secure-wipe source file (one pass + read-only clear); else leave original.  
7. On failure after ciphertext written: delete partial blobs; do not remove original.

### View

1. Require vault unlocked.  
2. Decrypt to staging; set status `viewing`; start auto-lock timer.  
3. `ShellExecute` / `open` staging file with default app (same pattern as File Lock Explorer open).  
4. UI shows “Viewing — auto-lock in N min” banner.

### Relock / crash recovery

- Relock: wipe staging tree; status → `stored`.  
- Startup: `wipe_media_vault_orphans_on_startup()` (ungated, like folder/file); IPC `media_vault_crash_recover` requires unlock.

### Delete from vault

Confirm dialog → wipe ciphertext + thumb + staging; remove DB row; activity `deleted`. No restore-to-disk in v1 (export first if needed).

### Export (step-up)

Require master password re-entry (reuse `reveal_entry_secret` pattern) → decrypt to user-chosen path via save dialog; activity `exported`. Rate-limit exports.

## UI

- Sidebar: **Media Vault** (`media-vault`).  
- **Locked vault:** grid shows blurred placeholders + lock icon overlay (no thumb decrypt).  
- **Unlocked:** decrypt thumbs in memory only; tap/click → view workflow.  
- Toolbar: Import, Album filter, Favorites, Search, Settings (auto-lock mins).  
- Empty state: “Import photos, videos, or PDFs — stored encrypted on this device only.”  
- Mobile layout deferred.

## Security invariants

- No plaintext media under GenVault data dir except transient staging while `viewing`.  
- Thumbnails encrypted at rest; decrypt only while vault unlocked and view mounted.  
- Reject symlinks/junctions on import path (same as File Lock policy).  
- Never log file bytes, DEKs, or master password.  
- Export and delete require explicit confirm; export adds password step-up.  
- `GENVAULT_DATA_DIR` ignored in release builds (existing store rule).

## Error handling

- Map OS error 5 / permission denied to clear “Access denied” message.  
- Generic client errors; no internal paths in UI strings.  
- Import batch: partial success `{ imported: [], failed: [{ path, error }] }`.

## Testing

- Policy: reject `.exe`, `.zip`, oversize, symlink source, system paths.  
- Crypto: AAD round-trip; wrong id fails decrypt.  
- Service: import → view → relock → delete; crash with staging → startup wipe.  
- UI smoke: locked grid blur; unlocked thumb load; large-file confirm.  
- Manual: import PDF + JPG; export with password; auto-lock wipes staging.

## Implementation order (for planning skill)

1. Rust `media_vault` module + SQLite store + policy  
2. Tauri commands + register in `lib.rs`  
3. `MediaVaultView.tsx` + sidebar + api.ts  
4. Thumbnail generation (images — `image` crate or existing pipeline)  
5. Startup orphan wipe + settings JSON  
6. Optional Explorer verb (images/PDF only)  
7. Security pass on import/export paths before release  

## Open follow-ups (explicitly deferred)

- Android Media Vault (SAF import)  
- In-app PDF/image viewer (no external app)  
- USB Vault  
- File Shredder integration after delete/export  
- Guest unlock scoped to one album  
- Explorer “Add to Media Vault” if not in v1 timebox  

## Lock suite roadmap (reference)

| Order | Module | Status |
|-------|--------|--------|
| 1 | Folder Lock | Shipped v2.0 |
| 2 | File Lock | Shipped v2.0 |
| 3 | **Media Vault** | Shipped v2.1 (Windows) |
| 4 | File Shredder | Deferred |
| 5 | USB Vault | Deferred (hardest) |
