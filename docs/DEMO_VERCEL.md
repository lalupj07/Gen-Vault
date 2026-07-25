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

**Production URL:** pending operator deploy (see below).

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

## Deploy (operator)

Production URL is **not live yet**. Run from this worktree after setting env in the Vercel dashboard:

```bash
npx vercel --prod
```

Ensure `NEXT_PUBLIC_GENVAULT_DEMO=true` is set for Production and Preview.

**2026-07-25 attempt:** `npx vercel --prod` created project `lalu-james-projects/web-demo-vercel` but the build failed: Vercel Next.js integration expects `.next/routes-manifest.json`, while this app static-exports to `out/`. Operator should either remove `"framework": "nextjs"` from `vercel.json` and treat the deploy as a static site, or adjust Vercel project settings (Output Directory `out`, Framework Preset **Other**) before retrying. Paste the stable production URL here once deploy succeeds.

## Security notes

- Demo mode is explicitly labeled in the UI; do not store real passwords, TOTP seeds, or recovery material.
- CSP and security headers are configured in `vercel.json` at the repo root.
- APK sideload / Play distribution remains the path for validating production cryptography and secure storage.
