# Phase 1 Standout Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Panic lock, Travel mode, Guest unlock, and Duress vault on Windows GenVault so the app behaves like a local security enclave.

**Architecture:** Rust commands + small modules (`guest`, duress paths in `store`/`auth`) reuse existing session VMK, lock-suite staging wipe, Argon2id wraps, and rate limits. React wires Panic button/hotkey, Travel toggle, Guest panel on unlock, and Duress enroll in Settings — with zero UI hint when a duress session is active.

**Tech Stack:** Tauri 2, Rust (`aes-gcm`, `argon2`, `zeroize`, `rusqlite`), React/TypeScript; Windows `SetWindowDisplayAffinity` for travel capture shield; global hotkey via `tauri-plugin-global-shortcut` (or Win32 RegisterHotKey if plugin friction).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-25-phase1-standout-privacy-design.md` (Approved)
- Guest TTL default **15** minutes, max **60**
- Duress session **refuses** Folder/File/Media Lock (generic error)
- Panic hotkey default **Ctrl+Shift+L**
- Panic must **not** require password
- Disable Travel requires master password
- No cloud / new network calls
- Never log `session_is_duress`, DEKs, or passwords
- Windows desktop first; Android deferred
- Do not break existing unlock / Media Vault / Folder / File Lock

## File map

| File | Responsibility |
|------|----------------|
| `src-tauri/src/commands/privacy.rs` | `panic_lock`, travel, guest, duress enroll/remove commands |
| `src-tauri/src/guest.rs` | Guest grant store + enroll/unlock/revoke |
| `src-tauri/src/store.rs` | Duress key/vault paths; travel flag persistence |
| `src-tauri/src/commands/auth.rs` | Branch `unlock_with_password` for duress; session duress flag |
| `src-tauri/src/commands/mod.rs` | Session helpers: `is_duress_session`, refuse lock suite when duress |
| `src-tauri/src/lib.rs` | Register commands + optional global shortcut |
| `src/lib/api.ts` | Frontend bindings |
| `src/lib/auth.tsx` | Panic + travel state; guest unlock entry |
| `src/components/UnlockScreen.tsx` | Guest access UI |
| `src/components/SecondaryViews.tsx` / Settings | Travel + Duress enroll |
| `src/components/Sidebar.tsx` / `page.tsx` | Panic button; travel UI gates |
| `src/lib/secure-clipboard.ts` | Cleared on panic (already exists) |

---

### Task 1: Panic lock (Rust + API + UI)

**Files:**
- Create: `src-tauri/src/commands/privacy.rs` (or add `panic_lock` to `commands/mod.rs` if smaller)
- Modify: `src-tauri/src/lib.rs`, `src/lib/api.ts`, `src/lib/auth.tsx`, `src/components/Sidebar.tsx` and/or `page.tsx`

**Interfaces:**
- Produces: `panic_lock() -> Result<(), String>`
  - Calls `lock_vault()` (zeroize session)
  - Best-effort: folder/file/media `wipe_orphan_staging` / relock-all viewing
  - Idempotent if already locked

- [ ] **Step 1: Implement `panic_lock` in Rust**

Wipe staging via existing `wipe_*_orphans_on_startup` or service `relock_all_viewing` + orphan wipe for folder/file/media. Then `lock_vault()`.

- [ ] **Step 2: Register command + `api.panicLock()`**

- [ ] **Step 3: UI — Panic button**

Calls `api.panicLock()` + `clearSecureClipboard()` + set `vaultLocked` / navigate unlock.

- [ ] **Step 4: Global hotkey Ctrl+Shift+L**

Prefer `tauri-plugin-global-shortcut` on Windows desktop only. On fire → emit event to frontend or call `panic_lock` in Rust then emit `panic-locked`.

- [ ] **Step 5: Test manually + unit if feasible**

Lock a file → unlock staging → panic → staging gone, vault locked.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(privacy): panic lock with staging wipe and hotkey"
```

---

### Task 2: Travel mode

**Files:**
- Modify: `src-tauri/src/store.rs` or vault settings — persist `travel_mode: bool`
- Modify: `src-tauri/src/commands/privacy.rs` — `get_travel_mode`, `set_travel_mode`
- Modify: `src/lib/api.ts`, Settings UI, `page.tsx` / Authenticator list filtering
- Windows: set `WDA_EXCLUDEFROMCAPTURE` when travel on (optional helper in `privacy.rs` / `hello`-style Win32)

**Interfaces:**
- `set_travel_mode(enabled: bool, password: Option<String>) -> Result<(), String>`
  - Enable: requires `get_key()`, no password
  - Disable: requires password via `unlock_with_secret("password", …)` verify (do not change session key)
- `get_travel_mode() -> Result<bool, String>` — requires unlock
- When travel on: force auto-lock ≤ 2 minutes in frontend settings override

- [ ] **Step 1: Persist travel flag** (vault settings field or `travel_mode.json` protected)

- [ ] **Step 2: Commands + password gate on disable**

- [ ] **Step 3: Frontend**

