# GenVault Google Play AAB build (signed upload key).
# Requires: JDK 17/21, Android SDK/NDK, and keystore.properties (gitignored).

param(
    [switch]$Clean = $false,
    [switch]$SkipFrontend = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Version = (Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json).version
$OutDir = Join-Path $ProjectRoot "dist\release\v$Version\android\play"
$Props = Join-Path $ProjectRoot "src-tauri\gen\android\keystore.properties"

Write-Host "GenVault Play AAB Build v$Version" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

if (-not (Test-Path $Props)) {
    Write-Host "Missing $Props" -ForegroundColor Red
    Write-Host "Copy store\keystore.properties.example and fill in upload keystore paths/passwords."
    Write-Host "See store\PLAY_SIGNING.md"
    exit 1
}

# Prefer Android OpenJDK 21 (Java 25 breaks Gradle)
$jdk21 = "C:\Program Files\Android\openjdk\jdk-21.0.8"
if (Test-Path "$jdk21\bin\java.exe") {
    $env:JAVA_HOME = $jdk21
    $env:Path = "$jdk21\bin;" + $env:Path
}
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
}
$env:CARGO_TARGET_DIR = Join-Path $ProjectRoot "src-tauri\target"

Write-Host "JAVA_HOME=$env:JAVA_HOME"

if ($Clean) {
    Write-Host "Cleaning Android build outputs..."
    Remove-Item -Recurse -Force "src-tauri\gen\android\app\build" -ErrorAction SilentlyContinue
}

if (-not $SkipFrontend) {
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

npx tauri android build --aab
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$aabSrc = Join-Path $ProjectRoot "src-tauri\gen\android\app\build\outputs\bundle\universalRelease\app-universal-release.aab"
if (-not (Test-Path $aabSrc)) {
    Write-Host "AAB not found at $aabSrc" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$aabDst = Join-Path $OutDir "GenVault-v$Version-play-universal-release.aab"
Copy-Item $aabSrc $aabDst -Force

# AAB signing check (apksigner is APK-only; use jarsigner for bundles)
$ErrorActionPreference = "Continue"
jarsigner -verify -verbose -certs $aabDst 2>&1 | Select-String -Pattern "jar verified|jar is unsigned|Signer|CN=" | Select-Object -First 15
$ErrorActionPreference = "Stop"

$propsPath = Join-Path $ProjectRoot "src-tauri\gen\android\app\tauri.properties"
Write-Host ""
Write-Host "AAB: $aabDst ($([math]::Round((Get-Item $aabDst).Length/1MB,1)) MB)" -ForegroundColor Green
if (Test-Path $propsPath) {
    Get-Content $propsPath | Where-Object { $_ -match "version" }
}
Write-Host "Upload this AAB to Play Console (Internal testing first)." -ForegroundColor Cyan
Write-Host "Listing copy: store\PLAY_LISTING.md | Checklist: store\PLAY_PRE_SUBMIT_CHECKLIST.md"
