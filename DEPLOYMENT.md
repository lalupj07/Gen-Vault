# Deployment (GitHub)

GenVault is an offline Tauri app. There is no cloud stack to deploy.

## GitHub source

1. Ensure `.env*` / keystores / `*.msi` / `*.apk` are **not** committed (see `.gitignore`).
2. Push the repo when ready (maintainers).
3. Attach built artifacts to a **GitHub Release** — do not store installers in git.

## Windows build

```bash
npm install
npm run build:release
```

Outputs under `src-tauri/target/release/bundle/` (ignored by git).

## Android build

```bash
npm run tauri:android:build
```

APKs under `src-tauri/gen/android/app/build/outputs/` (ignored by git).

## Signing

- Sideload / GitHub testing: debug or local upload keystore (never commit).
- Store publishing later: dedicated escrowed keystore.

See `BUILD_RELEASE.md` for details.
