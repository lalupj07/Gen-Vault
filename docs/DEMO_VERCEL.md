# GenVault Web Demo (Vercel)

Static browser demo of GenVault UI and flows. **Not for real secrets** — data lives in browser storage with demo-grade crypto. Use the Android APK or Play build for real security testing.

## Vercel project settings

| Setting | Value |
|---------|-------|
| Root Directory | `.` |
| Build Command | `npm run build` |
| Output Directory | `out` |
| Framework Preset | **Other** (static site — not Next.js) |

This app uses Next.js `output: 'export'`, which writes static files to `out/`. Do **not** use the Next.js framework preset: Vercel would look for `.next/routes-manifest.json` and fail. `vercel.json` sets `"framework": null` so the deploy is treated as a static export.

## Environment variables

Set for **Production** and **Preview**:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_GENVAULT_DEMO` | `true` |

Without this flag, the app builds as the Tauri static export and does not enable the in-browser demo backend.

## Tester access

**Production URL:** https://web-demo-vercel.vercel.app

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

Production URL is live at **https://web-demo-vercel.vercel.app**. Redeploy from this worktree:

```bash
npx vercel --prod
```

Ensure `NEXT_PUBLIC_GENVAULT_DEMO=true` is set for Production and Preview (dashboard or `vercel env add`).

**2026-07-25 fix:** Removed `"framework": "nextjs"` from `vercel.json` (now `"framework": null`). Vercel deploys `out/` as a static site. Set Framework Preset to **Other** in the dashboard if the project was created with Next.js.

**2026-07-25 attempt (before fix):** `npx vercel --prod` created project `lalu-james-projects/web-demo-vercel` but the build failed: Vercel Next.js integration expects `.next/routes-manifest.json`, while this app static-exports to `out/`.

**2026-07-25 deploy (after fix + env):** Production alias https://web-demo-vercel.vercel.app with `NEXT_PUBLIC_GENVAULT_DEMO=true` on Production and Preview. Confirmed client bundle includes demo seed/`genvault-demo` backend.

## Security notes

- Demo mode is explicitly labeled in the UI; do not store real passwords, TOTP seeds, or recovery material.
- CSP and security headers are configured in `vercel.json` at the repo root.
- APK sideload / Play distribution remains the path for validating production cryptography and secure storage.
