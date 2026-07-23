# GenVault Android — Wave 0 Play Store Readiness Design

**Date:** 2026-07-22  
**Status:** Approved — implementation plan ready / in progress  
**Product:** GenVault — offline authentication vault (GenXis Innovations)  
**Package:** `com.genxis.genvault`  
**Related:** Supersedes “Play Store later” deferral in `2026-07-19-android-mvp-design.md` for distribution only; does not reopen MVP feature scope.

## Goal

Produce a **Google Play–uploadable** GenVault Android release that satisfies store, legal, security, and listing essentials. Core vault behavior already exists from the Android MVP; Wave 0 is packaging, compliance, polish, and console readiness — **not** new product features (Autofill, dual vaults, etc.).

**Success criteria**

1. Release **AAB** (and optional APK) built with minify/R8, no cleartext traffic, no debug flags.  
2. Play App Signing configured; upload key documented for the team (never committed).  
3. Privacy Policy + Terms hosted on HTTPS; in-app About links work.  
4. Splash + launcher icon + versionName/versionCode consistent with listing.  
5. Data Safety / content rating / ads declaration prepared from accurate answers.  
6. Crash-free smoke on at least one physical device for unlock → TOTP → backup → biometric → lock.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Scope | Wave 0 Play readiness only |
| Features W1–W4 | Deferred (Autofill, shortcuts, icons pack, trash, imports, history, unlock log, travel mode, dual vaults, share QR, attachments UI, SSH/API type, SAF auto-backup, a11y pack) |
| Root / emulator detection | **Skip** for v1 (false positives hurt real users) |
| Certificate pinning | **Skip** (no GenXis backend; optional HIBP uses public HTTPS) |
| Analytics / crash SDKs | **None** by default (privacy-focused) |
| Ads / IAP | **None** for Wave 0 |
| Network | Cleartext disabled in release; only optional user-initiated HIBP |
| Min / target SDK | Keep `minSdk` 24, `targetSdk` / `compileSdk` 36 (verify against current Play policy at upload time) |
| Support contact | `genxisinnovation@outlook.com` (existing) |
| Website | `https://www.genxisinnovation.in` |

## Architecture (changes)

Wave 0 does **not** change the vault crypto architecture.

```
┌──────────────────────────┐
│ Play Console + assets    │
│ Data Safety, listing     │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ Release AAB              │
│ R8, Play App Signing     │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ Tauri Android app        │
│ Splash → WebView UI      │
│ About / legal links      │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ Existing Rust vault      │
│ (unchanged crypto)       │
└──────────────────────────┘
```

## Workstreams

### A. Legal & in-app surfaces

| Deliverable | Detail |
|-------------|--------|
| Privacy Policy (Android) | Update `store/PRIVACY_POLICY.md` (or Android twin) to cover: local encrypted vault on Android, Android Keystore biometric wrap, camera for QR (if used), no GenXis cloud, no analytics, optional HIBP (hash prefix only, user-initiated). Publish at a stable HTTPS URL. |
| Terms of Use | Short T&Cs: offline product, user owns backups/recovery, no warranty for lost master password, acceptable use. Publish HTTPS URL. |
| In-app About | Mobile **More → About** (or Android & backup / Profile): app name, versionName, GenXis, links to Privacy, Terms, Support email, website. |
| Onboarding copy | Replace remaining “Windows Hello” strings on mobile/onboarding with fingerprint / face / device PIN. |

### B. Branding & UX checklist items

| Deliverable | Detail |
|-------------|--------|
| App name & icon | GenVault; padlock launcher already present — verify Play adaptive icon / mipmaps. |
| Splash screen | Branded splash (icon + name); **no** decorative concentric rings. Prefer Android 12+ SplashScreen API or existing theme splash. |
| Dark / AMOLED | Already supported — verify on splash + About. |
| Back behavior | Keep in-app history / `WebView.goBack()` behavior; no Play-blocking regressions. |
| Loading / error | Ensure unlock, backup, biometric enroll show clear error/timeout messages (no silent hang). |
| Offline | Airplane-mode TOTP generation must work; network only for optional HIBP. |
| Onboarding / tour | Keep; tour spotlight remains rectangular. |

### C. Build, signing, release hygiene

