# GenVault Security

GenVault is an **offline** vault. Unlock methods and ciphertext stay on-device. There is no Cognito / Redis / cloud sync in the shipping product.

## Cryptography

| Layer | Implementation |
|-------|----------------|
| Vault master key (VMK) | Random 256-bit key, wrapped per unlock method |
| Password / PIN wrap | Argon2id (`m=19456`, `t=3`, `p=4`) → AES-256-GCM |
| Entry secrets & notes | AES-256-GCM inside encrypted vault storage |
| OTP | TOTP/HOTP over HMAC-SHA-1 (RFC 6238 / 4226) |
| Session | In-memory VMK; zeroized on lock |

## Unlock methods

- Master password (required for sensitive reveals / some enroll paths)
- Unlock PIN (policy-hardened)
- Biometrics / Windows Hello / Android BiometricPrompt (presence + password wrap)
- Hardware security key (where supported)
- Recovery codes (one-time, salted hashes)

## Hardening (shipped)

- Vault locked → sensitive IPC requires `get_key()` session
- Notes omitted from list DTOs; reveal requires master-password step-up
- Entry history does not store note bodies
- SQLite metadata columns scrubbed (payload in encrypted blob)
- Secure clipboard helper with timed clear for high-value copies
- Android Keystore HPK: user-auth required + BiometricPrompt on unlock consent
- FLAG_SECURE / screenshot protections where platform supports them
- Rate limiting on unlock attempts

## Reporting

Email maintainers with a clear reproduction. Never include live vault secrets or recovery codes in reports or public issues.

## Scope note

Sideload / GitHub Releases may use a debug or upload signing key for testing. Production store uploads need a dedicated, escrowed signing key — never commit keystores.
