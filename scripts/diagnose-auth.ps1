# GenVault Authentication Diagnostics
# Run this to check common login issues

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "GenVault Authentication Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Environment Variables
Write-Host "1. Checking Environment Variables..." -ForegroundColor Yellow
$envFile = "..\.env.local"
if (Test-Path $envFile) {
    Write-Host "   .env.local found" -ForegroundColor Green
    $envContent = Get-Content $envFile -Raw
    
    $checks = @(
        @{Name="NEXT_PUBLIC_COGNITO_USER_POOL_ID"; Pattern="NEXT_PUBLIC_COGNITO_USER_POOL_ID=.+"},
        @{Name="NEXT_PUBLIC_COGNITO_CLIENT_ID"; Pattern="NEXT_PUBLIC_COGNITO_CLIENT_ID=.+"},
        @{Name="NEXT_PUBLIC_COGNITO_REGION"; Pattern="NEXT_PUBLIC_COGNITO_REGION=.+"},
        @{Name="COGNITO_CLIENT_SECRET"; Pattern="COGNITO_CLIENT_SECRET=.+"}
    )
    
    foreach ($check in $checks) {
        if ($envContent -match $check.Pattern) {
            $value = ($envContent | Select-String -Pattern $check.Pattern).Matches[0].Value
            if ($value -match "placeholder|XXXXXXXXX|xxxxxxxx|your_|example") {
                Write-Host "   $($check.Name): SET BUT CONTAINS PLACEHOLDER!" -ForegroundColor Red
            } else {
                Write-Host "   $($check.Name): OK" -ForegroundColor Green
            }
        } else {
            Write-Host "   $($check.Name): MISSING!" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   .env.local NOT FOUND!" -ForegroundColor Red
    Write-Host "   Create it from .env.example" -ForegroundColor Yellow
}

Write-Host ""

# Check 2: Build Output
Write-Host "2. Checking Build Output..." -ForegroundColor Yellow
$bundlePaths = @(
    "..\src-tauri\target\release\bundle\msi\GenVault_1.0.0_x64_en-US.msi",
    "..\src-tauri\target\release\bundle\nsis\GenVault_1.0.0_x64-setup.exe"
)

foreach ($path in $bundlePaths) {
    if (Test-Path $path) {
        $size = (Get-Item $path).Length / 1MB
        Write-Host "   Found: $(Split-Path $path -Leaf) ($([math]::Round($size,2)) MB)" -ForegroundColor Green
    } else {
        Write-Host "   Missing: $(Split-Path $path -Leaf)" -ForegroundColor Yellow
    }
}

Write-Host ""

# Check 3: Node Modules
Write-Host "3. Checking Dependencies..." -ForegroundColor Yellow
if (Test-Path "..\node_modules\amazon-cognito-identity-js") {
    Write-Host "   amazon-cognito-identity-js: OK" -ForegroundColor Green
} else {
    Write-Host "   amazon-cognito-identity-js: MISSING!" -ForegroundColor Red
}

if (Test-Path "..\node_modules\@aws-sdk\client-cognito-identity-provider") {
    Write-Host "   @aws-sdk/client-cognito-identity-provider: OK" -ForegroundColor Green
} else {
    Write-Host "   @aws-sdk/client-cognito-identity-provider: MISSING!" -ForegroundColor Red
}

Write-Host ""

# Check 4: Common Issues
Write-Host "4. Common Issues Check..." -ForegroundColor Yellow

# Check if running in Tauri
$isTauri = $env:TAURI_PLATFORM -or (Get-Process -Name "GenVault" -ErrorAction SilentlyContinue)
if ($isTauri) {
    Write-Host "   Running in Tauri desktop app: YES" -ForegroundColor Cyan
} else {
    Write-Host "   Running in Tauri desktop app: NO (browser/dev mode)" -ForegroundColor Cyan
}

Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DIAGNOSIS SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "MOST COMMON LOGIN ISSUES:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. MISSING ENVIRONMENT VARIABLES" -ForegroundColor White
Write-Host "   - Create .env.local from .env.example" -ForegroundColor Gray
Write-Host "   - Fill in your AWS Cognito credentials" -ForegroundColor Gray
Write-Host "   - For desktop app, env vars must be set at BUILD time" -ForegroundColor Gray
Write-Host ""

Write-Host "2. COGNITO APP CLIENT CONFIGURATION" -ForegroundColor White
Write-Host "   - In AWS Console > Cognito > App Client" -ForegroundColor Gray
Write-Host "   - Enable 'ALLOW_USER_PASSWORD_AUTH' flow" -ForegroundColor Gray
Write-Host "   - Disable 'Generate client secret' if using client-side JS" -ForegroundColor Gray
Write-Host ""

Write-Host "3. USER NOT CONFIRMED" -ForegroundColor White
Write-Host "   - Check email for verification code" -ForegroundColor Gray
Write-Host "   - Use /verify-email page to confirm account" -ForegroundColor Gray
Write-Host ""

Write-Host "FIX INSTRUCTIONS:" -ForegroundColor Yellow
Write-Host "1. Set up your .env.local file with real Cognito values" -ForegroundColor White
Write-Host "2. Rebuild the app: npm run build:release:clean" -ForegroundColor White
Write-Host "3. Test with a confirmed user account" -ForegroundColor White
Write-Host ""

Write-Host "For more help, see: BUILD_RELEASE.md" -ForegroundColor Cyan
