<p align="center">
  <img src="public/genvault-icon.png" alt="GenVault" width="96" height="96" />
</p>

<h1 align="center">GenVault</h1>

<p align="center">
  <strong>Offline password &amp; TOTP vault</strong><br />
  by <a href="https://genxis.in">GenXis Innovations</a>
</p>

<p align="center">
  <a href="./SECURITY.md"><img src="https://img.shields.io/badge/Security-Hardened-0B6E4F?style=flat-square" alt="Security" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-1B4F72?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/Platforms-Windows%20%7C%20Android-1A5276?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/Stack-Tauri%202%20%2B%20Rust%20%2B%20Next.js-5B2C6F?style=flat-square" alt="Stack" />
  <img src="https://img.shields.io/badge/Sync-Offline%20first-922B21?style=flat-square" alt="Offline" />
</p>

<p align="center">
  Master-password gated · AES-256-GCM at rest · Argon2id KDF · No cloud required
</p>

---

## Why GenVault

GenVault keeps **credentials and 2FA secrets on your device**. Unlock locally, copy codes securely, lock when you leave. There is no Cognito account, no mandatory sync, and no server that can read your vault.

| You get | You avoid |
|---------|-----------|
| Encrypted vault on device | Cloud-held plaintext or sync side-channels |
| TOTP / HOTP codes | Shipping seeds to a third party |
| Biometrics + password | Biometrics as the only factor |
| Windows + Android | Browser-only toy vaults |

## Features

- **Password & TOTP vault** — accounts, secrets, notes, tags, favorites
- **Strong unlock** — master password, PIN, Windows Hello / Android biometrics, optional security key
- **Secure clipboard** — timed clear for OTP and secrets
- **Encrypted backup / USB export** — passphrase-wrapped portable backups
- **Recovery codes** — one-time offline recovery
- **QR enroll** — scan TOTP provisioning QR on Android
- **Material You mobile UI** — glass shell, fonts, languages, in-app back stack
- **Privacy-minded** — screenshot / FLAG_SECURE protections where the OS allows

## Security (short)

| Layer | Detail |
|-------|--------|
| Cipher | AES-256-GCM |
| KDF | Argon2id (`m=19456`, `t=3`, `p=4`) |
| OTP | HMAC-SHA-1 TOTP / HOTP |
| Session | In-memory VMK, zeroized on lock |
| IPC | Sensitive commands require unlocked session |
| Notes | Omitted from list DTOs; master-password step-up to reveal |
| Android | Keystore-backed protector + BiometricPrompt on unlock consent |

Full write-up: **[SECURITY.md](./SECURITY.md)** · Store privacy: **[store/PRIVACY_POLICY.md](./store/PRIVACY_POLICY.md)**

## Architecture

```mermaid
flowchart LR
  UI[Next.js UI] -->|Tauri IPC| Rust[Rust core]
  Rust --> Crypto[Argon2id + AES-GCM]
  Rust --> Store[Encrypted vault + SQLite blobs]
  Rust --> Bio[Hello / Biometric / FIDO]
  Store --> Disk[(On-device storage)]
```

## Quick start

### Prerequisites

- Node.js 20+
- Rust (stable) + Cargo
- For Android: Android SDK / JDK 21 (see `BUILD_RELEASE.md`)

### Develop

```bash
npm install
npm run tauri:dev
```

Android:

```bash
npm run tauri:android:dev
```

### Release builds

```bash
npm run build:release          # Windows bundles
npm run tauri:android:build    # Android APK / AAB
```

Installers and APKs are **gitignored**. Attach them to [GitHub Releases](https://github.com/lalupj07/Gen-Vault/releases) — do not commit binaries.

More: [BUILD_QUICK_START.md](./BUILD_QUICK_START.md) · [BUILD_RELEASE.md](./BUILD_RELEASE.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)

## Repository layout

```text
src/                 React / Next.js UI (desktop + mobile shell)
src-tauri/           Rust crypto, vault, Tauri + Android glue
store/               Listing copy, privacy, terms, MSIX assets
scripts/             Windows / MSIX build helpers
.github/workflows/   CI (build + security scan)
```

## Configuration

No cloud secrets are required. Optional local overrides: copy [`.env.example`](./.env.example) → `.env.local` (never commit).

## Contributing

1. Keep security first — never commit `.env`, keystores, or vault data.
2. Prefer minimal diffs; validate unlock + clipboard paths when touching crypto/IPC.
3. Run `npm run test:security` and `cargo check` in `src-tauri` before opening a PR.

## License

[MIT](./LICENSE) © GenXis Innovations

---

<p align="center">
  <a href="https://genxis.in">genxis.in</a> ·
  <a href="./SECURITY.md">Security</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./store/STORE_LISTING.md">Store listing</a>
</p>
