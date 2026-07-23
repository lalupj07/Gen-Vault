# GenVault Privacy Policy

**Effective date:** July 21, 2026  
**Last updated:** July 22, 2026

**GenXis Innovations** (“we,” “us,” or “our”) publishes **GenVault**, an application for offline two-factor authentication (TOTP), encrypted credential storage, and related security features on **Windows desktop and Android**.

This Privacy Policy explains how GenVault handles information when you install and use the app on Windows desktop and Android.

---

## Summary

GenVault is designed as an **offline-first, zero-knowledge** application.

- We do **not** operate a GenXis cloud service for your vault.
- We do **not** require a GenXis account.
- We do **not** collect, sell, or share your vault contents, master password, TOTP secrets, or recovery data with GenXis Innovations.
- Your encrypted data is stored **locally on your device** unless you choose to export or back it up yourself.

---

## 1. Information We Do Not Collect

GenXis Innovations does **not** collect, store, or process on our servers:

- Your master password or recovery codes
- TOTP / 2FA secrets or one-time codes
- Saved passwords, usernames, notes, or attachments
- Windows Hello, Android biometrics, or FIDO2 biometric data
- Your name, email, phone number, or other contact details through normal use of the app

GenVault does **not** include advertising SDKs, analytics SDKs, crash-reporting services, or social media trackers.

---

## 2. Information Stored Locally on Your Device

When you use GenVault, data is stored locally on your device:

- **Windows:** in your local application data area (for example, under `%LOCALAPPDATA%\GenVault` on Windows)
- **Android:** in the app’s private storage (the Tauri application data directory), which other apps cannot access without device-level compromise

Stored data includes:

- Encrypted vault data (TOTP entries, credentials, notes, settings)
- Authentication metadata (such as enrolled unlock methods)
- Encrypted recovery and rate-limiting data
- Optional encrypted file attachments you add to entries

This data is protected using industry-standard cryptography (including AES-256-GCM and Argon2id key derivation). **Only you** can unlock the vault with your master password. Optional Windows Hello, Android biometrics, or an enrolled security key confirm presence and still require the master password.

Sensitive protector keys may also be stored using **platform security features**:

- **Windows:** DPAPI-protected files and the Windows Credential Manager, depending on your configuration
- **Android:** Android Keystore–wrapped protectors when you opt in to biometric or device-credential unlock

You are responsible for:

- Choosing a strong master password
- Keeping recovery codes safe
- Protecting access to your user account and device
- Managing any backups or exports you create

If you uninstall the app or delete local data, your vault data may be permanently removed unless you have a separate backup.

---

## 3. Optional Network Use (Have I Been Pwned)

By default, GenVault works **fully offline**.

If you **manually enable and run** a password breach check (Have I Been Pwned / HIBP), the app may connect to the public HIBP API at `api.pwnedpasswords.com` over HTTPS.

For that optional check only:

- The app uses **k-anonymity**: it sends only the **first 5 characters** of a SHA-1 hash of the checked value.
- The **full password or secret is not transmitted**.
- GenXis Innovations does not receive this request; it goes directly from your device to the HIBP service.
- HIBP is operated by a third party and has its own privacy practices.

No other routine network communication is required for core app functionality.

---

## 4. Optional Device Features You Choose to Enable

If you enable them, GenVault may use the following **locally on your device**:

| Feature | Purpose |
|--------|---------|
| **Windows Hello** | Presence confirmation with master password (does not recover the vault key alone) |
| **Android biometrics / device credential** | Convenience unlock via BiometricPrompt + Android Keystore-wrapped protector (opt-in) |
| **Camera** | Optional QR scanning for otpauth enrollment (permission on use) |
| **FIDO2 / USB security keys** | Hardware-based unlock enrollment |
| **USB removable drives** | User-initiated encrypted backup export |
| **Import / export** | User-initiated migration of vault data |

These features are **opt-in**. GenXis Innovations does not receive data from them.

---

## 5. Microsoft Store

If you obtain GenVault through the **Microsoft Store**, Microsoft may collect information related to download, purchase, updates, and store operations under **Microsoft’s Privacy Statement**: https://privacy.microsoft.com/

That collection is separate from GenXis Innovations and is not controlled by us.

---

## 6. Google Play

