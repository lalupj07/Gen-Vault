# Remove GenVault Folder Lock protocol + Explorer context menu (HKCU).

$ErrorActionPreference = "Continue"

Remove-Item -Path "HKCU:\Software\Classes\genvault" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\Directory\shell\GenVaultFolderLock" -Recurse -Force -ErrorAction SilentlyContinue
try {
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree('Software\Classes\*\shell\GenVaultFileLock', $false)
} catch {}

Write-Host "Unregistered genvault:// protocol and GenVault shell verbs."
