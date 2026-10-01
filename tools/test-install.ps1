# ============================================================================
#  End-to-end dry run of install-local.ps1 (never touches the real profile)
#
#  How it works: copy the manifest-level files of the current profile into a
#  scratch directory, point DSH_HOME at it, then run the real installer with
#  -Unattended. This validates:
#    - junction creation
#    - pnpm add file:./vendor/... resolving and writing dependencies / bundles
#    - all five verification steps in the installer
#  without touching the profile that the running DSH is using.
#
#  NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads a
#  BOM-less UTF-8 script as ANSI, so non-ASCII text here would arrive mangled
#  and break parsing (install-local.ps1 carries the same warning).
#
#  Usage: powershell -ExecutionPolicy Bypass -File tools\test-install.ps1
# ============================================================================

param(
  # Keep the scratch directory after the run, for manual inspection.
  [switch]$Keep,
  # Where to put the scratch directory. Defaults to a folder inside the repo
  # (not the system TEMP: the restricted sandbox cannot write there).
  [string]$ScratchRoot
)

$ErrorActionPreference = 'Stop'

$pluginDir = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ScratchRoot)) { $ScratchRoot = Join-Path $pluginDir '.scratch' }

$realHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($realHome)) { $realHome = Join-Path $env:USERPROFILE '.dsh' }
$realProfileName = $env:DSH_PROFILE
if ([string]::IsNullOrWhiteSpace($realProfileName)) { $realProfileName = 'desktop' }
$realProfile = Join-Path (Join-Path $realHome 'profiles') $realProfileName

function Say($m) { Write-Host $m }

Say ''
Say 'test-install: dry run of the installer against a scratch profile'
Say ('-' * 62)

if (-not (Test-Path $realProfile)) { throw ('real profile not found: ' + $realProfile) }

New-Item -ItemType Directory -Force -Path $ScratchRoot | Out-Null
$scratchHome = Join-Path $ScratchRoot ('scratch-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$scratchProfile = Join-Path (Join-Path $scratchHome 'profiles') 'desktop'
New-Item -ItemType Directory -Force -Path $scratchProfile | Out-Null

# Copy the manifest-level files only; pnpm rebuilds node_modules on demand.
foreach ($f in @('package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml', 'pnpm-lock.yaml')) {
  $src = Join-Path $realProfile $f
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $scratchProfile $f) -Force
    Say ('  copied ' + $f)
  }
}

Say ('  scratch DSH_HOME = ' + $scratchHome)
Say ''
Say '  running tools/install-local.ps1 -Unattended against the scratch profile...'
Say ''

$env:DSH_HOME = $scratchHome
$env:DSH_PROFILE = 'desktop'

$code = 0
try {
  & (Join-Path $PSScriptRoot 'install-local.ps1') -Unattended -SkipProcessCheck -ForceVendorCopy -ProfileDir $scratchProfile
  $code = $LASTEXITCODE
} catch {
  Say ('  installer threw: ' + $_.Exception.Message)
  $code = 1
} finally {
  $env:DSH_HOME = $realHome
  $env:DSH_PROFILE = $null
}

Say ''
if ($code -eq 0) {
  Say '  RESULT: install succeeded on the scratch profile'
} else {
  Say ('  RESULT: install FAILED (exit ' + $code + ')')
}

$scratchPkg = Join-Path $scratchProfile 'package.json'
if (Test-Path $scratchPkg) {
  $json = [System.IO.File]::ReadAllText($scratchPkg, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $dep = $json.dependencies.'dsh-pardofelis-widget'
  $inBundles = @($json.dsh.profile.bundles) -contains 'dsh-pardofelis-widget'
  if ([string]::IsNullOrWhiteSpace($dep)) {
    Say '  dependencies entry : (missing)'
  } else {
    Say ('  dependencies entry : ' + $dep)
  }
  if ($inBundles) {
    Say '  bundles entry      : present'
  } else {
    Say '  bundles entry      : (missing)'
  }
}

if ($Keep) {
  Say ('  scratch kept at    : ' + $scratchHome)
} else {
  Remove-Item $scratchHome -Recurse -Force -ErrorAction SilentlyContinue
  Say '  scratch removed'
}

exit $code
