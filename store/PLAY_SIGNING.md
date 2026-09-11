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

1. Copy `store/keystore.properties.example` → `src-tauri/gen/android/keystore.properties` and fill in upload keystore paths/passwords (file is gitignored).
2. Build a release AAB signed with the upload keystore:

```bash
npm run build:play
```

Or:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/build-play-aab.ps1
```

3. Upload `dist/release/vX.Y.Z/android/play/GenVault-vX.Y.Z-play-universal-release.aab` to Play Console (Internal testing first). Play re-signs with the app signing key after upload.

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

| Field | Source | Current (v2.3.0) |
|-------|--------|------------------|
| `versionName` | `src-tauri/tauri.conf.json` → `"version"` | `2.3.0` |
| `versionCode` | `src-tauri/gen/android/app/tauri.properties` (generated at build) | `2003000` |

**Before each Play upload:**

1. Bump `"version"` in `src-tauri/tauri.conf.json` (and keep `package.json` / Cargo in sync).
2. Ensure `src-tauri/gen/android/keystore.properties` exists (gitignored) — see `store/keystore.properties.example`.
3. Build: `npm run build:play` (or `powershell -File ./scripts/build-play-aab.ps1`).
4. Confirm `tauri.android.versionCode` is **strictly greater** than the last uploaded build.
5. Upload `dist/release/vX.Y.Z/android/play/GenVault-vX.Y.Z-play-universal-release.aab` to Play Console.

**Rule of thumb:** Every Play upload gets a new, higher `versionCode`. Never reuse a `versionCode` already accepted by Play.

## 6. Example local layout (outside the repo)

Keep the upload keystore and passwords **outside** the repo. Example layout:

- Keystore: `%USERPROFILE%\.genvault\genvault-upload.jks`
- Credentials notes (prefer a password manager): `%USERPROFILE%\.genvault\upload-credentials.txt`

Point `storeFile` in your local `keystore.properties` at that path. Never commit `.jks` files, real `keystore.properties`, or credential notes.

Register the upload certificate SHA-256 in Play Console → App signing when enrolling Play App Signing.
