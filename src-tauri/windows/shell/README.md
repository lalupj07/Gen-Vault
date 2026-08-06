# Folder Lock Windows shell integration

After building/installing GenVault on Windows:

1. Register protocol + Explorer menu (current user, no admin):

```powershell
cd src-tauri\windows\shell
.\Register-FolderLockShell.ps1 -ExePath "C:\path\to\GenVault.exe"
```

2. Right-click a local folder → **Lock with GenVault** → launches
   `genvault://folder-lock?action=lock&path=...`

3. Unregister:

```powershell
.\Unregister-FolderLockShell.ps1
```

Installer note: call the register script (or equivalent registry writes) as a
post-install step for MSI/NSIS; call unregister on uninstall.

v1 uses HKCU registry verbs + URL protocol (no kernel drivers / sparse package
required). A future MSIX sparse package can replace this if Store packaging needs it.
