# GenVault — Google Play Data Safety Form

Copy these answers into **Play Console → App content → Data safety** when submitting GenVault.

Align with `store/PRIVACY_POLICY.md`. Do not claim “no data collected” — vault credentials are personal information stored on device.

## Summary table

| Question | Answer |
|----------|--------|
| Collects personal info? | Yes — credentials/TOTP stored **on device only** |
| Shared with GenXis? | No |
| Encrypted in transit? | N/A for vault; HIBP uses HTTPS when user runs check |
| Encrypted at rest? | Yes |
| Users can request deletion? | Delete app data / uninstall |
| Ads? | No |
| Optional HIBP | Disclosed; hash prefix only |
| Android Autofill (v2.3.0+) | On-device only; **no new shared data** |

## Detailed guidance

### Data types to declare

- **Personal info → User IDs / credentials** — Usernames, passwords, TOTP secrets, notes, and attachments stored locally in the encrypted vault
- **App activity** — Not collected or transmitted to GenXis
- **Android Autofill (preview)**: When the user enables GenVault as the Autofill service, it only offers an "unlock GenVault" prompt; no vault values are filled into other apps yet. Credentials are not sent to GenXis or any third party. Update this answer when dataset fill ships.

### Collection & sharing

- **Collected:** Yes (stored on device as part of app functionality)
- **Shared with third parties:** No (GenXis does not receive vault contents)
- **Autofill (v2.3.0+):** On-device only. Current build returns an unlock prompt only (no dataset fill). No data types are shared off-device.
- **OS backup:** Disabled (`allowBackup=false`, data extraction rules exclude all domains). Vault data is not included in Google cloud backup or device-to-device transfer.
- **Optional HIBP:** User-initiated only; device sends a SHA-1 hash prefix over HTTPS to Have I Been Pwned; GenXis does not receive this data

### Security practices

- **Encrypted in transit:** Not applicable for vault storage (local only). Optional HIBP requests use HTTPS.
- **Encrypted at rest:** Yes — AES-256-GCM vault encryption; master password never stored in plaintext

### Data deletion

Users can delete all app data via **Settings → Apps → GenVault → Clear storage**, or by uninstalling the app. GenXis has no server copy to delete.

### Ads & analytics

- **Contains ads:** No
- **Analytics / crash reporting:** No SDKs in production build

### Privacy policy URL

https://www.genxisinnovation.in/privacy
