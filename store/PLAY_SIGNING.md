# GenVault — Google Play Signing Guide

Steps for signing and uploading GenVault Android builds. **Never commit keystores, passwords, or secret file paths to git.**

## 1. Create upload keystore (outside repo)

Generate an upload key on a secure machine. Store the keystore file **outside** the repository (e.g. team secrets vault or encrypted backup drive).

```bash
keytool -genkeypair -v \
  -keystore /path/outside/repo/genvault-upload.jks \
  -alias genvault-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```

Replace `/path/outside/repo/` with a location on your machine that is **not** inside the git workspace. Record the keystore password, key password, and alias in your team password manager only.

## 2. Enable Play App Signing

In **Google Play Console → Setup → App signing**:

1. Opt in to **Google Play App Signing** (recommended).
2. Google holds the app signing key; you sign uploads with your upload key.
3. Register the upload certificate from step 1 if prompted.

## 3. Build and upload signed AAB

Build a release Android App Bundle signed with the upload keystore:

```bash
npm run tauri android build -- --apk false
```

Upload the resulting `.aab` from the release output directory to Play Console (Internal testing or Production track). Play re-signs with the app signing key after upload.

## 4. Store credentials securely

| Item | Where to store |
|------|----------------|
| Upload keystore (`.jks`) | Team password manager attachment or encrypted offline backup |
| Keystore password | Team password manager |
| Key alias & key password | Team password manager |
| Play Console access | Restricted team accounts with 2FA |

**Never:** commit keystores, `.env` signing secrets, or passwords to git, CI logs, or public docs.

## 5. versionCode bump rule

Google Play requires **`versionCode` to increase monotonically** on every upload. A lower or duplicate `versionCode` is rejected.

| Field | Source | Current (v1.0.0) |
|-------|--------|------------------|
| `versionName` | `src-tauri/tauri.conf.json` → `"version"` | `1.0.0` |
| `versionCode` | `src-tauri/gen/android/app/tauri.properties` (generated at build) | `1000000` |

**Before each Play upload:**

1. Bump `"version"` in `src-tauri/tauri.conf.json` (semver, e.g. `1.0.1`).
2. Rebuild Android — Tauri regenerates `tauri.properties` with a new `versionCode`.
3. Confirm `tauri.android.versionCode` in the generated properties is **strictly greater** than the last uploaded build.
4. If you must hotfix without a semver bump, increment `versionCode` manually in the generated file before signing — but prefer syncing `versionName` with `tauri.conf.json`.

**Rule of thumb:** Every Play upload gets a new, higher `versionCode`. Never reuse a `versionCode` already accepted by Play.
