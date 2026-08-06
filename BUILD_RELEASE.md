# 🚀 GenVault v1.0.0 Beta Release Build Guide

## 📦 Release Information

- **Version**: 1.0.0 Beta
- **Release Date**: June 16, 2026
- **Build Target**: Windows (x64)
- **Installers**: MSI, NSIS (EXE), Portable

---

## 🛠️ Prerequisites

### Required Software
1. **Node.js 20+** - JavaScript runtime
2. **Rust 1.70+** - Tauri backend
3. **Visual Studio Build Tools** - Windows compilation
4. **WiX Toolset 3.11+** - MSI installer creation

### Install Prerequisites

```powershell
# Install Rust
winget install Rustlang.Rust.MSVC

# Install WiX Toolset (for MSI)
winget install WiXToolset.WiX

# Verify installations
node --version
npm --version
rustc --version
cargo --version
```

---

## 📋 Pre-Build Checklist

### 1. Clean Build Environment
```powershell
# Remove old builds
Remove-Item -Recurse -Force .next, out, src-tauri/target -ErrorAction SilentlyContinue

# Clean npm cache
npm cache clean --force

# Install fresh dependencies
npm ci
```

### 2. Update Version Numbers
- ✅ `package.json` → version: "1.0.0"
- ✅ `src-tauri/Cargo.toml` → version = "1.0.0"
- ✅ `src-tauri/tauri.conf.json` → version: "1.0.0"

### 3. Environment Configuration
```powershell
# Offline product — no Cognito / database / Redis secrets required.
# Optional: copy .env.example to .env.local only for local path overrides.
# Never commit .env, .env.local, keystores, or signing private keys.
```

---

## 🔨 Build Process

### Option 1: Build All Installers (Recommended)

```powershell
# Full production build
npm run tauri:build
```

This creates:
- ✅ **MSI Installer** - `GenVault_1.0.0_x64_en-US.msi`
- ✅ **NSIS Installer** - `GenVault_1.0.0_x64-setup.exe`
- ✅ **Portable** - Extract from NSIS installer

### Option 2: Build Specific Installer

```powershell
# MSI only
cargo tauri build --bundles msi

# NSIS (EXE) only
cargo tauri build --bundles nsis

# Both
cargo tauri build --bundles msi,nsis
```

---

## 📁 Build Output Location

All installers will be in:
```
src-tauri/target/release/bundle/
├── msi/
│   └── GenVault_1.0.0_x64_en-US.msi          (MSI Installer)
├── nsis/
│   └── GenVault_1.0.0_x64-setup.exe          (EXE Installer)
└── ...
```

---

## 🎯 Installer Types

### 1. MSI Installer (Windows Installer)
- **File**: `GenVault_1.0.0_x64_en-US.msi`
- **Size**: ~80-120 MB
- **Features**:
  - System-wide installation
  - Add/Remove Programs integration
  - Automatic updates support
  - Silent install: `msiexec /i GenVault_1.0.0_x64_en-US.msi /quiet`
  
**Best for**: Enterprise deployments, IT administrators

### 2. NSIS Installer (EXE Setup)
- **File**: `GenVault_1.0.0_x64-setup.exe`
- **Size**: ~80-120 MB
- **Features**:
  - User-friendly wizard
  - Custom installation options
  - Start menu shortcuts
  - Desktop shortcut option
  - Silent install: `GenVault_1.0.0_x64-setup.exe /S`

**Best for**: End users, standard installations

### 3. Portable Version
- **Creation**: Extract from NSIS installer or build separately
- **Size**: ~150-200 MB (unpacked)
- **Features**:
  - No installation required
  - Run from USB/external drive
  - Isolated settings
  - No admin rights needed

**Best for**: Testing, portable use, restricted environments

---

## 🔐 Code Signing (Optional but Recommended)

### For Production Release

```powershell
# Sign MSI
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com GenVault_1.0.0_x64_en-US.msi

# Sign EXE
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com GenVault_1.0.0_x64-setup.exe
```

### Update tauri.conf.json
```json
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

---

## ✅ Post-Build Verification

### 1. Test MSI Installer
```powershell
# Install
msiexec /i GenVault_1.0.0_x64_en-US.msi

# Verify installation
Test-Path "C:\Program Files\GenVault\GenVault.exe"

# Uninstall
msiexec /x GenVault_1.0.0_x64_en-US.msi
```

### 2. Test NSIS Installer
```powershell
# Run installer
.\GenVault_1.0.0_x64-setup.exe

# Verify shortcuts
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\GenVault\GenVault.lnk"

