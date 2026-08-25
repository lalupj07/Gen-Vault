# GenVault Phase 1 — Standout Privacy (Windows) — Design

**Date:** 2026-08-25  
**Status:** Implemented (Windows v1) — implementation plan: `docs/superpowers/plans/2026-08-25-phase1-standout-privacy.md`  
**Product:** GenVault (GenXis Innovations)  
**Platform:** Windows desktop (Tauri 2) v1; Android follow-ups deferred  
**Related:** Ships after Media Vault (v2.1.0). Complements lock suite; does not replace Folder/File/Media Lock.

## Goal

Ship four privacy features that make GenVault feel like a **local security enclave**, not another authenticator:

1. **Panic lock** — one action locks everything and clears secrets from memory/clipboard.  
2. **Travel mode** — temporary lockdown for airports / shared spaces.  
3. **Guest unlock** — time-boxed access to **one** locked item without the master password.  
4. **Duress vault** — a second password opens a **decoy** vault; the real vault stays hidden.

**Success criteria**

1. Panic lock works from UI button + global hotkey (Windows) while vault is unlocked.  
2. Travel mode hides sensitive UI, blocks export/import/erase, shortens auto-lock; survives restart until disabled with master password.  
3. Guest unlock can open exactly one Folder Lock, File Lock, or Media Vault item for ≤ N minutes with a separate passphrase.  
4. Duress password unlocks a separate decoy vault; no UI indicator that a real vault exists.  
5. No cloud; no new network calls.  
6. Reuses Argon2id / AES-256-GCM / zeroize / unlock gates.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Scope | All four features in one design; implement as sequenced tasks |
| Panic hotkey default | `Ctrl+Shift+L` (configurable later) |
| Travel persistence | Flag in `auth.json` / settings encrypted blob; require master password to disable |
| Guest scope | One item id + kind (`folder` \| `file` \| `media`); default TTL **15 min**; max **60** |
| Guest crypto | Separate Argon2id-wrapped DEK for that item only (not master VMK) |
| Duress | Second wrapped VMK path `duress_key.enc`; opens `duress_vault.enc` + empty-ish decoy SQLite |
| Duress UX | Identical unlock UI; no “wrong vault” hint — timing should match real unlock |
| Drivers | Forbidden |
| Android | Panic tile / Travel deferred |

## Non-goals (v1)

- Remote wipe / SMS panic  
- Multi-guest concurrent sessions  
- Duress that wipes real vault (too destructive; optional later with explicit enroll)  
- Kernel keylogging protection  
- Guest unlock of entire vault  

---

## 1. Panic lock

### Behavior

On trigger:

1. Call existing `lock_vault()` (zeroize session VMK).  
2. Relock **all** Folder Lock / File Lock / Media Vault staging (`relock_all` / orphan wipe).  
3. `clearSecureClipboard()` on frontend.  
4. Navigate UI to unlock screen.  
5. Optional: minimize / hide main window (setting, default off).

### Surfaces

- Sidebar / header button “Panic lock”  
- Global hotkey via Tauri (Windows) when app running  
- Existing auto-lock remains independent

### Commands

- `panic_lock()` — Rust: lock session + wipe all staging modules; no password required (availability / safety feature while unlocked)

### Security notes

- Panic must **not** require password (defeats the point under duress).  
- Panic while already locked is a no-op success.  
- Do not log that panic was used in plaintext activity with sensitive context.

---

## 2. Travel mode

### Behavior

When **enabled** (requires vault unlocked + confirm):

| Control | Effect |
|---------|--------|
| Entry list | Hide favorites marked `sensitive` OR hide all notes/attachments reveal; v1: **hide entries tagged `travel-hide`** + disable “Export secrets / USB backup / erase vault” |
| Auto-lock | Force max **2 minutes** (override settings) |
| Screenshots | Best-effort: set window content protection on Windows (`SetWindowDisplayAffinity` WDA_EXCLUDEFROMCAPTURE) when travel on |
| Deep links | Still require unlock; lock ops allowed only after unlock |

Disable requires **master password** re-entry.

