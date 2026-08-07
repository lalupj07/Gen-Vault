# GenVault Folder Lock — Windows shell / protocol registration
#
# Registers:
#   1) Custom protocol genvault://
#   2) Explorer directory context menu "Lock with GenVault"
#
# Run after installing GenVault (or from a local release build).
# Requires: PowerShell; write access to HKCU (current user — no admin).

param(
  [Parameter(Mandatory = $false)]
  [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-GenVaultExe {
  param([string]$Hint)
  if ($Hint -and (Test-Path -LiteralPath $Hint)) {
    return (Resolve-Path -LiteralPath $Hint).Path
  }
  $candidates = @(
    "$PSScriptRoot\..\..\..\target\release\genvault.exe",
    "$env:LOCALAPPDATA\GenVault\GenVault.exe",
    "$env:LOCALAPPDATA\Programs\GenVault\GenVault.exe",
    "$env:ProgramFiles\GenVault\GenVault.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) {
      return (Resolve-Path -LiteralPath $c).Path
    }
  }
  throw "GenVault.exe not found. Pass -ExePath 'C:\path\to\GenVault.exe'"
}

$exe = Resolve-GenVaultExe -Hint $ExePath
Write-Host "Using executable: $exe"

# --- Protocol handler (HKCU) ---
$proto = "HKCU:\Software\Classes\genvault"
New-Item -Path $proto -Force | Out-Null
Set-ItemProperty -Path $proto -Name "(default)" -Value "URL:GenVault Protocol"
Set-ItemProperty -Path $proto -Name "URL Protocol" -Value ""
New-Item -Path "$proto\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$proto\DefaultIcon" -Name "(default)" -Value "`"$exe`",0"
New-Item -Path "$proto\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$proto\shell\open\command" -Name "(default)" -Value "`"$exe`" `"%1`""

# --- Explorer context menu on directories ---
$shellKey = "HKCU:\Software\Classes\Directory\shell\GenVaultFolderLock"
New-Item -Path $shellKey -Force | Out-Null
Set-ItemProperty -Path $shellKey -Name "(default)" -Value "Lock with GenVault"
Set-ItemProperty -Path $shellKey -Name "Icon" -Value "`"$exe`""
New-Item -Path "$shellKey\command" -Force | Out-Null
# %V = selected folder path. Launch via protocol so deep-link parser runs.
$cmd = "powershell.exe -NoProfile -WindowStyle Hidden -Command `"Start-Process 'genvault://folder-lock?action=lock&path=' + [uri]::EscapeDataString('%V')`""
Set-ItemProperty -Path "$shellKey\command" -Name "(default)" -Value $cmd

# --- Explorer context menu on files (* path needs .NET; PowerShell/reg.exe wildcards break) ---
$exeIcon = $exe
$fileCmdValue = "powershell.exe -NoProfile -WindowStyle Hidden -Command `"Start-Process ('genvault://file-lock?action=lock&path=' + [uri]::EscapeDataString('%1'))`""
$fileKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes\*\shell\GenVaultFileLock')
$fileKey.SetValue('', 'Lock with GenVault')
$fileKey.SetValue('Icon', $exeIcon)
$cmdKey = $fileKey.CreateSubKey('command')
$cmdKey.SetValue('', $fileCmdValue)
$cmdKey.Close()
$fileKey.Close()

Write-Host "Registered genvault:// protocol, Directory + file 'Lock with GenVault' verbs."
Write-Host "Unregister with: .\Unregister-FolderLockShell.ps1"
