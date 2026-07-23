# GenVault — Microsoft Store Submission

Windows installers (MSI / MSIX / EXE) are built **locally** and uploaded to Partner Center or your website.
**Do not commit Windows binaries to the GitHub source repo.**

## Quick start

1. Reserve app name in [Partner Center](https://partner.microsoft.com/)
2. Copy identity from Partner Center into `store/msix/Package.appxmanifest`
3. Build: `npm run build:msix` (artifacts under `dist/release/` — gitignored)
4. Upload the MSIX from your machine to Partner Center
5. Fill **Properties** from `PROPERTIES.md`
6. Use `STORE_LISTING.md`, `FEATURES.txt`, and `CERTIFICATION_NOTES.md` for listing and cert
7. Follow `UPLOAD_CHECKLIST.txt`

## Prerequisites

```powershell
winget install Microsoft.winappcli
```

## Build commands

| Command | Purpose |
|---------|---------|
| `npm run build:msix` | Unsigned MSIX for Store |
| `npm run build:msix:sign` | Self-signed for local test |
| `npm run build:msix:clean` | Clean rebuild |

## Publisher identity

`Publisher` in `Package.appxmanifest` must match Partner Center exactly before final upload.
