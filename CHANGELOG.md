# Changelog

All notable changes to GenVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.0] - 2026-09-11

### Highlights

Wave A (Android): Codes-first calm UX, soft-delete trash, Aegis import, and Autofill scaffold (unlock Intent + Settings) — no new GenXis network endpoints.

### Added

#### Android UX
- **Codes-first landing** — default tab is Codes; Home removed from primary bottom nav (pulse under More → Dashboard)
- **Empty states** — Codes and Vault screenshot-ready empty screens with clear next actions
- **Scan-first FAB** — primary Scan QR; long-press for Add password / Manual secret
- **Issuer icons** — bundled map + monogram fallback (no CDN)
- **Trash UI** — restore and forever-delete for soft-deleted entries

#### Soft-delete (shared vault)
- Soft-delete with **30-day** local restore window and purge
- Travel mode blocks trash restore / export of deleted items

#### Aegis import
- Import TOTP entries from **Aegis JSON** export (secrets never logged)

#### Android Autofill
- **Scaffold** — system AutofillService registration, Settings enable toggle (off by default), and unlock Intent when the vault is locked
- Travel mode disables Autofill; duress session would fill **decoy vault only** once fill is wired
- **Dataset fill deferred** — password/OTP fill pending WebView↔AutofillService session bridge (not shipped in 2.3.0)

### Security / privacy

- Autofill stays **on-device** (scaffold); no new shared data with GenXis (see `store/PLAY_DATA_SAFETY.md`)
- Travel and duress rules apply to Autofill gates and Trash as in Wave A design spec
- Secret exports exclude soft-deleted trash by default

### Notes

- Android `versionCode` **2003000** (`versionName` 2.3.0)
- Bitwarden / KeePass import, Windows Autofill, Wave B lock-suite, and Wave C privacy remain out of scope
- Design: `docs/superpowers/specs/2026-09-11-wave-a-android-ux-design.md`

---

## [2.2.0] - 2026-08-25

### Highlights

Phase 1: Standout Privacy (Windows v1) — panic lock, travel mode, guest unlock, and duress vault.

### Added

#### Standout Privacy (Windows)
- **Panic lock** — one-click and `Ctrl+Shift+L` hotkey lock everything, wipe staging, clear clipboard
- **Travel mode** — temporary lockdown (hide sensitive UI, block export/import/erase, shorter auto-lock); persists until disabled with master password
- **Guest unlock** — time-boxed passphrase access to one Folder Lock, File Lock, or Media Vault item (default 15 min, max 60)
- **Duress vault** — second password opens a decoy vault with no indicator that a real vault exists
- Settings and sidebar UI for all four features
- Design spec: `docs/superpowers/specs/2026-08-25-phase1-standout-privacy-design.md`

#### Standout Privacy (Android)
- **Phase 1 privacy UI** — panic lock (header + profile), travel mode toggle, duress password enroll/remove, guest access grants (create/revoke/list)
- Travel mode hides `travel-hide` tagged entries and shows banner; export/erase remain blocked
- Panic lock also wipes guest unlock staging on all platforms

### Security

- Panic lock requires no password (availability under duress); relocks all lock modules and clears secure clipboard
- Travel mode gates sensitive actions behind master-password step-up to disable
- Guest unlock uses separate Argon2id-wrapped DEK per item (not master VMK)
- Duress vault uses isolated `duress_key.enc` / `duress_vault.enc`; unlock timing matches real vault

### Notes

- Android Phase 1 privacy UI shipped (panic, travel, guest grants, duress); no global panic hotkey on mobile
- Remote wipe and multi-guest sessions out of scope for v1

---

## [2.1.0] - 2026-08-20

### Highlights

Media Vault (Windows v1) — private encrypted gallery for photos, videos, and PDFs, third module in the lock suite.

### Added