If you obtain GenVault through **Google Play**, Google may collect information related to install, updates, and store operations under **Google’s Privacy Policy**: https://policies.google.com/privacy

That collection is separate from GenXis Innovations and is not controlled by us.

---

## 7. Children’s Privacy

GenVault is a general productivity and security utility. We do not knowingly collect personal information from children. The app does not require registration with GenXis Innovations.

---

## 8. Data Retention

Because we do not operate a GenXis-hosted vault service, we do not retain your vault data on our servers. Data remains on your device until you delete it, uninstall the app, or restore from a backup you created.

---

## 9. Your Choices and Rights

You can:

- Use GenVault without enabling HIBP or any online feature
- Export encrypted backups on your own terms
- Delete local vault data from within the app or by removing app data from your device
- Contact us with privacy questions (see Section 12)

Depending on your location, you may have rights under applicable privacy laws. Because GenXis Innovations does not collect personal data through GenVault in normal operation, many data-access requests may not apply to data held by us—but we will respond to legitimate inquiries.

---

## 10. Security

We design GenVault with security as a priority, including encryption at rest, secure local storage patterns, and minimizing exposure of secrets to the app UI layer. No system is perfectly secure; you should keep your operating system and GenVault updated and protect physical access to your device.

---

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. The “Last updated” date at the top will change when we do. Continued use of GenVault after an update means you accept the revised policy.

---

## 12. Contact Us

**GenXis Innovations**  
Email: genxisinnovation@outlook.com  
Website: https://www.genxisinnovation.in

For privacy-related questions about GenVault, contact us at the email above.

---

# Google Play Console — Data Safety (Android)

**Do not use the Microsoft Partner Center block below for Google Play.** Play Console asks whether the app collects personal information; for GenVault Android the correct answer is **Yes** — credentials and TOTP secrets are stored on device as part of app functionality. GenXis does not receive, process, or store vault contents on its servers.

Copy answers from [`store/PLAY_DATA_SAFETY.md`](PLAY_DATA_SAFETY.md) into **Play Console → App content → Data safety**.

### Play questionnaire — quick answers

| Question | Answer (Play / Android) |
|----------|-------------------------|
| Does your app collect personal data? | **Yes** — credentials/TOTP stored **on device only**; not shared with GenXis |
| Is data stored on device? | Yes — encrypted locally on the user's Android device |
| Is data transmitted to GenXis? | No |
| Is data transmitted elsewhere? | Only if user runs optional HIBP check (5-character hash prefix via HTTPS) |
| Third-party services | Optional: Have I Been Pwned API (user-initiated) |
| Privacy policy URL | https://www.genxisinnovation.in/privacy |

On Play, “collects personal info = Yes” means the app stores personal data locally for its core purpose. It does **not** mean GenXis operates a backend that receives vault data.

---

# Partner Center — Short Form (Microsoft / desktop)

Use the block below in **Microsoft Partner Center** privacy fields, store listing notes, or certification — **not** for Google Play (see [`store/PLAY_DATA_SAFETY.md`](PLAY_DATA_SAFETY.md) above).

### Privacy policy URL

```
https://www.genxisinnovation.in/privacy
```

Publish the full policy above at that URL before submission.

### Short description (~200 characters)

```
GenVault stores all data locally on your device. GenXis does not collect personal data. Optional HIBP checks send only a 5-character hash prefix. No ads or analytics.
```

### Certification note (paste into Notes for certification)

```
GenVault stores all vault data locally on the user's device. GenXis Innovations does not collect personal data. The only optional network feature is a user-initiated Have I Been Pwned check that sends a 5-character hash prefix via k-anonymity. No analytics or advertising SDKs are included. Privacy policy: https://www.genxisinnovation.in/privacy
```

### Partner Center questionnaire — quick answers (Microsoft only)

| Question | Answer |
|----------|--------|
| Does your app collect personal data? | No — GenXis does not collect personal data in normal use (vault stays on device). **For Google Play, answer Yes per Data Safety section above.** |
| Is data stored on device? | Yes — encrypted locally on the user's PC or Android device |
| Is data transmitted? | Only if user runs optional HIBP check (hash prefix only) |
| Third-party services | Optional: Have I Been Pwned API (user-initiated) |
| Privacy policy URL | https://www.genxisinnovation.in/privacy |
