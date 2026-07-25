# GenVault — Microsoft Store Listing (en-US)

Use this content in [Partner Center](https://partner.microsoft.com/) when submitting GenVault v1.5.0.

## App name
GenVault

## Publisher
GenXis Innovations

## Category
Productivity > Personal security

## Short description (max ~200 characters)
Offline 2FA vault and encrypted password manager. AES-256-GCM local encryption, no cloud required.

## Description

GenVault v1.5.0 by GenXis Innovations is a secure offline authentication vault for Windows. Store TOTP codes, passwords, secure notes, and attachments locally with zero-knowledge encryption — your master password never leaves your device.

**Why GenVault?**
- **Offline-first** — Works without internet; your secrets never sync to the cloud
- **Zero-knowledge** — AES-256-GCM encryption; only you can decrypt your vault
- **TOTP / 2FA** — Scan QR codes, generate time-based one-time passwords
- **Password manager** — Encrypted credentials with categories and search
- **Secure notes** — Rich text notes protected by the same vault key
- **File attachments** — Encrypt documents inside your vault
- **USB backup** — Export encrypted backups to removable drives
- **Windows Hello** — Biometric presence confirmation with master password on supported devices
- **FIDO2 hardware keys** — Register USB security keys (used with master password)
- **Stealth mode** — Hide sensitive content at a glance
- **Import / export** — Migrate from other authenticators (encrypted export only)

**Optional online feature**
- **Have I Been Pwned (HIBP)** — Optional breach check for saved passwords (user-initiated; sends password hash prefix only)

GenVault is built with Tauri and Rust for a small footprint, fast startup, and memory-safe cryptography.

**Support:** genxisinnovation@outlook.com  
**Website:** https://www.genxisinnovation.in  
**Privacy:** https://www.genxisinnovation.in/privacy (see `store/PRIVACY_POLICY.md`)

## Keywords
2FA, authenticator, TOTP, password manager, offline, encryption, security, vault, OTP, two-factor, zero knowledge, FIDO2, Windows Hello

## Copyright
© 2025 GenXis Innovations. All rights reserved.

## License
MIT License (see in-app About)

## System requirements
- Windows 10 version 1809 (build 17763) or later
- Windows 11 supported
- x64 processor
- Microsoft Edge WebView2 Runtime (usually preinstalled on Windows 11)

## Age rating
Complete the IARC questionnaire in Partner Center. Expected: general audience; no mature content.

## Screenshots (required)
Capture at 1366×768 or 1920×1080:
1. Unlock screen
2. TOTP / 2FA list with codes
3. Password manager view
4. Settings (Windows Hello / FIDO2)
5. About screen showing v1.5.0

## Store logos
Generated in `store/msix/Assets/` — upload Square310x310 and Wide310x150 to Partner Center.

## Package identity (update before upload)
Edit `store/msix/Package.appxmanifest`:
- **Name** — Reserved package identity from Partner Center (e.g. `GenXisInnovations.GenVault`)
- **Publisher** — Partner Center publisher CN (e.g. `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)

The MSIX **Publisher** must match your Partner Center publisher exactly or ingestion will fail.

## Build command
```powershell
npm run build:msix
```

Output: `dist/release/v1.5.0/GenVault_1.5.0.0_x64.msix`

## Files to upload / attach
| File | Purpose |
|------|---------|
| `GenVault_1.5.0.0_x64.msix` | Store package |
| `store/FEATURES.txt` | Feature list for listing / cert |
| `store/CERTIFICATION_NOTES.md` | Certification test notes |
| `store/STORE_LISTING.md` | This listing reference |