#### Media Vault (Windows)
- Import gallery via drag-drop and file picker (single and batch)
- Ciphertext under `%LOCALAPPDATA%\GenVault\media-vault\<id>\` with optional delete-after-import
- Encrypted thumbnails at rest (256px max edge); blurred grid when vault is locked
- Private staging view — decrypt to `media-vault-staging`, open with OS default app, auto-lock wipes staging
- Export to user-chosen path with master-password step-up
- Album tags, favorites, search, and activity log
- MIME allowlist (images, `.mp4`/`.webm`/`.mov`, PDF); large-file confirm (>256 MB), reject >2 GB
- Sidebar **Media Vault** entry and `MediaVaultView` UI
- Settings: auto-lock interval (`media_vault_settings.json`)

### Security

- Vault unlock gates all mutating IPC; export verifies master password before decrypt
- Encrypted payload (`payload.gvm`) and thumbnail (`thumb.gvt`) blobs; no persistent plaintext under GenVault data dir except transient staging while viewing
- Reject symlinks/junctions, system paths, and imports from GenVault data directories (mirrors Folder/File Lock policy)
- Startup orphan staging wipe (`wipe_media_vault_orphans_on_startup`); crash-recover IPC requires unlock
- Design spec: `docs/superpowers/specs/2026-08-20-media-vault-windows-design.md`

### Notes

- In-app video/PDF viewer deferred — view uses OS default app from staging
- Explorer “Add to Media Vault” context menu deferred to follow-up

---

## [2.0.0] - 2026-08-07

### Highlights

Windows lock suite (Folder Lock + File Lock), Windows Hello enrollment fix, pre-production security hardening, and multi-package release (NSIS / MSI / MSIX / APPX).

### Added

#### Folder Lock (Windows)
- Encrypt local NTFS folders under GenVault-controlled storage
- Staging unlock, stub at original path, Explorer “Lock with GenVault”, `genvault://folder-lock`
- Auto-lock and crash orphan staging wipe
- Deep links and sidebar / in-app Folder Lock UI

#### File Lock (Windows)
- Same pattern for individual files (batch lock, 512 MB warn, separate staging)
- Explorer file verb, `genvault://file-lock`, stub at original path

#### Packaging
- Release artifacts: NSIS `-setup.exe`, MSI, MSIX, APPX (`dist/release/v2.0.0/`)

### Fixed

- Windows Hello enroll stuck on “Enrolling…” — HWND interop + message pump (`RequestVerificationForWindowAsync`)
- Folder Lock Access denied (OS error 5) — clear read-only on full trees before wipe
- File Lock shell registration for `*` keys via .NET Registry API
- Production install must use `tauri build` (plain `cargo build --release` pointed at localhost)

### Security

- Crash-recover IPC requires vault unlock; startup orphan wipe remains ungated
- Vault erase: native OS confirm dialog + rate limit (lost-password path preserved)
- Reject symlinks / junctions in Folder Lock and File Lock; path containment checks
- Explorer verbs launch GenVault argv (`--lock-folder` / `--lock-file`) — no PowerShell
- Masked master-password modal (replaces `window.prompt`)
- Clear secure clipboard on Sign Out
- Settings authenticator import uses otpauth phishing heuristics
- `GENVAULT_DATA_DIR` ignored in release builds
- System-path denylist uses `WINDIR` / Program Files env roots
- Audit report: `docs/superpowers/specs/2026-08-07-v2-security-audit.md`

### Notes

- Packages are unsigned until a code-signing certificate is configured
- PIN-only vault unlock remains disabled (master password is the secret factor)
- OTP while unlocked is intentional authenticator UX (accepted residual)

---

## [1.5.0] - 2026-07-25

### Added

- Secure vault recovery / login-screen vault erase flow (`DELETE MY VAULT`)
- Recovery codes and account recovery UX polish

### Security

- Remove Cognito leftovers; harden secret gitignore

### Docs

- Web demo (Vercel) design/plan for Android testers (separate branch)
- Login-screen vault reset design

---

## [1.0.0] - 2026-07-24

### Initial public release

Offline authentication vault for Windows and Android (Play — coming soon).
No cloud account required. Vault data stays on-device.

### Added

#### Security
- AES-256-GCM vault encryption with Argon2id key derivation
- Offline TOTP / HOTP authenticator
- Master password, optional PIN, Windows Hello / Android biometrics
- Hardware security key support (Windows)
- Recovery codes and encrypted backup / restore
- Clipboard hygiene for secrets; notes revealed with step-up auth
- Rate limiting and lock-gated sensitive IPC

#### Platforms
- Windows desktop (Tauri 2) — [Microsoft Store](https://apps.microsoft.com/detail/9P8PJDTP506T)
- Android (Tauri 2) — Play Store listing in progress
- Local SQLite + encrypted vault storage

#### Product
- Entry categories, favorites, tags, search
- Password generator and health checks
- USB backup export
- Onboarding and privacy policy for store distribution

#### Engineering
- GitHub Actions Build & Test + Security Scan
- Jest security / smoke tests and Rust integration tests

### Notes
- Browser-only mode is disabled; use the GenVault app
- Binaries are distributed via Microsoft Store (Windows) and GitHub Releases for testers; source is MIT

[2.3.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v2.3.0
[2.2.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v2.2.0
[2.1.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v2.1.0
[2.0.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v2.0.0
[1.5.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v1.5.0
[1.0.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v1.0.0
