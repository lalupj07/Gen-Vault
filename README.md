<p align="center">
  <img src="public/genvault-icon.png" alt="GenVault" width="160" height="160" />
</p>

<h1 align="center">🔐 GenVault</h1>

---

<p align="center">
  <strong>The Ultimate Offline Password &amp; TOTP Security Vault</strong><br />
  Modern, Fast, and Secure Authentication for Windows &amp; Android
</p>

---

<p align="center">
  <img src="https://img.shields.io/badge/VERSION-1.0.0-2E86C1?style=flat-square&labelColor=2C3E50" alt="Version" />
  <img src="https://img.shields.io/badge/LICENSE-MIT-E67E22?style=flat-square&labelColor=2C3E50" alt="License" />
  <img src="https://img.shields.io/badge/PLATFORM-WINDOWS%20%7C%20ANDROID-5DADE2?style=flat-square&labelColor=2C3E50" alt="Platform" />
  <img src="https://img.shields.io/badge/GENXIS-INNOVATIONS-8E44AD?style=flat-square&labelColor=2C3E50" alt="GenXis" />
  <img src="https://img.shields.io/badge/SYNC-OFFLINE%20FIRST-922B21?style=flat-square&labelColor=2C3E50" alt="Offline" />
</p>

<p align="center">
  🚀 <a href="#-quick-start-developers">Quick Start</a>
  &nbsp;•&nbsp;
  📦 <a href="#-download">Download</a>
  &nbsp;•&nbsp;
  🔒 <a href="#-security">Security</a>
  &nbsp;•&nbsp;
  📖 <a href="#-overview">About</a>
</p>

---

## 🎯 Overview

**GenVault** is an offline-first password and TOTP vault by **GenXis Innovations**.  
Your credentials and 2FA secrets stay **on your device** — encrypted with **AES-256-GCM**, unlocked with your master password (plus biometrics when you choose).

Built with **Tauri 2**, **Rust**, and **Next.js** for a fast desktop shell on Windows and a Material You experience on Android. No Cognito. No mandatory cloud sync. No server that can read your vault.

| You get | You avoid |
|---------|-----------|
| Encrypted vault on device | Cloud-held plaintext |
| TOTP / HOTP codes | Shipping seeds to a third party |
| Biometrics + password | Biometrics as the only factor |
| Microsoft Store install | Browser-only toy vaults |

---

## 📦 Download

<p align="center">
  <a href="https://apps.microsoft.com/detail/9P8PJDTP506T?hl=en-us&gl=IN&ocid=pdpshare">
    <img src="https://get.microsoft.com/images/en-us%20dark.svg" alt="Get it from Microsoft" height="60" />
  </a>
</p>

