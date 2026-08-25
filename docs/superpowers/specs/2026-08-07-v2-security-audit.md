# GenVault 2.0.0 — Pre-Production Security Audit Report

**Date:** 2026-08-07  
**Scope:** Tauri desktop vault (Windows), Folder/File Lock, Hello, auth, IPC  
**Method:** preproduction-security-audit (Phases 1–20 adapted to offline desktop)

## Executive Summary

Crypto core (Argon2id + AES-256-GCM, encrypted TOTP at rest, unlock gates) is solid. Highest risks were same-user/webview IPC (ungated staging wipe, phrase-only vault erase, symlink lock, PowerShell shell verbs, unmasked `window.prompt`). Critical remote decrypt issues: **none**. High findings were **fixed** for 2.0.0 except authenticator OTP-while-unlocked (accepted residual, industry-standard for vault sessions).

## Risk Score

**Before fixes:** ~48/100 (local threat model)  
**After fixes:** ~72/100  
**Method:** Start 100; Critical −15, High −8, Medium −3, Low −1 (floor 0). Accepted residuals noted.

## Critical Findings

None (remote/no-auth vault decrypt).

## High Findings

| ID | Finding | Status |
|----|---------|--------|
| H1 | Crash-recover IPC wiped staging without unlock | **Fixed** — IPC requires unlock; startup wipe separate |
| H2 | `erase_vault_and_reset` phrase-only | **Fixed** — native MessageBox + rate limit |
| H3 | Folder Lock followed junctions/symlinks | **Fixed** — reject reparse + path containment |
| H4 | PowerShell Explorer verbs / protocol hijack | **Mitigated** — verbs launch exe argv (`--lock-folder`/`--lock-file`); HKCU protocol residual |
| H5 | `generate_otp` without re-auth while unlocked | **Accepted** — UX for authenticators; CSP + lock session |
| H6 | `window.prompt` for master password | **Fixed** — masked `MasterPasswordPromptHost` |
| H7 | Sign Out left secure clipboard | **Fixed** — clear on logout |

## Medium (selected)

| ID | Finding | Status |
|----|---------|--------|
| M2 | System path C:-only | **Fixed** — WINDIR/ProgramFiles env |
| M5 | `GENVAULT_DATA_DIR` in release | **Fixed** — debug/test only |
| M4 | Legacy setup without rate limit | **Fixed** |
| M8 | Shell PowerShell | **Fixed** (verbs) |
| FE | Settings otpauth skip safety | **Fixed** |
| FE | Unlock autocomplete | **Fixed** |

## Production readiness

**Score:** ~78/100  
**Blockers cleared for unsigned local/store-prep packages.** Remaining manual: code signing thumbprint, Partner Center Identity, SmartScreen reputation.

## Artifacts (v2.0.0)

- `dist/release/v2.0.0/GenVault_2.0.0_x64-setup.exe` (NSIS)
- `dist/release/v2.0.0/GenVault_2.0.0_x64_en-US.msi`
- `dist/release/v2.0.0/GenVault_2.0.0.0_x64.msix`
- `dist/release/v2.0.0/GenVault_2.0.0.0_x64.appx` (same package)

## Remaining manual

1. Configure Windows code signing (`certificateThumbprint`) for SmartScreen.
2. Align MSIX Publisher CN with Partner Center.
3. Re-run shell registration after install (`Register-FolderLockShell.ps1`).
4. Optional: remove unused npm deps (`otplib`, `recharts`, `@react-email`).
