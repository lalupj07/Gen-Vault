# Remove GenVault Folder Lock protocol + Explorer context menu (HKCU).

$ErrorActionPreference = "Continue"

Remove-Item -Path "HKCU:\Software\Classes\genvault" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\Directory\shell\GenVaultFolderLock" -Recurse -Force -ErrorAction SilentlyContinue
cmd /c 'reg delete "HKCU\Software\Classes\*\shell\GenVaultFileLock" /f' 2>$null | Out-Null

Write-Host "Unregistered genvault:// protocol and GenVault shell verbs."
