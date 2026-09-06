# Tuzhong Wenshu - Local Pack Script for Deployment
# Uses script location to find project, avoids Chinese path encoding issues
# Usage: powershell -ExecutionPolicy Bypass -File pack-for-deploy.ps1

# Find paths based on script location
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# deploy dir is where this script is
$deployDir = $scriptDir
# project root is parent of deploy
$projectRoot = Split-Path -Parent $deployDir
# app source is under src/tuzhong-wenshu
$appSource = Join-Path $projectRoot "src\tuzhong-wenshu"
$outputZip = Join-Path $deployDir "tuzhong-wenshu-deploy.zip"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Tuzhong Wenshu - Pack for Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  App Source: $appSource" -ForegroundColor DarkGray
Write-Host "  Output:     $outputZip" -ForegroundColor DarkGray
Write-Host ""

# Verify app source exists
if (-not (Test-Path $appSource)) {
    Write-Host "[ERROR] App source not found: $appSource" -ForegroundColor Red
    exit 1
}

# Clean old zip (rename to avoid safe-delete hook interference)
if (Test-Path $outputZip) {
    $backupZip = $outputZip + '.old'
    if (Test-Path $backupZip) { Remove-Item $backupZip -Force -ErrorAction SilentlyContinue }
    Rename-Item $outputZip $backupZip -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Renamed old deploy package" -ForegroundColor Green
}

# Items to include
$includeItems = @(
    "src",
    "public",
    "prisma",
    "scripts",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.js",
    "tailwind.config.js",
    "eslint.config.mjs",
    "next-env.d.ts",
    ".env"
)

# Include .env.local if exists
if (Test-Path (Join-Path $appSource ".env.local")) {
    $includeItems += ".env.local"
}

# Create temp directory
$tempDir = Join-Path $env:TEMP "tuzhong-deploy-$(Get-Date -Format 'yyyyMMddHHmmss')"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "[STEP 1] Copying project files..." -ForegroundColor Yellow

# 排除项：数据库文件、运行时日志、临时文件，避免覆盖生产数据
$excludePatterns = @('*.db', '*.db-journal', '*.db-wal', '*.log', '*.tmp', 'tz_*.cjs')

foreach ($item in $includeItems) {
    $srcPath = Join-Path $appSource $item
    $dstPath = Join-Path $tempDir $item
    if (Test-Path $srcPath) {
        if (Test-Path $srcPath -PathType Container) {
            Copy-Item $srcPath -Destination $dstPath -Recurse -Force -Exclude $excludePatterns
        } else {
            Copy-Item $srcPath -Destination $dstPath -Force
        }
        Write-Host "  [OK] $item" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] $item (not found)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "[STEP 2] Copying deploy scripts..." -ForegroundColor Yellow

# Copy deploy scripts from deploy dir to temp
$deployScripts = @("deploy-to-server.sh", "nginx-tuzhongwang.conf", "ecosystem.config.js")
foreach ($scriptName in $deployScripts) {
    $srcScript = Join-Path $deployDir $scriptName
    if (Test-Path $srcScript) {
        Copy-Item $srcScript -Destination (Join-Path $tempDir $scriptName) -Force
        Write-Host "  [OK] $scriptName" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "[STEP 3] Creating zip..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $outputZip)

Write-Host "  [OK] Package created" -ForegroundColor Green

# Clean temp dir
Remove-Item $tempDir -Recurse -Force

# Show size
$zipInfo = Get-Item $outputZip
$sizeMB = [math]::Round($zipInfo.Length / 1MB, 2)
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Pack Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  File: $outputZip" -ForegroundColor White
Write-Host "  Size: $sizeMB MB" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Upload tuzhong-wenshu-deploy.zip to server /root/" -ForegroundColor White
Write-Host "  2. SSH login to server" -ForegroundColor White
Write-Host "  3. Run: unzip tuzhong-wenshu-deploy.zip -d tuzhong-wenshu" -ForegroundColor White
Write-Host "  4. Run: cd tuzhong-wenshu && chmod +x deploy-to-server.sh && ./deploy-to-server.sh" -ForegroundColor White
Write-Host ""
