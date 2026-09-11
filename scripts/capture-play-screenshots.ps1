# Capture Google Play phone screenshots from a connected Android device via adb.
# Usage:
#   .\scripts\capture-play-screenshots.ps1              # interactive (5 screens)
#   .\scripts\capture-play-screenshots.ps1 -Shot 3      # capture one numbered shot
#   .\scripts\capture-play-screenshots.ps1 -Auto        # timed captures (switch screens on phone)
#   .\scripts\capture-play-screenshots.ps1 -Auto -DelaySec 20

param(
    [int]$Shot = 0,
    [switch]$Auto,
    [int]$DelaySec = 18
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $ProjectRoot "store\play\screenshots"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "adb not found at $adb" }

$deviceLines = & $adb devices | Select-String "\tdevice$"
if (-not $deviceLines) { throw "No Android device connected. Enable USB debugging and reconnect." }

$shots = @(
    @{ N = 1; Name = "01-unlock";   Hint = "Unlock / login screen (master password field visible)" },
    @{ N = 2; Name = "02-totp";     Hint = "TOTP / authenticator codes list (use fake Test entries)" },
    @{ N = 3; Name = "03-vault";    Hint = "Main vault / entries list" },
    @{ N = 4; Name = "04-settings"; Hint = "Settings - Travel / Duress / Guest section" },
    @{ N = 5; Name = "05-about";    Hint = "About screen with Privacy + Terms links" }
)

function Capture-Shot {
    param([string]$BaseName)
    $remote = "/sdcard/genvault-play-$BaseName.png"
    $local = Join-Path $OutDir "$BaseName.png"
    & $adb shell screencap -p $remote | Out-Null
    & $adb pull $remote $local | Out-Null
    & $adb shell rm $remote 2>$null | Out-Null
    $item = Get-Item $local
    $kb = [math]::Round($item.Length / 1024)
    Write-Host "  -> $local ($kb KB)" -ForegroundColor Green
}

Write-Host "GenVault Play screenshots -> $OutDir" -ForegroundColor Cyan
Write-Host "Device: $((& $adb shell getprop ro.product.model).Trim())" -ForegroundColor Cyan
Write-Host ""

# Wake screen and launch app for first capture
& $adb shell input keyevent KEYCODE_WAKEUP 2>$null | Out-Null
& $adb shell monkey -p com.genvault.auth -c android.intent.category.LAUNCHER 1 2>$null | Out-Null
Start-Sleep -Seconds 2

if ($Shot -gt 0) {
    $s = $shots | Where-Object { $_.N -eq $Shot } | Select-Object -First 1
    if (-not $s) { throw "Unknown shot number $Shot (use 1-5)" }
    Write-Host "[$($s.N)/5] $($s.Hint)"
    if (-not $Auto) { Read-Host "Press Enter when ready on device" }
    Capture-Shot $s.Name
    exit 0
}

if ($Auto) {
    Write-Host "AUTO: switch to each screen within $DelaySec seconds after capture starts." -ForegroundColor Yellow
    foreach ($s in $shots) {
        Write-Host "[$($s.N)/5] $($s.Hint)" -ForegroundColor White
        if ($s.N -gt 1) { Start-Sleep -Seconds $DelaySec }
        Capture-Shot $s.Name
    }
    Write-Host ""
    Write-Host "Done. Files:" -ForegroundColor Green
    Get-ChildItem $OutDir -Filter "*.png" | Sort-Object Name | Format-Table Name, @{N='KB';E={[math]::Round($_.Length/1024)}} -AutoSize
    exit 0
}

foreach ($s in $shots) {
    Write-Host "[$($s.N)/5] $($s.Hint)" -ForegroundColor White
    Read-Host "Navigate on phone, then press Enter to capture"
    Capture-Shot $s.Name
    Write-Host ""
}

Write-Host "Done. Upload 2-8 PNGs from:" -ForegroundColor Green
Write-Host "  $OutDir"
Get-ChildItem $OutDir -Filter "*.png" | Sort-Object Name | Format-Table Name, @{N='KB';E={[math]::Round($_.Length/1024)}} -AutoSize
