# Changelog

All notable changes to GenVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/lalupj07/Gen-Vault/releases/tag/v1.0.0
