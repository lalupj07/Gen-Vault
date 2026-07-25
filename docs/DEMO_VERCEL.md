# GenVault Web Demo (Vercel)

Static browser demo of GenVault UI and flows. **Not for real secrets** — data lives in browser storage with demo-grade crypto. Use the Android APK or Play build for real security testing.

## Vercel project settings

| Setting | Value |
|---------|-------|
| Root Directory | `.` |
| Build Command | `npm run build` |
| Output Directory | `out` |
| Framework Preset | Next.js |

## Environment variables

Set for **Production** and **Preview**:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_GENVAULT_DEMO` | `true` |

Without this flag, the app builds as the Tauri static export and does not enable the in-browser demo backend.

## Tester access

After **Reset demo** (or first visit), unlock with:

```
DemoVault1!
```

This is the seeded demo password only. Do not reuse it elsewhere.

## Local preview

PowerShell:

```powershell
$env:NEXT_PUBLIC_GENVAULT_DEMO='true'; npm run build; npx serve out
```

Bash:

```bash
NEXT_PUBLIC_GENVAULT_DEMO=true npm run build && npx serve out
```

Open the URL printed by `serve` (typically `http://localhost:3000`).

## Security notes

- Demo mode is explicitly labeled in the UI; do not store real passwords, TOTP seeds, or recovery material.
- CSP and security headers are configured in `vercel.json` at the repo root.
- APK sideload / Play distribution remains the path for validating production cryptography and secure storage.