| Deliverable | Detail |
|-------------|--------|
| Release build | `tauri android build` → AAB for Play; APK optional for sideload. |
| Play App Signing | Enroll in Play Console; generate/upload upload keystore **outside repo**; document rotation owner privately. |
| versionCode / versionName | Align with `tauri.conf.json` `1.0.0` and Play increment rules (`versionCode` monotonic). |
| R8 / ProGuard | Confirm release `isMinifyEnabled = true`; add keep rules only as needed for Tauri/JNI; no “keep everything.” |
| Cleartext | Release `usesCleartextTraffic=false` (already). |
| Debug removal | Audit and remove test APIs, verbose logging of secrets, hardcoded keys, debug-only menus before upload. |
| INTERNET permission | Keep for optional HIBP; disclose in Data Safety / Privacy. |

### D. Security posture (Wave 0)

| Item | Action |
|------|--------|
| Secure storage | No change: vault encrypted at rest; biometric HPK via Keystore gate. |
| HTTPS | Only outbound: optional HIBP. No GenXis API. |
| Secrets in repo | Pre-upload scan; never commit keystores or API keys. |
| FLAG_SECURE | Keep on MainActivity. |
| Permissions | Runtime prompts with rationale for camera (QR) / biometrics as applicable; request only when feature used. |

### E. Play Console & store assets

| Deliverable | Detail |
|-------------|--------|
| Listing | Adapt `store/STORE_LISTING.md` for Android: short + full description, emphasize offline TOTP, encrypted storage, biometric unlock, encrypted backup/import, QR, time-sync warning, no analytics by default. |
| Graphics | Feature graphic (1024×500), phone screenshots (unlock, codes, vault, settings/About), optional 7" tablet if targeting. |
| Category | Security / Productivity (Tools) — match Play taxonomy. |
| Data Safety | Local encrypted credentials/TOTP; no data shared with GenXis; optional HIBP disclosed; no ads; no account required. |
| Content rating | Complete questionnaire (utility / no user-generated social content). |
| Ads declaration | No ads. |
| Export compliance | Answer as required (crypto app — follow Play export questions honestly). |

### F. Testing gate (before submit)

Minimum smoke (physical device preferred):

1. Fresh install → onboarding → create vault  
2. Add TOTP (manual or QR) → code refreshes offline  
3. Copy code → clipboard clears after timeout  
4. Encrypted backup export + restore on same or second install  
5. Biometric enroll + unlock (fingerprint and/or face where available)  
6. Background app → vault locks / sensitive UI not in recents  
7. Dark + AMOLED theme toggle  
8. System back from nested More screens without killing app unexpectedly  
9. Time sync warning UI reachable  
10. About links open Privacy/Terms/email  

Optional: second screen size; Android 10+ emulator for crash smoke only (not biometric).

## Explicitly out of scope

- Android Autofill Service  
- Launcher shortcuts, issuer icon CDN pack, accessibility redesign pack  
- Soft-delete trash, KeePass/Bitwarden/Aegis importers, password history  
- Unlock activity log UI, travel mode, work/personal dual vaults  
- Share-one-code QR productization, attachments mobile UI, SSH/API entry kinds  
- Automatic SAF folder backup scheduling  
- Root/emulator detection, cert pinning, analytics SDKs  
- Changing backup crypto format or master-password KDF  

## Deferred roadmap (reference only)

After Wave 0 ships (or is submitted):

| Wave | Theme |
|------|--------|
| W1 | Autofill, launcher shortcuts, issuer icons, accessibility pack |
| W2 | Trash+restore, KeePass/Bitwarden/Aegis import, password history, SSH/API types |
| W3 | Unlock log, travel mode, share-one-code QR, SAF backup folder |
| W4 | Work/personal vaults, attachments mobile UI |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Privacy URL still Windows-only wording | Publish Android-updated policy before submit |
| Play rejects WebView / Tauri packaging | Follow Tauri Android release docs; test install from internal testing track first |
| Biometric OEM quirks | Keep WEAK \| DEVICE_CREDENTIAL gate; document “use master password” fallback |
| HIBP mis-declared in Data Safety | Mark as optional collected/shared only when user runs check |
| Upload key loss | Offline backup of upload keystore; Play App Signing holds app signing key |

## Implementation notes for planning

- Prefer minimal diffs: extend `store/` docs, mobile About surface, splash theme/resources, release signing docs in `store/` (paths only — no secrets).  
- Do not commit `*.jks` / `*.keystore` / Play JSON keys.  
- Update MVP design doc status note: Play distribution is now Wave 0, not “later undefined.”

## Open items (non-blocking for planning)

- Exact public paths for Privacy/Terms on genxisinnovation.in (must exist before submit).  
- Whether first track is **Internal testing** then **Production** (recommended: Internal → Closed → Production).