| Platform | Status | Action |
|----------|--------|--------|
| **Windows** | Available now | [Download on Microsoft Store](https://apps.microsoft.com/detail/9P8PJDTP506T?hl=en-us&gl=IN&ocid=pdpshare) |
| **Android** | Release soon | Google Play — coming soon |

Tester / CI builds: [GitHub Releases](https://github.com/lalupj07/Gen-Vault/releases) (binaries are not stored in git).

---

## ✨ Features

- **Password & TOTP vault** — accounts, secrets, notes, tags, favorites  
- **Strong unlock** — master password, PIN, Windows Hello / Android biometrics, optional security key  
- **Secure clipboard** — timed clear for OTP and secrets  
- **Encrypted backup / USB export** — passphrase-wrapped portable backups  
- **Recovery codes** — one-time offline recovery  
- **QR enroll** — scan TOTP provisioning QR on Android  
- **Material You mobile UI** — glass shell, fonts, languages, in-app back stack  
- **Privacy-minded** — screenshot / FLAG_SECURE protections where the OS allows  

---

## 🔒 Security

| Layer | Detail |
|-------|--------|
| Cipher | AES-256-GCM |
| KDF | Argon2id (`m=19456`, `t=3`, `p=4`) |
| OTP | HMAC-SHA-1 TOTP / HOTP |
| Session | In-memory VMK, zeroized on lock |
| IPC | Sensitive commands require unlocked session |
| Notes | Omitted from list DTOs; master-password step-up to reveal |
| Android | Keystore-backed protector + BiometricPrompt on unlock consent |

Full details: **[SECURITY.md](./SECURITY.md)** · Privacy: **[store/PRIVACY_POLICY.md](./store/PRIVACY_POLICY.md)**

```mermaid
flowchart LR
  UI[Next.js UI] -->|Tauri IPC| Rust[Rust core]
  Rust --> Crypto[Argon2id + AES-GCM]
  Rust --> Store[Encrypted vault + SQLite blobs]
  Rust --> Bio[Hello / Biometric / FIDO]
  Store --> Disk[(On-device storage)]
```

---

## 🚀 Quick Start (developers)

**Prerequisites:** Node.js 20+, Rust (stable), Android SDK / JDK 21 for mobile.

```bash
npm install
npm run tauri:dev
```

Android:

```bash
npm run tauri:android:dev
```

Release builds:

```bash
npm run build:release          # Windows
npm run tauri:android:build    # Android
```

More: [BUILD_QUICK_START.md](./BUILD_QUICK_START.md) · [BUILD_RELEASE.md](./BUILD_RELEASE.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [CONTRIBUTING.md](./CONTRIBUTING.md)

### Repository layout

```text
src/                 React / Next.js UI (desktop + mobile shell)
src-tauri/           Rust crypto, vault, Tauri + Android glue
store/               Listing copy, privacy, terms, MSIX assets
scripts/             Windows / MSIX build helpers
.github/workflows/   CI (build + security scan)
```

---

## 🌐 Links & Resources

<p align="center">
  <a href="https://github.com/lalupj07/Gen-Vault/releases"><img src="https://img.shields.io/badge/Latest%20Release-v1.0.0-2E86C1?style=for-the-badge" alt="Latest Release" /></a>
  <a href="https://github.com/lalupj07/Gen-Vault/issues"><img src="https://img.shields.io/badge/Issues-Open-5DADE2?style=for-the-badge" alt="Issues" /></a>
  <a href="https://github.com/lalupj07/Gen-Vault/issues/new"><img src="https://img.shields.io/badge/Report-Bug-E74C3C?style=for-the-badge" alt="Report Bug" /></a>
</p>

<p align="center">
  <a href="./store/PRIVACY_POLICY.md"><img src="https://img.shields.io/badge/Privacy-Policy-27AE60?style=for-the-badge" alt="Privacy Policy" /></a>
  <a href="./CHANGELOG.md"><img src="https://img.shields.io/badge/Changelog-v1.0.0-E67E22?style=for-the-badge" alt="Changelog" /></a>
  <a href="https://apps.microsoft.com/detail/9P8PJDTP506T?hl=en-us&gl=IN&ocid=pdpshare"><img src="https://img.shields.io/badge/Microsoft-Store-0078D4?style=for-the-badge&logo=microsoft&logoColor=white" alt="Microsoft Store" /></a>
  <img src="https://img.shields.io/badge/Google%20Play-Soon-3DDC84?style=for-the-badge&logo=googleplay&logoColor=white" alt="Google Play soon" />
</p>

---

## ⭐ Show Your Support

<p align="center">
  If you find <strong>GenVault</strong> useful, please consider giving it a ⭐ on GitHub!<br />
  Your support helps us improve GenVault for everyone.
</p>

<p align="center">
  <a href="https://github.com/lalupj07/Gen-Vault"><img src="https://img.shields.io/badge/GitHub-Star%20this%20repo-2C3E50?style=for-the-badge&logo=github&logoColor=white" alt="Star on GitHub" /></a>
  <a href="https://github.com/lalupj07/Gen-Vault/fork"><img src="https://img.shields.io/badge/GitHub-Fork-2E86C1?style=for-the-badge&logo=github&logoColor=white" alt="Fork" /></a>
</p>

---

## 🏢 About GenXis Innovations

<p align="center">
  Empowering people with modern, secure, offline-first software.<br />
  Kottayam, Kerala, India
</p>

<p align="center">
  <a href="https://www.genxisinnovation.in">www.genxisinnovation.in</a>
  &nbsp;·&nbsp;
  <a href="mailto:genxisinnovation@outlook.com">genxisinnovation@outlook.com</a>
</p>

---

<p align="center">
  🎉 Made with ❤️ by <a href="https://www.genxisinnovation.in">GenXis Innovations</a>
</p>

<p align="center">
  <sub>GenVault · Windows on Microsoft Store · Android Play release soon · MIT License</sub>
</p>
