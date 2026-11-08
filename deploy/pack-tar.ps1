# pack-tar.ps1 v3 - Tuzhong Wenshu deploy packer (ASCII only for PS 5.1 safety)
# Packs code to tuzhong-wenshu-deploy.tar.gz for /www/wwwroot/tuzhong-wenshu.
# NEVER includes: *.db/.tuzhong-data/.env (production data protection).
#
# v3 guards (added 2026-11-08):
#   1) Refuses to pack a dirty worktree unless -AllowDirty is passed explicitly.
#      Reason: the 2026-11-07 build was packed from a dirty worktree and silently
#      diverged from git master (online snapshot had 1682 uncommitted changes).
#   2) Writes DEPLOY-MANIFEST.txt into the tarball (git HEAD/branch/dirty flag,
#      pack time, payload file count, next/node versions, local BUILD_ID).
#   3) Fails hard when a required path is missing (src/scripts/next.config.ts/package.json).
#      Before v3 a missing directory was skipped silently - that is why the
#      2026-11-07 tarball had no scripts/ and STEP 9 (seed-admin) was a no-op.
param(
  [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'
Write-Host "PACKTAR_V3"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $deployDir
$appSource = Join-Path $repoRoot 'src\tuzhong-wenshu'
$origZip = Join-Path $deployDir 'tuzhong-wenshu-deploy-orig.zip'
$cleanZip = Join-Path $deployDir 'tuzhong-wenshu-deploy.zip'

# ---------------- guard 0: required paths ----------------
$required = @('src', 'scripts', 'next.config.ts', 'package.json')
foreach ($r in $required) {
  $rp = Join-Path $appSource $r
  if (-not (Test-Path -LiteralPath $rp)) {
    Write-Host ("[FATAL] required path missing: " + $rp)
    Write-Host "[FATAL] Refusing to build an incomplete tarball (silent skip is what caused the 2026-11-07 drift)."
    exit 1
  }
}

# ---------------- guard 1: dirty worktree ----------------
$gitHead = '(unknown)'
$gitBranch = '(unknown)'
$dirtyLines = @()
try {
  $gitHead = [string](& git -C $repoRoot rev-parse HEAD 2>$null)
  $gitBranch = [string](& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
  $dirtyLines = @(& git -C $repoRoot status --porcelain 2>$null)
} catch {
  Write-Host "[WARN] git unavailable; dirty guard skipped"
  $dirtyLines = @()
}
$gitHead = $gitHead.Trim()
$gitBranch = $gitBranch.Trim()
$dirtyCount = $dirtyLines.Count

if ($dirtyCount -gt 0 -and -not $AllowDirty) {
  Write-Host ("[REFUSE] worktree is dirty: " + $dirtyCount + " changed path(s) vs HEAD " + $gitHead)
  $dirtyLines | Select-Object -First 20 | ForEach-Object { Write-Host ("  " + $_) }
  if ($dirtyCount -gt 20) { Write-Host ("  ... (" + ($dirtyCount - 20) + " more)") }
  Write-Host "[REFUSE] Packing a dirty worktree is how the online build diverged from git."
  Write-Host "[REFUSE] Commit/isolate the changes, or re-run with -AllowDirty (manifest will be marked DIRTY=yes)."
  exit 1
}
if ($dirtyCount -gt 0) {
  Write-Host ("[WARN] -AllowDirty: packing " + $dirtyCount + " uncommitted changed path(s); manifest marked DIRTY=yes")
} else {
  Write-Host "[OK] worktree clean"
}

if (Test-Path $origZip) { Remove-Item $origZip -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $cleanZip) { Rename-Item $cleanZip ($cleanZip + '.bak') -Force -ErrorAction SilentlyContinue }

$items = @('src','public','prisma','scripts','package.json','package-lock.json','next.config.ts','tsconfig.json','postcss.config.js','tailwind.config.js','eslint.config.mjs','next-env.d.ts')

$tempDir = Join-Path $env:TEMP ("tuzhong-clean-" + (Get-Date -Format 'yyyyMMddHHmmss'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$excl = @('*.db','*.db-journal','*.db-wal','*.log','*.tmp','tz_*.cjs')
$copied = 0
foreach ($i in $items) {
  $sp = Join-Path $appSource $i
  if (-not (Test-Path -LiteralPath $sp)) {
    Write-Host ("[WARN] optional item missing, skipped: " + $i)
    continue
  }
  $dp = Join-Path $tempDir $i
  if (Test-Path -LiteralPath $sp -PathType Container) { Copy-Item -LiteralPath $sp -Destination $dp -Recurse -Force -Exclude $excl }
  else { Copy-Item -LiteralPath $sp -Destination $dp -Force }
  $copied++
}
# Fallback scrub: Copy-Item -Exclude is unreliable for nested files.
# NOTE: in PS 5.1, -Include is IGNORED when combined with -LiteralPath (matches EVERYTHING!).
# Filter explicitly with -like on file names instead.
$scrubPat = @('*.db','*.db.*','*.db-journal','*.db-wal','*.db-shm','*.log','*.tmp','tz_*.cjs','.env','.env.local')
$scrub = @(Get-ChildItem -LiteralPath $tempDir -Recurse -Force -File | Where-Object { $n = $_.Name; @($scrubPat | Where-Object { $n -like $_ }).Count -gt 0 })
Write-Host ("scrub_count=" + $scrub.Count)
foreach ($f in $scrub) { Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue }
if (Test-Path (Join-Path $tempDir '.tuzhong-data')) { Remove-Item (Join-Path $tempDir '.tuzhong-data') -Recurse -Force }
foreach ($s in @('deploy-to-server.sh','nginx-tuzhongwang.conf','ecosystem.config.js')) {
  $p = Join-Path $deployDir $s
  if (Test-Path $p) { Copy-Item -LiteralPath $p -Destination (Join-Path $tempDir $s) -Force }
}

# ---------------- guard 2: manifest ----------------
$payloadFiles = @(Get-ChildItem -LiteralPath $tempDir -Recurse -Force -File).Count
$nextVersion = ''
try {
  $pkg = Get-Content -LiteralPath (Join-Path $appSource 'package.json') -Raw | ConvertFrom-Json
  $nextVersion = [string]$pkg.dependencies.next
} catch { $nextVersion = '(unreadable)' }
$localBuildId = ''
$bidPath = Join-Path $appSource '.next\BUILD_ID'
if (Test-Path -LiteralPath $bidPath) { $localBuildId = (Get-Content -LiteralPath $bidPath -Raw).Trim() }
$dirtyFlag = 'no'
if ($dirtyCount -gt 0) { $dirtyFlag = 'yes' }

$manifestLines = @(
  'DEPLOY-MANIFEST (generated by deploy/pack-tar.ps1 v3)',
  'packed_at         = ' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'),
  'git_head          = ' + $gitHead,
  'git_branch        = ' + $gitBranch,
  'worktree_dirty    = ' + $dirtyFlag,
  'dirty_paths_count = ' + $dirtyCount,
  'payload_files     = ' + $payloadFiles,
  'items_copied      = ' + $copied,
  'scrubbed_files    = ' + $scrub.Count,
  'next_version      = ' + $nextVersion,
  'node_version      = ' + (node -v),
  'local_next_build_id = ' + $localBuildId,
  'note              = only files matching deploy/pack-tar.ps1 item list are packed; *.db/.env/.tuzhong-data are excluded'
)
$manifestPath = Join-Path $tempDir 'DEPLOY-MANIFEST.txt'
Set-Content -LiteralPath $manifestPath -Value $manifestLines -Encoding ASCII
Write-Host ("MANIFEST: dirty=" + $dirtyFlag + " head=" + $gitHead + " payload_files=" + $payloadFiles)

$tar = Join-Path $deployDir 'tuzhong-wenshu-deploy.tar.gz'
if (Test-Path $tar) { Remove-Item $tar -Force -ErrorAction SilentlyContinue }
Push-Location $tempDir
& tar.exe -czf $tar *
$tarExit = $LASTEXITCODE
Pop-Location
Remove-Item $tempDir -Recurse -Force
if ($tarExit -ne 0) {
  Write-Host ("[FATAL] tar.exe failed, exit=" + $tarExit)
  exit 1
}

$info = Get-Item $tar
Write-Host ("TAR: " + $tar)
Write-Host ("SIZE: " + [math]::Round($info.Length/1MB,2) + " MB")
Write-Host ("FILES_IN_TAR: " + ($payloadFiles + 1))
