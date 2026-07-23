# Android MVP manual checklist

- [ ] Install APK with GenVault gold/cyan dial icon on launcher
- [ ] Create vault + master password
- [ ] Add TOTP (manual) + password entry via mobile FAB
- [ ] Lock / unlock with password
- [ ] Enroll biometric; unlock with biometric; cancel falls back to password
- [ ] Auto-lock timeout works
- [ ] Export backup; restore on device
- [ ] Restore Windows `genvault-backup` v1 file
- [ ] Screenshots / recents blocked while app open (`FLAG_SECURE`)
- [ ] Windows desktop build still runs
- [ ] Mobile UI preview: unlock then open with `?mobile=1` on desktop Tauri if needed
