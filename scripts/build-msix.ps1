# GenVault MSIX / APPX build for Microsoft Store submission.
# Stages Tauri release output + Package.appxmanifest + Assets, then packs MSIX.

param(
    [switch]$Clean = $false,
    [switch]$SkipTests = $false,
    [switch]$Sign = $false,
    [switch]$Store = $true
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$env:CARGO_TARGET_DIR = Join-Path $ProjectRoot "src-tauri\target"

$MsixRoot = Join-Path $ProjectRoot "store\msix"
$StageDir = Join-Path $MsixRoot "stage"
$AssetsDir = Join-Path $MsixRoot "Assets"
$Manifest = Join-Path $MsixRoot "Package.appxmanifest"
$Version = "1.0.1.0"
$OutDir = Join-Path $ProjectRoot "dist\release\v1.0.0"
$MsixName = "GenVault_${Version}_x64.msix"

Write-Host "GenVault MSIX Store Package Build" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

function Find-MakeAppx {
    $kits = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "${env:ProgramFiles}\Windows Kits\10\bin"
    )
    foreach ($kit in $kits) {
        if (-not (Test-Path $kit)) { continue }
        $found = Get-ChildItem -Path $kit -Recurse -Filter "MakeAppx.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Find-SignTool {
    $kits = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "${env:ProgramFiles}\Windows Kits\10\bin"
    )
    foreach ($kit in $kits) {
        if (-not (Test-Path $kit)) { continue }
        $found = Get-ChildItem -Path $kit -Recurse -Filter "SignTool.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

if ($Clean) {
    Write-Host "Cleaning MSIX stage..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $StageDir, $OutDir -ErrorAction SilentlyContinue
    Write-Host "Clean complete" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Generating icons and store assets..." -ForegroundColor Yellow
node src-tauri/icons/generate.js
node store/msix/generate-assets.js
Write-Host ""

if (-not $SkipTests) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    npm test -- --passWithNoTests
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Push-Location src-tauri
    cargo test --locked
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
    Pop-Location
    Write-Host "Tests passed" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Building Tauri release (no installer bundle)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run tauri:build -- --no-bundle
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ReleaseDir = Join-Path $ProjectRoot "src-tauri\target\release"
$ExePath = Join-Path $ReleaseDir "genvault.exe"
if (-not (Test-Path $ExePath)) {
    Write-Host "Release binary not found: $ExePath" -ForegroundColor Red
    exit 1
}

Write-Host "Staging MSIX layout..." -ForegroundColor Yellow
if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
New-Item -ItemType Directory -Path $StageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir "Assets") | Out-Null

Copy-Item $ExePath $StageDir
Get-ChildItem -Path $ReleaseDir -Filter "*.dll" -ErrorAction SilentlyContinue | Copy-Item -Destination $StageDir
Copy-Item $Manifest $StageDir
Copy-Item -Path (Join-Path $AssetsDir "*") -Destination (Join-Path $StageDir "Assets")

$ExeMb = [math]::Round((Get-Item $ExePath).Length / 1MB, 2)
Write-Host "Staged genvault.exe ($ExeMb MB)" -ForegroundColor Green

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$MsixPath = Join-Path $OutDir $MsixName

$winapp = Get-Command winapp -ErrorAction SilentlyContinue
if ($winapp) {
    Write-Host "Packing with winapp CLI..." -ForegroundColor Yellow
    Push-Location $MsixRoot
    if ($Sign) {
        $certPath = Join-Path $MsixRoot "devcert.pfx"
        if (-not (Test-Path $certPath)) {
            winapp cert generate --if-exists skip
        }
        winapp package .\stage --cert $certPath --output $MsixPath
    } else {
        # Store upload: omit --cert (unsigned MSIX; Microsoft Store re-signs on ingestion)
        winapp package .\stage --output $MsixPath
    }
    Pop-Location
} else {
    $makeAppx = Find-MakeAppx
    if (-not $makeAppx) {
        Write-Host "Neither winapp nor MakeAppx.exe found." -ForegroundColor Red
        Write-Host "Install winapp CLI: winget install Microsoft.winappcli" -ForegroundColor Yellow
        Write-Host "Or install Windows 10/11 SDK (includes MakeAppx.exe)." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Packing with MakeAppx: $makeAppx" -ForegroundColor Yellow
    if (Test-Path $MsixPath) { Remove-Item -Force $MsixPath }
    & $makeAppx pack /d $StageDir /p $MsixPath /o /nv
}

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $MsixPath)) {
    Write-Host "MSIX packaging failed." -ForegroundColor Red
    exit 1
}

if ($Sign -and -not $winapp) {
    $signTool = Find-SignTool
    $certPath = Join-Path $MsixRoot "devcert.pfx"
    if ($signTool -and (Test-Path $certPath)) {
        Write-Host "Signing MSIX with devcert.pfx..." -ForegroundColor Yellow
        & $signTool sign /fd SHA256 /a /f $certPath /p "" $MsixPath
    }
}

$MsixMb = [math]::Round((Get-Item $MsixPath).Length / 1MB, 2)
Write-Host ""
Write-Host "MSIX build complete" -ForegroundColor Green
Write-Host "  Output: $MsixPath ($MsixMb MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Store submission checklist:" -ForegroundColor Cyan
Write-Host "  1. Update store/msix/Package.appxmanifest Identity (Name + Publisher) from Partner Center"
Write-Host "  2. Upload MSIX in Partner Center -> Packages"
Write-Host "  3. Attach store/FEATURES.txt and store/CERTIFICATION_NOTES.md for cert team"
Write-Host "  4. Paste store/STORE_LISTING.md content into store listing fields"
Write-Host ""
