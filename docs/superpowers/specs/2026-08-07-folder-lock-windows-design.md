# GenVault Folder Lock (Windows) — Design

**Date:** 2026-08-07  
**Status:** Approved — implementation in progress  
**Product:** GenVault (GenXis Innovations)  
**Platform:** Windows desktop (Tauri 2) only for v1  
**Related:** First module in the multi-module “lock suite” roadmap; does **not** implement File Lock, Media Vault, USB Vault, or File Shredder.

## Goal

Let users protect **local NTFS folders** with GenVault: encrypt contents under the existing vault key hierarchy, register folders in a Folder Lock module, lock from **Explorer context menu** or in-app, unlock temporarily into a **private staging directory**, authenticate with **master password or Windows Hello**, and **auto-lock** by wiping staging.

**Success criteria**

1. User can lock a non-system local NTFS folder from Explorer (“Lock with GenVault”) or from the Folder Lock UI.  
2. Ciphertext lives under GenVault-controlled storage; original path shows a clear “locked by GenVault” stub — not silent data loss.  
3. Unlock requires vault auth; Explorer opens **staging**, not the original path.  
4. Auto-lock or manual lock wipes staging; ciphertext remains.  
5. Crash recovery wipes orphan staging on next launch.  
6. No kernel drivers, no unsupported filesystem filter hooks.  
7. Reuses Argon2id + AES-256-GCM + zeroize patterns from the existing vault.  
8. Activity log, favorites, recent, and search work for registered folders.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Module | Folder Lock first (other modules deferred) |
| Protection model | Encrypt contents on disk (not ACL/hide-only) |
| Scope v1 | Local fixed NTFS folders only (no USB volumes) |
| Explorer menu | Required in v1 |
| Unlock presentation | Decrypt to private GenVault staging; open Explorer there |
| Drivers | Forbidden |
| Stack | Extend Tauri 2 + React + Rust (not a .NET rewrite); Clean Architecture / repository / DI mapped onto Rust services + React view-models |
| Authenticator | Unchanged; keep existing vault |

## Non-goals (v1)

- Android / web-demo Folder Lock  
- USB / removable volume protection (future USB Vault)  
- In-place unlock restoring plaintext to the original path  
- Kernel minifilters, undocumented hooks  
- File Lock batch, Media Vault, Secure Notes rewrite, File Shredder  
- Full multi-module Home dashboard (sidebar entry for Folder Lock is enough; dashboard tile optional follow-up)

## Architecture

```
Explorer IExplorerCommand / sparse package
        │ genvault://folder-lock?action=lock|unlock&path=...
        ▼
React — Folder Lock module (list, search, favorites, activity, settings)
        │ Tauri invoke
        ▼
Rust FolderLockService (application layer)
        ├── Domain: LockedFolder, LockStatus, ActivityEvent, PathPolicy
        ├── Repository: SQLite metadata (paths/key-wrap encrypted at rest with vault)
        └── Crypto/IO adapter
                ├── Ciphertext: %LOCALAPPDATA%\GenVault\folder-lock\<id>\
                └── Staging:    %LOCALAPPDATA%\GenVault\folder-lock-staging\<id>\
```

Existing vault unlock (master password / Windows Hello) gates all Folder Lock operations. Folder DEKs are wrapped with vault key material — never stored in plaintext.

## Workflows

### Lock

1. Receive path from context menu or folder picker.  
2. Require GenVault unlocked (prompt password / Hello if locked).  
3. **PathPolicy:** reject non-NTFS, removable volumes, system paths (`\Windows`, `\Program Files`, profile root, GenVault app/data dirs), already-locked paths, missing write permission.  
4. Warn when total size exceeds configurable threshold (default **2 GB**); allow continue with confirm in v1.  
5. Create `LockedFolder` row; generate 32-byte folder DEK; wrap with vault key (AES-GCM).  
6. Walk tree; for each file encrypt to ciphertext store with unique nonce; AAD = `folder_id || relative_path`; zeroize plaintext buffers.  
7. Verify ciphertext set; remove originals from source folder; write stub at original path (README + `.genvault-locked` marker referencing id).  
8. Emit activity `locked`. On mid-failure: `lock_failed` state — do not delete remaining originals until retry/rollback.

