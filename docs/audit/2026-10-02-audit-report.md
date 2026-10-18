# GenVault Security Audit, 2026-10-02

Branch `feature/phase1-standout-privacy` @ `2553f58` (Wave A merged) plus uncommitted fixes.
Detail per area:

- Auth, crypto, storage: [2026-10-02-auth-crypto-findings.md](2026-10-02-auth-crypto-findings.md)
- Vault commands, imports, lock suite, guest: [2026-10-02-vault-files-findings.md](2026-10-02-vault-files-findings.md)
- Tauri config, Android, frontend, CI, deps, secrets: [2026-10-02-config-mobile-deps-findings.md](2026-10-02-config-mobile-deps-findings.md)
- Hand compile review of the Rust fixes: [2026-10-02-compile-review.md](2026-10-02-compile-review.md)

## Executive Summary

No Critical findings. Nine High findings were found and fixed. The main ones: a duress (decoy) session could overwrite the real vault's credentials, travel mode did not gate share and transfer, Android OS backup could copy the vault off the device, the staging wipe followed junctions, and the media "open" command could run shell commands from a crafted filename.

**Update 2026-10-02 (later):** Visual Studio Build Tools installed. `cargo test --locked` passes (98 tests, 0 warnings), including the new audit tests. The fixes ship in Windows MSIX 2.3.1.0. `cargo audit` has not been run locally yet; the CI job covers it.

## Risk Score

**61 / 100.** Starts at 100. Each open Medium costs 3 points, each open Low costs 1. Open findings: 0 Critical, 0 High (fixed, pending compile), 9 Medium, 12 Low.

## Findings by severity

| Severity | Found | Fixed | Open (manual / accepted) |
|----------|-------|-------|--------------------------|
| Critical | 0 | 0 | 0 |
| High | 9 | 9 | 0 |
| Medium | 24 | 15 | 9 |
| Low | 21 | 9 | 12 |
| Info | 14 | n/a | n/a |

Open Medium: AUTH-7 (the lockout resets if `rate_limit.json` is deleted), AUTH-8 (Argon2id is at the OWASP minimum and its parameters aren't versioned), AUTH-9 (auto-lock is enforced only by the UI timer, not in Rust), AUTH-10 (duress enrollment is visible on disk), AUTH-11 (Android erase is protected only by the typed phrase), AUTH-12 (changing the master password doesn't require the current one), VAULT-16 (guest staging isn't wiped on startup or lock), CFG-3 (Next 14 advisories; only `next dev` is exposed), CFG-5 (Android clipboard copies aren't marked sensitive).

## Compliance Status (draft, needs lawyer review)

| Framework | Status | Gaps |
|-----------|--------|------|
| GDPR / DPDP / CCPA | Low exposure: no accounts, no server, data stays on device | Privacy policy must disclose the HIBP k-anonymity call and confirm OS backup is disabled |
| PCI-DSS | N/A | No payments in app |
| COPPA | N/A | Not directed at children |
| OWASP MASVS | Partial | Clipboard (CFG-5), Rust-side auto-lock (AUTH-9), KDF strength (AUTH-8) |
| OWASP ASVS (local auth) | Partial | AUTH-7, AUTH-12 |
| SOC 2 / ISO 27001 | Not started | No incident response or disclosure policy docs |

## Privacy Assessment

All vault data is local and AES-256-GCM encrypted. The only network call is HIBP, which sends a 5-character SHA-1 prefix. Android backup and device-transfer are now excluded (CFG-1). Play Data Safety and listing text now match the code (CFG-4). No secrets were found in tracked files or git history.

## Architecture Weaknesses

- Some security gates lived only in React (travel-hide, deep-link lock). These are now in Rust or require a click, but auto-lock is still UI-only (AUTH-9).
- The duress, travel and guest modes cut across many commands. Each new command must call the gate helpers, and nothing enforces that centrally.
- Autofill is a scaffold: the service shows an unlock prompt but does not fill.

## Exact Files Modified (this session)

- Rules/skills: `.cursor/rules/*.mdc` (15 copied + `40-genvault-project.mdc`), `.cursor/skills/{preproduction-security-audit,website-compliance-audit,ai-slop-audit}`, `.gitignore` (track `.cursor/rules` and `.cursor/skills`), `Claude.md` (fixed SKILL.md path)
- Rust: `commands/{auth,vault,file_lock,folder_lock,media_vault,hardware_keys,recovery,mod}.rs`, `crypto.rs`, `store.rs`, `secure_file.rs`, `recovery_codes.rs`, `password_generator.rs`, `totp_gen.rs`, `import_export.rs`, `guest.rs`, `file_lock/service.rs`, `folder_lock/{mod,service}.rs`, `media_vault/service.rs`, `Cargo.toml`, `tauri.conf.json`
- Tests: `src-tauri/tests/audit_auth_{crypto,duress,signup_ratelimit}.rs`, `audit_vault_findings.rs`
- Android: `AndroidManifest.xml`, new `res/xml/data_extraction_rules.xml`
- Frontend: `FileLockView.tsx` (deep link needs a click), `MobileEntryDetail.tsx` (copy)
- CI: `.github/workflows/{build-test,security-scan}.yml` (pinned SHAs, read-only permissions, cargo-audit)
- Docs: `store/PLAY_DATA_SAFETY.md`, `store/PLAY_LISTING.md`, `package-lock.json` (non-major npm fixes)

Code diffs for each fix are in the per-area findings files.

## Remaining Manual Actions

1. Install Visual Studio Build Tools (C++ workload), then run `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo audit`. Fix anything that fails before committing.
2. Run an Android debug build to confirm the manifest and `data_extraction_rules.xml` link.
3. Decide on AUTH-8 (raise Argon2id parameters behind a vault format version) and AUTH-12 (ask for the current password).
4. Move auto-lock into Rust (AUTH-9), wipe guest staging on startup and lock (VAULT-16), mark Android clipboard copies as sensitive (CFG-5).
5. Plan the Next 15/16 upgrade, then make the npm audit and lint CI steps blocking.

## Deployment Checklist

- [ ] `cargo test` green on Windows; CI green on the pinned workflows
- [ ] `npm run build` + `npx tsc --noEmit` green (verified 2026-10-02)
- [ ] Android release build: `allowBackup=false`, FLAG_SECURE on, minify on, versionCode bumped
- [ ] Play Data Safety matches the shipped build
- [ ] Signing keys outside the repo; `keystore.properties` untracked (verified)

## Penetration Testing Checklist

- [ ] Duress unlock cannot change real credentials, codes or keys
- [ ] Travel mode: export, share, transfer, restore, autofill and travel-hide entries all blocked
- [ ] Malicious Aegis, Google or CSV import (huge, deeply nested, bad base32, period 0)
- [ ] Junction and symlink inside lock-suite staging before relock
- [ ] Deep links for file lock and folder lock from a browser while unlocked
- [ ] Unlock brute force across app restarts and after deleting `rate_limit.json`
- [ ] Android: `adb backup`, exported components, Autofill service binding

## Monitoring Checklist

Offline app, no telemetry by design. Monitor: CI security-scan results, RustSec and npm advisories (Dependabot), Play Console crash reports (no PII).

## Future Hardening

1. Versioned KDF parameters with transparent re-wrap on unlock.
2. A central Rust gate that every command must call (session + mode), checked by a test that lists registered commands.
3. A persistent lockout counter stored inside the encrypted auth file or the OS keystore.
4. Finish the Autofill session bridge, keeping the travel and duress gates.
