# 🚀 Quick Start: Build GenVault v1.0.0 Beta

## ⚡ Fast Track (5 Minutes)

### Prerequisites Check
```powershell
# Verify you have everything installed
node --version    # Should be 20+
rustc --version   # Should be 1.70+
cargo --version   # Should be installed with Rust
```

### One-Command Build
```powershell
# Navigate to project directory
cd "<your-genvault-clone>"

# Run automated build script
npm run build:release
```

**That's it!** ✨

---

## 📦 Build Output

After ~10-20 minutes, you'll find:

```
src-tauri/target/release/bundle/
├── msi/
│   └── GenVault_1.0.0_x64_en-US.msi          (~80-120 MB)
├── nsis/
│   └── GenVault_1.0.0_x64-setup.exe          (~80-120 MB)
└── checksums.txt                              (SHA256 hashes)
```

---

## 🎯 Build Options

### Standard Build
```powershell
npm run build:release
```

### Clean Build (Recommended for first build)
```powershell
npm run build:release:clean
```

### Manual Build (Step by Step)
```powershell
# 1. Install dependencies
npm ci

# 2. Build Next.js
npm run build

# 3. Build Tauri (creates all installers)
npm run tauri:build
```

---

## ✅ Quick Test

### Test MSI Installer
```powershell
# Install
cd src-tauri\target\release\bundle\msi
.\GenVault_1.0.0_x64_en-US.msi

# Launch GenVault from Start Menu
# Verify it works

# Uninstall from Control Panel
```

### Test EXE Installer
```powershell
# Install
cd src-tauri\target\release\bundle\nsis
.\GenVault_1.0.0_x64-setup.exe

# Launch GenVault
# Verify it works

# Uninstall from Control Panel
```

---

## 🐛 Common Issues

### "WebView2 not found"
```powershell
winget install Microsoft.EdgeWebView2Runtime
```

### "WiX not found" (for MSI)
```powershell
winget install WiXToolset.WiX
```

### "Rust not found"
```powershell
winget install Rustlang.Rust.MSVC
```

### Build fails with errors
```powershell
# Clean everything and rebuild
npm run build:release:clean
```

---

## 📊 Build Time

| Hardware | Time |
|----------|------|
| High-end PC (i7/i9, 16GB+ RAM) | ~10 min |
| Mid-range PC (i5, 8GB RAM) | ~15 min |
| Low-end PC (i3, 4GB RAM) | ~20 min |

---

## 🎉 Success!

Once built, you have:
- ✅ MSI Installer (Enterprise deployment)
- ✅ EXE Installer (User-friendly setup)
- ✅ SHA256 checksums for verification

---

## 📚 Need More Details?

See [BUILD_RELEASE.md](./BUILD_RELEASE.md) for:
- Detailed build instructions
- Code signing
- Portable version creation
- Distribution guidelines
- Troubleshooting

---

## 🚀 Deploy

Ready to distribute? See:
- [RELEASE_NOTES_v1.0.0.md](./RELEASE_NOTES_v1.0.0.md) - Release notes
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [SECURITY.md](./SECURITY.md) - Security information

---

**Build Time**: ~10-20 minutes  
**Output Size**: ~250-350 MB total  
**Platforms**: Windows 10/11 (x64)

**Built with ❤️ by GenXis Innovation**
