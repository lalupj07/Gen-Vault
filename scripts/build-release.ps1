# GenVault v1.0.0 Release Build Script
# Automates tests, Next.js export, and Tauri Windows installers (MSI / NSIS).

param(
    [switch]$Clean = $false,
    [switch]$SkipTests = $false,
    [switch]$Sign = $false,
    [switch]$MsiOnly = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$env:CARGO_TARGET_DIR = Join-Path $ProjectRoot "src-tauri\target"

Write-Host "GenVault v1.0.0 Release Build" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
if ($MsiOnly) {
    Write-Host "Target: MSI installer only" -ForegroundColor Cyan
}
Write-Host ""

function Test-Command($name, $command) {
    try {
        $version = & $command 2>&1 | Select-Object -First 1
        Write-Host "OK $name`: $version" -ForegroundColor Green
    } catch {
        Write-Host "Missing $name. Install prerequisites and retry." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Checking prerequisites..." -ForegroundColor Yellow
Test-Command "Node.js" { node --version }
Test-Command "Rust" { rustc --version }
Test-Command "Cargo" { cargo --version }

if ($MsiOnly) {
    $wixCandidates = @(
        "C:\Program Files\WiX Toolset v7.0\bin",
        "C:\Program Files (x86)\WiX Toolset v3.11\bin",
        "C:\Program Files\WiX Toolset v3.14\bin"
    )
    $wixFound = $false
    foreach ($dir in $wixCandidates) {
        if ((Test-Path "$dir\wix.exe") -or (Test-Path "$dir\candle.exe")) {
            if ($env:Path -notlike "*$dir*") {
                $env:Path = "$dir;$env:Path"
            }
            Write-Host "OK WiX: $dir" -ForegroundColor Green
            $wixFound = $true
            break
        }
    }
    if (-not $wixFound) {
        $wixCmd = Get-Command wix.exe -ErrorAction SilentlyContinue
        if (-not $wixCmd) { $wixCmd = Get-Command candle.exe -ErrorAction SilentlyContinue }
        if ($wixCmd) {
            Write-Host "OK WiX: $($wixCmd.Source)" -ForegroundColor Green
            $wixFound = $true
        }
    }
    if (-not $wixFound) {
        Write-Host "WiX Toolset not found (required for MSI)." -ForegroundColor Red
        Write-Host "Install: winget install WiXToolset.WiXCLI" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""

if ($Clean) {
    Write-Host "Cleaning build environment..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force .next, out, src-tauri/target, node_modules/.cache, dist/release -ErrorAction SilentlyContinue
    Write-Host "Clean complete" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Generating Tauri icons..." -ForegroundColor Yellow
node src-tauri/icons/generate.js
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host ""

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host ""

if (-not $SkipTests) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    npm test -- --passWithNoTests
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Push-Location src-tauri
    if (Test-Path Cargo.lock) {
        cargo test --locked
    } else {
        cargo test
    }
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "Tests passed" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Building Next.js application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host ""

Write-Host "Building Tauri application..." -ForegroundColor Yellow
Write-Host "   This may take 10-20 minutes on first release build..." -ForegroundColor Gray

$thumb = $env:TAURI_WINDOWS_CERTIFICATE_THUMBPRINT
$signingConfig = "src-tauri\tauri.signing.json"
$tauriArgs = @()
if ($MsiOnly) {
    $tauriArgs += '--bundles'
    $tauriArgs += 'msi'
}

if ($Sign -or $thumb) {
    if (-not $thumb) {
        Write-Host "Set TAURI_WINDOWS_CERTIFICATE_THUMBPRINT before using -Sign" -ForegroundColor Red
        exit 1
    }
    Write-Host "Windows code signing enabled" -ForegroundColor Cyan
    @{
        bundle = @{
            windows = @{
                certificateThumbprint = $thumb
                digestAlgorithm = "sha256"
                timestampUrl = "http://timestamp.digicert.com"
            }
        }
    } | ConvertTo-Json -Depth 5 | Set-Content $signingConfig -Encoding utf8
    npm run tauri:build -- --config $signingConfig @tauriArgs
} else {
    if ($tauriArgs.Count -gt 0) {
        npm run tauri:build -- @tauriArgs
    } else {
        npm run tauri:build
    }
}
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host ""

$bundlePath = "src-tauri\target\release\bundle"
$version = (Get-Content package.json | ConvertFrom-Json).version
$distDir = "dist\release\v$version"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

Write-Host "Build artifacts:" -ForegroundColor Yellow
$artifacts = @()

if (Test-Path "$bundlePath\msi") {
    $msiFiles = Get-ChildItem "$bundlePath\msi\*.msi"
    foreach ($file in $msiFiles) {
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host "   MSI: $($file.Name) ($sizeMB MB)" -ForegroundColor Green
        Copy-Item $file.FullName $distDir -Force
        $artifacts += $file
    }
}

if (-not $MsiOnly -and (Test-Path "$bundlePath\nsis")) {
    $nsisFiles = Get-ChildItem "$bundlePath\nsis\*.exe"
    foreach ($file in $nsisFiles) {
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host "   EXE: $($file.Name) ($sizeMB MB)" -ForegroundColor Green
        Copy-Item $file.FullName $distDir -Force
        $artifacts += $file
    }
}

$checksumFile = Join-Path $distDir "checksums.txt"
Remove-Item $checksumFile -ErrorAction SilentlyContinue
foreach ($file in $artifacts) {
    $hash = Get-FileHash $file.FullName -Algorithm SHA256
    "$($hash.Algorithm): $($hash.Hash)  $($file.Name)" | Out-File -Append $checksumFile -Encoding utf8
}
if (Test-Path $checksumFile) {
    Write-Host "Checksums: $checksumFile" -ForegroundColor Green
}

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Bundle:  $bundlePath" -ForegroundColor White
Write-Host "Release: $distDir" -ForegroundColor White
Write-Host ""
Write-Host "Install (silent):" -ForegroundColor Cyan
Write-Host "   msiexec /i `"$distDir\GenVault_${version}_x64_en-US.msi`" /quiet" -ForegroundColor White
Write-Host ""
