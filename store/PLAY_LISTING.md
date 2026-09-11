# GenVault — Google Play Listing (en-US)

Use this content in [Google Play Console](https://play.google.com/console/) when submitting GenVault.

## App name

GenVault

## Short description (max 80 characters)

Offline 2FA vault with encrypted local storage. No cloud sync required.

## Full description

GenVault is an offline-first two-factor authentication vault and encrypted credential manager. Your secrets stay on your device — GenXis Innovations does not host a cloud vault.

**Features**

- **Offline TOTP / 2FA** — Generate time-based one-time passwords without internet
- **Android Autofill (scaffold)** — Optional system Autofill service with Settings toggle and unlock Intent; dataset fill pending a later session bridge — credentials never leave your device for Autofill
- **Codes-first UX** — Calm Codes landing, scan-first FAB, issuer icons, and intentional empty states
- **Soft-delete trash** — Restore deleted entries for 30 days, fully offline
- **Aegis import** — Import authenticator accounts from an Aegis JSON export
- **AES-256-GCM encryption** — Vault data encrypted at rest with authenticated encryption
- **Argon2id key derivation** — Master password stretched with memory-hard KDF
- **Biometric unlock** — Fingerprint or face unlock on supported Android devices
- **Encrypted backup & import** — Export and restore vault data in encrypted format
- **QR code setup** — Add authenticator accounts by scanning QR codes
- **Time-sync warning** — Alerts when device clock drift may affect TOTP codes
- **No analytics by default** — No advertising or analytics SDKs in production builds
- **Open-source crypto libraries** — Built on audited, widely used cryptographic components

**Optional online feature**

- **Have I Been Pwned (HIBP)** — Optional, user-initiated password breach check; sends only a password hash prefix (k-anonymity)

GenVault is built with Tauri and Rust for a small footprint and memory-safe cryptography.

## Category suggestion

- **Primary:** Tools
- **Secondary (if available):** Security

## Contact & legal URLs

| Field | Value |
|-------|-------|
| Support email | genxisinnovation@outlook.com |
| Website | https://www.genxisinnovation.in |
| Privacy policy URL | https://www.genxisinnovation.in/privacy |
| Terms of use URL | https://www.genxisinnovation.in/terms |

Source documents in repo: `store/PRIVACY_POLICY.md`, `store/TERMS_OF_USE.md`

## Asset checklist

Capture on a physical device or emulator before upload. Do not commit screenshot binaries unless a designer provides approved assets.

| Asset | Spec | Required shots |
|-------|------|----------------|
| App icon | 512×512 PNG (Play high-res icon) | `store/play/app-icon-512.png` — run `npm run build:play:assets` |
| Feature graphic | 1024×500 PNG or JPG | `store/play/feature-graphic-1024x500.png` |
| Phone screenshots | Min 2; recommend 4+ | Run `npm run build:play:screenshots` → `store/play/screenshots/` |

**Screenshot tips**

- Use 16:9 or 9:16 phone aspect ratio per Play guidelines
- Show real in-app UI; no placeholder mockups
- Avoid displaying live secrets or real account names in captures

## Copyright

© 2025 GenXis Innovations. All rights reserved.
