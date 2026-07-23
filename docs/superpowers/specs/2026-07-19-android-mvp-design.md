# GenVault Android MVP Design

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Product:** GenVault — offline authentication vault (GenXis Innovations)

## Goal

Ship a sideloadable Android APK that runs the same security-critical Rust vault as Windows GenVault, with a phone-first UI for core unlock / TOTP / passwords / backup interchange.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Scope | Core vault MVP (not full desktop parity) |
| Cross-device | Bidirectional encrypted backup import/export (`genvault-backup` v1) |
| Unlock | Master password + optional Android biometrics |
| Distribution | Internal / sideload APK first (Play Store later) |
| Stack | Tauri 2 Android — shared Rust + Next.js WebView UI |

## Architecture

- Single Tauri 2 codebase: Windows desktop and Android mobile share one Rust crate (`genvault_lib`) and one Next.js static frontend (`out/`).
- Android project generated/maintained via Tauri mobile tooling under `src-tauri` (Android Studio, SDK, NDK).
- Platform gates (`cfg(target_os = "android")` / `cfg(windows)`):
  - **Shared:** vault storage, AES-256-GCM, Argon2id, TOTP, session/auto-lock, rate limiting, `export_backup` / `restore_backup` / `decode_backup`.
  - **Windows-only:** Windows Hello, USB FIDO/CTAP, USB drive backup, MSI/MSIX packaging paths.
  - **Android-only:** BiometricPrompt-based optional unlock; Storage Access Framework (SAF) for backup file pick/save; `FLAG_SECURE` (or Tauri equivalent) for vault screens.
- Frontend detects Android / narrow viewport and uses a mobile shell (no desktop sidebar chrome).
- Existing `#[cfg_attr(mobile, tauri::mobile_entry_point)]` on `run()` is the mobile entry hook.

```
┌─────────────────────────┐
│  Next.js UI (mobile)    │
│  unlock / list / detail │
└───────────┬─────────────┘
            │ invoke
┌───────────▼─────────────┐
│  Rust commands (shared) │
│  auth, vault, totp,     │
│  backup, rate_limit     │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│  Encrypted vault at rest│
│  + Android Keystore     │
│    (biometric wrap only)│
└─────────────────────────┘
```

## MVP feature scope

### In scope

1. Onboarding — create vault / set master password  
2. Unlock — master password; optional biometric after enroll  
3. Vault list — TOTP + password entries, search, favorites  
4. Entry detail — show/copy TOTP or password; clipboard auto-clear  
5. Add / edit / delete — QR or manual secret for 2FA; credential fields for passwords  
6. Lock / auto-lock — idle timeout + manual lock  
7. Backup — export/restore encrypted backup via SAF (compatible with Windows)  
8. Minimal settings — timeout, biometrics toggle, about  

### Explicitly out of scope (this release)

- Google Play listing and Play App Signing workflow  
- FIDO / hardware security keys  
- USB drive backup  
- HIBP breach checks  
- File attachments  
- Stealth mode  
- Recovery-questions UX polish  
- Device sync / cloud sync  
- Theme system beyond existing dark default  
- Full desktop UI parity (sidebar tour, command palette, etc.)

Google Play distribution: see Wave 0 spec 2026-07-22.

## Backup format (compatibility)

Reuse existing portable format — no new schema in MVP:

```json
{
  "format": "genvault-backup",
  "version": 1,
  "kdf": "argon2id",
  "salt": "<hex>",
  "data": "<hex ciphertext of VaultData JSON>"
}
```

- Passphrase-derived key (Argon2id + fresh salt) encrypts vault payload with AES-GCM.  
- Restorable on any device without OS keyring or original unlock methods.  
- Android: write/read via SAF; Windows: existing export/restore UI/commands.  
- Restore is destructive to local vault data — UI must confirm before applying.

## Security model

- Master password never stored or transmitted.  
- Argon2id → vault master key (VMK); AES-256-GCM at rest; TOTP seeds only inside encrypted vault.  
- Biometrics unwrap a Keystore-protected key that unlocks an encrypted VMK blob — **convenience unlock only**. Master password always recovers the vault. Disabling biometrics or clearing Keystore does not destroy vault ciphertext.  
- Never store TOTP seeds unencrypted. Zeroize sensitive Rust buffers after use (existing patterns).  
- Offline-first: no new network calls in MVP.  
- Failed unlock: generic error message; rate limit / cooldown (reuse `rate_limit`).  
- Screenshot/recents protection via `FLAG_SECURE` where supported.  
- Signing keys and keystores stay out of git (local/env only).

## UI / UX (mobile)

- Phone-first single-column flow: Unlock → List → Detail / Editor → Settings.  
- Desktop layout (min ~1024px sidebar app) must not be the default on Android.  
- Touch targets and safe-area insets for system bars.  
- QR add-account uses device camera permission (existing `html5-qrcode` path, permission declared in Android manifest).  
- Clipboard: copy TOTP/password with auto-clear timer (match desktop behavior).

## Error handling

| Case | Behavior |
|------|----------|
| Wrong password / PIN | Generic failure; rate limit |
| Biometric cancel / unavailable | Fall back to master password |
| Backup passphrase wrong | Fail restore; leave current vault intact |
| Restore confirmed | Replace local vault with decoded backup under current device key wrapping |
| File picker cancel | No-op |

## Build & distribution

- Prerequisites: Android Studio, Android SDK, NDK, Rust Android targets.  
- Dev: Tauri Android dev command (project scripts to be added in implementation plan).  
- Release: signed APK for sideload/internal testing.  
- CI optional; not required for MVP.  
- Play Store is a follow-up project after MVP validation.

## Testing

- Rust: backup round-trip (`export` → `decode`/`restore`), crypto unit tests, Android `cfg` code compiles.  
- Manual device checklist: create vault → add TOTP + password → lock/unlock → enroll biometric → export → restore on device → import a Windows `genvault-backup` file.  
- No Play certification gate in this phase.

## Non-goals / follow-ups

- iOS  
- Play Console listing, data-safety form, Play Integrity  
- Native Kotlin UI rewrite  
- Feature parity with full Windows store listing  

## Success criteria

1. Installable signed APK on a physical Android device or emulator.  
2. User can create, unlock, and use TOTP + password entries offline.  
3. Optional biometric unlock works when enrolled; password always works.  
4. Encrypted backup exports from Android restore on Windows and vice versa (`format: genvault-backup`, `version: 1`).  
5. Windows build remains functional; desktop-only features stay gated.
