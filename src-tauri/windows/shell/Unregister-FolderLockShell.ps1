# Remove GenVault Folder Lock protocol + Explorer context menu (HKCU).

$ErrorActionPreference = "Continue"

Remove-Item -Path "HKCU:\Software\Classes\genvault" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\Directory\shell\GenVaultFolderLock" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Unregistered genvault:// protocol and 'Lock with GenVault' context menu."