### Unlock (temporary)

1. Authenticate (password or Hello).  
2. Unwrap DEK; decrypt into empty staging directory (recreate tree).  
3. Open Explorer on staging path.  
4. Start auto-lock timer (default **15 minutes**, user-configurable).  
5. Manual lock or timeout: best-effort close, **wipe staging** (overwrite then delete), clear session, emit `locked` / `auto_locked`.

### Crash recovery

On app start (Windows): if staging directories exist without an active unlock session → wipe them; leave ciphertext intact.

### Remove from GenVault

Requires auth + explicit confirm. Options: (1) decrypt to **original path** and delete ciphertext + stub, or (2) destroy ciphertext only (data loss warning). v1 must implement at least (1).

## Explorer integration

- Ship with Windows installer (MSI/MSIX): register sparse package / `IExplorerCommand` for directories.  
- Commands: **Lock with GenVault**; **Open in GenVault Folder Lock** (for stubs / unlock flow).  
- Activation via custom protocol `genvault://folder-lock?...` bringing the main window forward.  
- No admin elevation required for user-owned folders.  
- Uninstall must unregister the shell package cleanly.

## UI (Folder Lock module)

- Registered folder list: display name, original path, size, status, last activity.  
- Favorites, Recent, Search.  
- Actions: Lock (picker), Unlock, Lock now, Remove.  
- Activity Log for module events.  
- Settings: auto-lock minutes, size warning threshold.  
- Desktop sidebar navigation entry “Folder Lock”.

## Cryptography

| Item | Spec |
|------|------|
| KDF | Existing vault Argon2id (no parallel weak KDF) |
| Folder DEK | 32 random bytes, wrapped AES-256-GCM under vault key |
| File encryption | AES-256-GCM, random 96-bit nonce per file |
| AAD | folder id + relative path (UTF-8) |
| Memory | `zeroize` DEK and file buffers after use |
| DB | Encrypted SQLite metadata consistent with vault store practices |
| Staging | Plaintext only while unlocked; wiped on lock |

Tamper: GCM failure aborts that file and fails the unlock with a clear error. Optional whole-tree hash is a later hardening, not required for v1.

## Error handling

User-visible, non-secret messages for: access denied, file in use, not NTFS, removable drive, system path, disk full, auth failed, ciphertext tamper, incomplete lock (`lock_failed` + retry). Never log plaintext file contents or DEKs.

## Testing

| Layer | Coverage |
|-------|----------|
| Unit | PathPolicy, DEK wrap/unwrap, single-file round-trip, staging wipe helper |
| Integration | Lock small fixture tree → unlock staging → auto-lock removes staging |
| Manual | Explorer menu lock, Hello unlock, timeout auto-lock, crash-with-staging wipe |

## Security notes

- Staging path is under user AppData; threat model is casual access / lost device with locked vault, not a malicious admin with live unlocked session.  
- Unlocked staging is readable by the same Windows user — disclose in UI (“files are decrypted to a private GenVault folder while unlocked”).  
- Do not claim driver-level or kernel protection.

## Roadmap after v1

1. File Lock (single/batch files, DnD)  
2. File Shredder  
3. Secure Notes markdown polish  
4. Media Vault  
5. USB Vault (volume-oriented; hardest under no-driver constraint)  
6. Multi-module Home dashboard  

## Open implementation notes (plan time)

- Exact stub format and whether to use a directory junction vs README-only stub.  
- MSI vs MSIX shell registration packaging details.  
- Progress UI for long locks (cancelability).  
- Concurrent unlock of multiple folders (v1 may allow one active staging session).  