Settings toggle; filter entries with tag `travel-hide` (or category); disable Export secrets / USB backup / Erase vault buttons when travel on; clamp auto-lock to 2 min.

- [ ] **Step 4: Screen capture affinity (Windows)**

`SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` when enabling; clear when disabling.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(privacy): travel mode with export block and capture shield"
```

---

### Task 3: Guest grant store + crypto

**Files:**
- Create: `src-tauri/src/guest.rs`
- Modify: `src-tauri/src/lib.rs` (`mod guest;`)

**Interfaces:**
- `GuestKind`: `Folder | File | Media`
- `GuestGrant { id, kind, item_id, label, expires_at, wrapped_dek }`
- `create_grant(kind, item_id, label, passphrase, ttl_mins, vault_key) -> GuestGrantPublic`
- `list_grants(vault_key) -> Vec<GuestGrantPublic>` (no wrapped dek in public)
- `revoke_grant(id, vault_key)`
- `guest_unlock(grant_id, passphrase) -> GuestUnlockResult { kind, item_id, staging_path }`
  - Unwrap DEK with Argon2id(passphrase); decrypt/open staging via existing services
  - Does **not** set session VMK
  - Reject if expired; rate-limit action `"guest_unlock"`

- [ ] **Step 1: Persist grants** under data dir `guest_grants.enc` (AES-GCM with vault key when saving list)

- [ ] **Step 2: TTL clamp** 1..=60, default 15

- [ ] **Step 3: Unit tests** create → unlock → expire reject

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(privacy): guest grant store and unlock crypto"
```

---

### Task 4: Guest Tauri commands + Unlock UI

**Files:**
- Modify: `commands/privacy.rs`, `lib.rs`, `api.ts`, `UnlockScreen.tsx`, Settings (manage grants)

**Interfaces:**
- Commands: `guest_grant_create`, `guest_grant_list`, `guest_grant_revoke`, `guest_unlock`
- Create/list/revoke require `get_key()`
- `guest_unlock` does not require vault session

- [ ] **Step 1: Wire commands**

- [ ] **Step 2: Unlock screen “Guest access”**

Enter grant label/id + passphrase → open staging / show success → timer message

- [ ] **Step 3: Settings — manage grants** (list + revoke + create picker)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(privacy): guest unlock UI and commands"
```

---

### Task 5: Duress vault enroll + unlock branch

**Files:**
- Modify: `store.rs` — `duress_key.enc`, `duress_vault.enc`, enroll/remove/unlock_duress
- Modify: `commands/auth.rs` — `unlock_with_password` try real then duress
- Modify: `commands/mod.rs` — `SESSION_DURESS: AtomicBool` or session side flag; `is_duress_session()`
- Gate folder/file/media mutating commands: if duress → `Err("Not available".into())`

**Interfaces:**
- `enroll_duress_password(master_password, duress_password) -> Result<(), String>`
- `remove_duress_password(master_password) -> Result<(), String>`
- `has_duress_enrolled() -> bool` (OK when locked — boolean only)
- Unlock: real first; else duress → set session key to duress VMK + `session_is_duress=true`
- Duress password must ≠ master password

- [ ] **Step 1: Enroll creates decoy vault** with 2–3 harmless template entries

- [ ] **Step 2: Branch unlock_with_password**

- [ ] **Step 3: Refuse lock-suite + export-to-USB of real paths when duress**

- [ ] **Step 4: Tests** real vs duress unlock isolation

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(privacy): duress vault enroll and unlock branch"
```

---

### Task 6: Duress Settings UI + polish

**Files:**
- Settings in `SecondaryViews.tsx`: enroll/remove duress (masked prompts via `promptMasterPassword`)
- Ensure no UI badge for duress session
- Erase vault / recovery: document that erase wipes both (or require real password only for full erase — **full erase requires confirmation phrase and wipes duress files too**)

- [ ] **Step 1: Settings UI**

- [ ] **Step 2: `erase_vault_and_reset` also deletes duress artifacts**

- [ ] **Step 3: Manual smoke checklist**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(privacy): duress settings UI and erase cleanup"
```

---

### Task 7: Docs, CHANGELOG, version bump 2.2.0

**Files:**
- `CHANGELOG.md` — `[2.2.0]` Phase 1 privacy
- Bump `package.json`, `Cargo.toml`, `tauri.conf.json`, `Package.appxmanifest` to **2.2.0**
- Spec status → Implemented

- [ ] **Step 1: Update docs + versions**

- [ ] **Step 2: `cargo test` privacy/guest + `npm run build`**

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: Phase 1 standout privacy changelog and 2.2.0"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Panic lock + staging wipe | 1 |
| Panic hotkey Ctrl+Shift+L | 1 |
| Travel mode + password disable | 2 |
| Capture shield | 2 |
| Guest TTL 15/60 + one item | 3–4 |
| Guest no full VMK | 3 |
| Duress decoy vault | 5–6 |
| Duress refuses lock suite | 5 |
| No cloud | all |

## Self-review

- No TBD placeholders in task steps
- Approved defaults: TTL 15/60, duress refuses locks, hotkey Ctrl+Shift+L
- Erase vault cleans duress files (Task 6)
