# GenVault — Microsoft Store Certification Notes

Provide this document in Partner Center **Notes for certification** when submitting GenVault v1.5.0.

---

## App overview

**GenVault** is a desktop password manager and TOTP authenticator. All sensitive data is encrypted locally on the user's device. There is no GenXis-operated cloud backend and no user account required to use the app.

**Publisher:** GenXis Innovations  
**Contact:** genxisinnovation@outlook.com  
**Website:** https://www.genxisinnovation.in

---

## Test account credentials

**Not applicable.** GenVault does not use server-side authentication. Each user creates a local master password on first launch. Cert testers should:

1. Install the MSIX package
2. Complete the onboarding wizard
3. Set a test master password (e.g. `CertTest-GenVault-2025!`)
4. Optionally add a sample TOTP entry using manual secret: `JBSWY3DPEHPK3PXP` (issuer: Test, account: cert@example.com)

---

## Capabilities declared in manifest

| Capability | Reason |
|------------|--------|
| `runFullTrust` | Desktop bridge (full-trust) Tauri application; required for local file system, USB, and hardware key access |
| `internetClient` | Optional outbound HTTPS only for user-initiated Have I Been Pwned (HIBP) password breach checks |

No broad file system, webcam, microphone, or location capabilities are requested.

---

## Network usage

- **Default:** App works fully offline after install.
- **Optional:** If the user runs a HIBP breach check on a saved password, the app sends only the first 5 characters of the SHA-1 hash to the public HIBP range API (`api.pwnedpasswords.com`) using k-anonymity. No plaintext password or vault contents are transmitted.
- No other network calls are made in normal operation.

---

## Data collection & privacy

- **No personal data collected by GenXis Innovations.**
- Vault data is stored locally in the user's app data directory, encrypted with keys derived from the user's master password.
- No analytics, crash reporting, or advertising SDKs are included.
- **Privacy policy URL:** https://www.genxisinnovation.in/privacy (full text in `store/PRIVACY_POLICY.md`)

---

## Hardware / peripheral usage

- **USB removable storage:** Used only when the user explicitly chooses USB Backup to write an encrypted backup file.
- **USB FIDO2 security keys:** Used only when the user enrolls a hardware key in Settings.
- **Windows Hello:** Used only when the user enables biometric unlock in Settings.

---

## Step-by-step test instructions

### 1. First launch & onboarding
1. Launch GenVault from Start menu
2. Complete signup / login and onboarding wizard
3. **Expected:** Welcome tour highlights sidebar, 2FA, vault, stealth, and shortcuts
4. Skip or finish the tour
5. **Expected:** Main dashboard loads

### 2. Add TOTP account
1. Add authenticator entry with secret `JBSWY3DPEHPK3PXP`
2. **Expected:** 6-digit TOTP code refreshes every 30 seconds

### 3. Lock / unlock
1. Lock vault, then unlock with master password
2. **Expected:** Data restored after unlock

### 4. Windows Hello (if available)
1. Enable Windows Hello in Settings, lock, unlock with biometrics
2. **Expected:** Successful biometric unlock

### 5. Stealth mode
1. Toggle Stealth in sidebar
2. **Expected:** Sensitive content hidden until user clicks Show Content

---

## Content compliance

- No violent, sexual, or gambling content
- Utility / productivity security application
- Suitable for general audience

---

## MSIX package details

- **Package type:** MSIX (desktop, full trust)
- **Entry point:** genvault.exe
- **Version:** 1.5.0.0
- **Architecture:** x64
- **Signing:** Submitted unsigned; Microsoft Store re-signs on ingestion

---

## Support contact

**Email:** genxisinnovation@outlook.com
