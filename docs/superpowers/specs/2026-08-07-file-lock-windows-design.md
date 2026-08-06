# GenVault File Lock (Windows) — Design

**Date:** 2026-08-07  
**Status:** Implemented (Windows v1)  
**Product:** GenVault (GenXis Innovations)  
**Platform:** Windows desktop (Tauri 2) only for v1  
**Related:** Second module in the lock suite after Folder Lock (`2026-08-07-folder-lock-windows-design.md`). Does **not** implement Media Vault, USB Vault, or File Shredder.

## Goal

Let users protect **individual local NTFS files** with GenVault: encrypt under the existing vault key hierarchy, register files in a File Lock module, lock from **Explorer** or in-app, unlock temporarily into a **private staging directory**, and **auto-lock** by wiping staging.

**Success criteria**

1. User can lock one or many non-system local NTFS files from Explorer or the File Lock UI.  
2. Ciphertext lives under GenVault-controlled storage; original path shows a clear GenVault stub — not silent data loss.  
3. Unlock requires vault auth; plaintext appears only in staging (not in-place).  
4. Auto-lock or manual lock wipes staging; ciphertext remains.  
5. Crash recovery wipes orphan file-lock staging on next launch.  
6. No kernel drivers.  
7. Reuses Argon2id vault unlock + AES-256-GCM + zeroize patterns (including Folder Lock AAD helpers and read-only clearing).  
8. Activity log, favorites, search work for registered files.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Module | File Lock (single deep feature; not a multi-feature roadmap sprint) |
| Protection | Encrypt on disk (not ACL/hide-only) |
| Scope v1 | Local fixed NTFS **files** only |
| Explorer menu | Required — “Lock with GenVault” on files |
| Unlock | Decrypt to private staging under GenVault data dir |
| Staging vs Folder Lock | **Separate** staging root and unlock sessions (file unlock does not block folder unlock) |
| Batch lock | Continue on per-file failure; return success + failed summary |
| Stub at original path | Replace original file with a stub **of the same path/name** (marker content + human-readable pointer) |
| Large file warn | Confirm when any file **> 512 MB** |
| Auto-lock default | 15 minutes (`file_lock_settings.json`) |
| Drivers | Forbidden |
| Stack | Extend Tauri 2 + React + Rust; mirror `folder_lock` module shape |

## Non-goals (v1)

- Android / web-demo File Lock  
- In-place unlock at the original path  
- Locking directories (use Folder Lock)  
- Removable / network volumes  
- Media Vault, USB Vault, File Shredder  
- Shared single-unlock mutex with Folder Lock  

## Architecture

```
Explorer (file context menu) / File Lock UI
        │ genvault://file-lock?action=lock|unlock&path=...&id=...
        ▼
React — FileLockView (+ sidebar entry)
        │ Tauri invoke
        ▼
Rust file_lock module
        ├── policy::validate_lock_file
        ├── crypto — reuse folder_lock / crypto AAD + DEK wrap
        ├── store — file_lock.db (rows + activity)
        └── service — lock / batch_lock / unlock / relock / restore / crash_recover
                ├── Ciphertext: %LOCALAPPDATA%\GenVault\file-lock\<id>\payload.gvf
                └── Staging:    %LOCALAPPDATA%\GenVault\file-lock-staging\<id>\<original_filename>
```

Vault unlock (`get_key()`) gates all mutating commands.

**AAD:** `format!("{file_id}\0{original_path}")` UTF-8 (path normalized consistently at lock and unlock).

## Workflows

### Lock (single)

1. Receive path (UI or `genvault://file-lock?action=lock&path=...`).  
2. Require vault unlocked.  
3. `validate_lock_file`: must be a file; apply same volume/system/GenVault-data/profile-root rules as Folder Lock; reject directories.  
4. If size > 512 MB and not confirmed → `NEEDS_LARGE_CONFIRM:<bytes>`.  
5. Create id; generate 32-byte DEK; wrap with vault key.  
6. `prepare_writable` (clear read-only via Win32); read plaintext; encrypt to `payload.gvf`; wipe original; write stub at same path.  
7. Insert metadata + activity `locked`. On mid-failure after ciphertext but before successful wipe: delete ciphertext; leave original; return error.

### Lock (batch)

- Input: `paths: string[]`.  
- Process each independently.  
- Response: `{ locked: LockedFilePublic[], failed: [{ path, error }] }`.  
- Do not roll back successful locks when a later path fails.

### Unlock

1. Unwrap DEK; decrypt to staging path preserving original filename.  
2. Open Explorer on the staging directory (optionally select the file).  
3. Start UI auto-lock timer from `file_lock_settings.json` (default 15).  
4. Multiple files may be unlocked concurrently in File Lock v1 (no single-session cap within File Lock). Folder Lock sessions remain independent.

### Relock / crash recovery

- Relock: wipe staging tree (read-only-aware); set status `locked`.  
- On Windows app start: wipe orphan children under `file-lock-staging/`; mark any DB rows stuck `unlocked` back to `locked`.

### Restore

Decrypt to original path (clear stub first), remove ciphertext + DB row, activity `restore`.

## Explorer & deep links

- Register file shell verb (HKCU) alongside Folder Lock scripts under `src-tauri/windows/shell/`.  
- Protocol: `genvault://file-lock?action=lock&path=<urlencoded>` and `action=unlock&id=<id>`.  
- Multi-select: Explorer may invoke once per file or pass multiple paths; handler must accept repeated `path` query params.

## UI

- Sidebar: **File Lock** (`file-lock`).  
- `FileLockView`: batch/path lock, list, search, favorites, Unlock / Lock now / Restore, activity, auto-lock setting, staging disclosure.  
- Deep-link prefill via pending take + `file-lock-deep-link` event (mirror Folder Lock).

## Error handling

- Map `PermissionDenied` and Windows OS error **5** to a clear Access denied message; clear read-only on files **and** parent dirs before wipe/write.  
- Never log DEKs or file plaintext.  
- Generic client errors; no stack traces to UI.

## Testing

- Policy: reject directories, missing paths, GenVault data dir, system paths.  
- Crypto: AAD round-trip; wrong path/id fails.  
- Service: read-only file lock; lock → unlock → relock → restore.  
- Batch: one bad path + one good path → partial success.  
- Manual: Explorer multi-select; large-file confirm; crash with staging present.

## Security invariants

- No drivers / minifilters.  
- Local fixed NTFS only.  
- Staging wiped on relock, auto-lock, and crash recovery.  
- DEKs only in memory while unlocked; wrapped at rest with vault key.

## Open follow-ups (explicitly deferred)

- In-place unlock option  
- Shared unlock session policy with Folder Lock  
- Android File Lock  
- Secure delete / shredder after restore decline  