### Persistence

`travel_mode: bool` in settings encrypted with vault (or DPAPI-protected settings file gated by unlock to read). On cold start before unlock: show unlock only; after unlock, apply travel restrictions if flag set.

### Commands

- `set_travel_mode(enabled: bool, password?: string)` — enable needs unlock session; disable needs password  
- `get_travel_mode() -> bool` — only when unlocked

---

## 3. Guest unlock

### Model

Owner (vault unlocked) enrolls a **guest grant**:

```
GuestGrant {
  id, kind: folder|file|media, item_id,
  expires_at, wrapped_item_dek,  // Argon2id(passphrase) wraps item DEK copy
  label
}
```

Stored under `guest_grants.enc` (AES-GCM with vault key while enrolled; grants list only readable when vault unlocked).

### Flows

**Enroll (owner):** pick item → set passphrase (12+) → TTL → wraps a copy of that item’s DEK.

**Guest use (vault may be locked):** UI “Guest access” on unlock screen → enter grant id/label + passphrase → unwrap item DEK only → decrypt that item to staging → timer → wipe. **Does not** set session VMK / does not list other vault entries.

**Revoke:** owner deletes grant while unlocked.

### Commands

- `guest_grant_create`, `guest_grant_list`, `guest_grant_revoke` (require `get_key()`)  
- `guest_unlock(grant_id, passphrase)` → staging path (no full vault session)

### Security

- Rate-limit `guest_unlock` like unlock.  
- Guest cannot export vault or enroll Hello.  
- Staging uses existing wipe/orphan paths.

---

## 4. Duress vault

### Model

On enroll (settings, step-up master password):

1. User sets **duress password** (must differ from master).  
2. Generate separate 32-byte duress VMK; wrap with Argon2id(duress password).  
3. Create `duress_vault.enc` with a few harmless decoy TOTP/password entries (templates).  
4. Store marker in auth meta: `duress_enrolled: true` (boolean only — no path leakage beyond expected files).

### Unlock

`unlock_with_password`:

1. Try real password wrap → real vault (current behavior).  
2. Else try duress wrap → load duress vault into session; set `session_is_duress = true` (in-memory only).  
3. Else failure + rate limit.

UI must look identical. In duress session:

- All mutations write only to duress store.  
- Folder/File/Media Lock commands **refuse** or operate on empty decoy registries (v1: **refuse** with generic “Not available”).  
- No indicator in UI.

### Remove duress

Requires real master password; deletes duress key + decoy vault files.

### Security

- Constant-time-ish: always run both KDF attempts on failure path? Prefer: try real first; on failure try duress (slight timing difference accepted in v1; document).  
- Never log `session_is_duress`.  
- Export / erase in duress session only affects decoy data.

---

## Architecture (shared)

```
React — Panic button / Travel toggle / Guest panel / Duress enroll
        │
        ▼
Tauri commands
        ├── panic_lock
        ├── travel_mode_*
        ├── guest_grant_* / guest_unlock
        └── unlock_with_password (duress branch)
                │
                ▼
store + folder_lock / file_lock / media_vault services
```

## Implementation order

1. Panic lock (smallest, high value)  
2. Travel mode  
3. Guest unlock  
4. Duress vault (most sensitive — security review required)

## Testing

- Panic: staging present → panic → staging gone + vault locked.  
- Travel: export blocked; auto-lock ≤ 2 min; disable needs password.  
- Guest: unlock one file only; expiry wipes; wrong passphrase rate-limited.  
- Duress: real password → real data; duress → decoy only; lock ops refused.

## Open follow-ups

- Wipe-on-duress (optional nuclear enroll)  
- Android panic tile  
- Configurable panic hotkey UI  
- Indistinguishable dual-KDF timing  

## Acceptance for this design

Approve this spec before writing the implementation plan. Confirm especially:

1. Guest TTL default **15** / max **60** — OK?  
2. Duress v1 **refuses** Folder/File/Media Lock — OK vs empty decoy registries?  
3. Panic hotkey **Ctrl+Shift+L** — OK?
