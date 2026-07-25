# GenVault Web Demo — Vercel Tester Link Design

**Date:** 2026-07-25  
**Status:** Approved — awaiting implementation plan  
**Product:** GenVault — offline authentication vault (GenXis Innovations)  
**Related:** Complements Android Wave 0 (`2026-07-22-android-play-wave0-design.md`) by giving testers a no-install link; does **not** replace APK/AAB or Play Internal testing for real-device security validation.

## Goal

Ship a **browser demo** of GenVault on Vercel so testers can exercise product flows through a single HTTPS link — especially useful for Android UI/UX review without installing an APK.

**Success criteria**

1. Stable Vercel URL opens GenVault UI on phone browsers (Chrome/Safari) and desktop.  
2. Testers can complete core flows: setup → unlock → add/edit entries → TOTP codes tick → settings → backup/restore → lock → reset demo.  
3. Desktop/Android Tauri builds are unchanged: browser mode remains refused unless the demo flag is set.  
4. Persistent **Demo** badge + disclaimer; IndexedDB persistence survives refresh; **Reset demo** restores seed state.  
5. Demo is `noindex` and ships with basic security headers.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Delivery | Vercel static deploy of existing Next.js `output: 'export'` app |
| Backend | In-browser demo adapter behind `api.ts` `invoke()` seam |
| Persistence | IndexedDB (survives refresh); Reset demo clears + re-seeds |
| Compile gate | `NEXT_PUBLIC_GENVAULT_DEMO=true` only on Vercel demo env |
| Real crypto | **No** — demo-grade password check + cleartext-at-rest in IDB; never marketed as secure vault |
| Native features | Stub: biometrics, Hello, FIDO, USB/removable drives |
| HIBP | Disabled in demo (offline-friendly after first load) |
| Default shell | Mobile UI for phone testers |
| Analytics | None |
| Indexing | `X-Robots-Tag: noindex` |

## Non-goals

- Replacing Play Internal testing / sideload APK for crypto, Keystore, or biometric verification  
- WASM port of the Rust vault  
- Server-side vault storage (contradicts zero-knowledge positioning)  
- Production encryption-at-rest claims for the demo  

## Architecture

```
Browser (Vercel static export, out/)
  └── React UI (existing)
        └── src/lib/api.ts → invoke()
              ├── Tauri present?     → real Rust vault (desktop / Android)
              ├── DEMO flag true?    → src/lib/demo/* (IndexedDB)
              └── else               → throw (current secure refusal)
```

**Single seam:** Only `src/lib/api.ts` talks to Tauri today. Demo dispatch is a branch inside `invoke()`; no other files need Tauri awareness.

### Demo modules

| Path | Role |
|------|------|
| `src/lib/demo/store.ts` | IndexedDB load/save; schema version; `resetDemo()` |
| `src/lib/demo/seed.ts` | First-run sample user + ~6–8 fabricated vault entries |
| `src/lib/demo/handlers/*.ts` | Command handlers by domain (auth, vault, otp, settings, recovery, import-export, security, attachments, shares, history) |
| `src/lib/demo/index.ts` | `demoInvoke(cmd, args)` router |

Database name: `genvault-demo`. One versioned state document.

### Auth (demo-grade)

- First visit → setup (create master password).  
- Later → unlock with that password.  
- Password verification is JS-side demo hashing — **not** Argon2 / SQLite.  
- Document a default seed password for empty/reset state so testers are not blocked.  
- Auto-lock timeout honored while the tab is open.  
- `get_platform` returns `demo-web` (or equivalent); UI defaults to mobile shell.

## Feature coverage

### Fully usable

Setup / unlock / lock / logout; vault CRUD, favorites, tags, search, categories, pagination; TOTP generate/verify via existing `totp-browser`; imports that can run in JS; password generator / passphrase / strength; settings (theme, auto-lock, language); backup export/restore as JSON round-trip in IDB; security questions + recovery codes (demo storage); local security audit/score; entry history; local shares; attachments as Blobs in IDB; templates; command palette items; local usage stats; `erase_vault_and_reset` / Reset demo (wipe IDB + re-seed).

### Honest stubs

| Feature | Demo behavior |
|---------|----------------|
| Biometric / Windows Hello / FIDO | Soft failure: “Not available in browser demo” |
| Removable drives / USB backup | Empty list or soft error |
| HIBP network check | Skipped; report `hibp_error` or equivalent offline result |

## UX

- Persistent **Demo** badge (non-dismissible while in demo mode).  
- Short disclaimer on unlock and in About: demo is not encrypted like the real GenVault app; do not store real secrets.  
- **Reset demo** control in Settings / More.  
- Mobile-first layout by default for the Vercel deploy.

## Deployment (Vercel)

1. Project root = repo; build command `npm run build`; output directory `out`.  
2. Environment: `NEXT_PUBLIC_GENVAULT_DEMO=true`.  
3. `vercel.json`: CSP (tight, allow self + required inline if Next requires), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`.  
4. Optional custom domain later; preview deployments allowed for PR review.

Desktop/Android release pipelines must **not** set the demo env var.

## Security guardrails

1. Demo path dead-code / unused when flag is absent — Tauri builds keep today’s browser refusal.  
2. No real secrets in seed data; no production key material.  
3. No analytics or third-party trackers.  
4. Disclaimer is mandatory; product copy must never call the demo “zero-knowledge” or “encrypted at rest.”  
5. Security review of the `invoke()` branch is part of implementation acceptance.

## Testing

| Layer | What |
|-------|------|
| Unit (Jest) | Demo handlers: auth, CRUD, TOTP vs `otplib`, reset |
| Manual | Android Chrome via Vercel URL: full smoke path in Success criteria |
| Regression | Tauri desktop build without flag still refuses browser `invoke` |

## Out of scope / follow-ups

- Password-protecting the demo URL (optional later if link leaks)  
- Syncing demo state across devices  
- Play Console internal track (separate from this demo link)  

## Open implementation notes (resolved at plan time)

- Exact IndexedDB schema version and migration strategy for demo state.  
- Whether mobile shell is forced by query (`?mobile=1`), user-agent, or always-on when demo flag is set (prefer always-on for demo deploy).  
- Minimal CSP that still allows Next static export + QR/camera if used in demo.  