# Uninstall via Control Panel or:
& "C:\Program Files\GenVault\Uninstall GenVault.exe"
```

### 3. Security Scan
```powershell
# Scan with Windows Defender
Start-MpScan -ScanPath "src-tauri\target\release\bundle\" -ScanType CustomScan

# Verify digital signature (if signed)
Get-AuthenticodeSignature GenVault_1.0.0_x64-setup.exe
```

---

## 📊 Build Checklist

- [ ] Clean build environment
- [ ] Update version numbers (1.0.0)
- [ ] Configure production environment
- [ ] Run `npm ci` (fresh install)
- [ ] Run `npm run build` (Next.js)
- [ ] Run `npm run tauri:build` (Tauri)
- [ ] Verify MSI installer
- [ ] Verify NSIS installer
- [ ] Create portable version
- [ ] Sign installers (if applicable)
- [ ] Test installation on clean Windows VM
- [ ] Test uninstallation
- [ ] Scan for viruses/malware
- [ ] Create release notes
- [ ] Upload to distribution platform

---

## 🐛 Troubleshooting

### Build Fails: "WebView2 not found"
```powershell
# Install WebView2 Runtime
winget install Microsoft.EdgeWebView2Runtime
```

### Build Fails: "WiX not found"
```powershell
# Add WiX to PATH
$env:Path += ";C:\Program Files (x86)\WiX Toolset v3.11\bin"
```

### Build Fails: "Rust compilation error"
```powershell
# Update Rust
rustup update

# Clean Rust cache
cargo clean
```

### MSI Build Fails
```powershell
# Install WiX Toolset
choco install wixtoolset

# Or download from: https://wixtoolset.org/
```

---

## 📦 Distribution

### Upload Locations
1. **GitHub Releases** - Primary distribution
2. **Company Website** - Direct download
3. **Microsoft Store** - Optional (requires MSIX)
4. **Enterprise Portal** - Internal distribution

### Release Assets
```
GenVault-v1.0.0-beta/
├── GenVault_1.0.0_x64_en-US.msi           (MSI Installer)
├── GenVault_1.0.0_x64-setup.exe           (NSIS Installer)
├── GenVault_1.0.0_portable.zip            (Portable Version)
├── RELEASE_NOTES.md                       (Release Notes)
├── SECURITY.md                            (Security Info)
└── checksums.txt                          (SHA256 Hashes)
```

### Generate Checksums
```powershell
# Generate SHA256 hashes
Get-FileHash GenVault_1.0.0_x64_en-US.msi -Algorithm SHA256 | Format-List
Get-FileHash GenVault_1.0.0_x64-setup.exe -Algorithm SHA256 | Format-List
```

---

## 🎉 Release Announcement

### Release Notes Template
```markdown
# GenVault v1.0.0 Beta Release

## 🎯 Highlights
- Offline vault (no cloud account)
- AES-256-GCM + Argon2id
- TOTP / HOTP authenticator
- Windows Hello / Android biometrics
- Encrypted backup & recovery codes

## 📥 Downloads
- MSI Installer (Recommended for Enterprise)
- EXE Installer (Recommended for Users)
- Portable Version (No installation required)

## 🔐 Security
- All installers are digitally signed
- SHA256 checksums provided
- Open-source security audit available

## 📋 System Requirements
- Windows 10/11 (x64)
- 4GB RAM minimum
- 500MB disk space
- No internet required for vault use

## 🐛 Known Issues
- None reported

## 📞 Support
- Documentation: https://docs.genvault.app
- Email: support@genvault.app
- Issues: https://github.com/genxis/genvault/issues
```

---

## 🚀 Quick Build Commands

```powershell
# Complete build process (one command)
npm ci && npm run build && npm run tauri:build

# Development build (faster, no optimization)
npm run tauri:dev

# Clean and rebuild
Remove-Item -Recurse -Force .next, out, src-tauri/target; npm ci; npm run tauri:build
```

---

**Build Time**: ~10-20 minutes (depending on hardware)  
**Total Size**: ~250-350 MB (all installers)  
**Supported**: Windows 10/11 (x64)

---

## Folder Lock (Windows shell)

After installing a desktop build, register the Explorer context menu + `genvault://` protocol (current user):

```powershell
cd src-tauri\windows\shell
.\Register-FolderLockShell.ps1 -ExePath "C:\path\to\GenVault.exe"
```

Unregister on uninstall: `.\Unregister-FolderLockShell.ps1`  
Details: `src-tauri/windows/shell/README.md`

---

**Built with ❤️ by GenXis Innovation**
