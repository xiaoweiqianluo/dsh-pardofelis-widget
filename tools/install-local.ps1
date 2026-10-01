# ============================================================================
#  dsh-pardofelis-widget - local installer for DSH Desktop (Windows)
#
#  USAGE
#    Right-click this file -> "Run with PowerShell"
#    or:  powershell -ExecutionPolicy Bypass -File "<path to this file>"
#
#  WHAT IT DOES
#    1. Waits until DSH Desktop is fully closed. The install rewrites the
#       profile's node_modules, which is unsafe while DSH is reading it.
#       A PowerShell window is independent of DSH, so quitting DSH does NOT
#       close this window - come back here and press Enter.
#    2. Backs up the profile's package.json and pnpm-lock.yaml.
#    3. Puts the plugin where pnpm can reach it and runs
#         pnpm --dir <profile> add <spec>
#    4. Verifies the dependency is registered, the package resolves, and it
#       declares dsh.bundle.patch with both halves present.
#    5. If pnpm itself fails, restores package.json and pnpm-lock.yaml from the
#       backups. Once pnpm SUCCEEDS the manifest is never rolled back - doing
#       that would orphan node_modules and end up worse than the failure that
#       triggered it.
#
#  WHY THIS FILE IS ASCII-ONLY
#    Windows PowerShell 5.1 mis-decodes non-ASCII text in a script unless the
#    encoding happens to match its ANSI code page, and the failure mode is a
#    confusing "Unexpected token '}'" parse error rather than anything about
#    encodings. Keeping every byte ASCII sidesteps the whole class of problem.
#    (Measured on this machine: a UTF-8 BOM was NOT enough.)
#
#  WHY pnpm IS INVOKED THROUGH node.exe
#    Windows PowerShell 5.1 has no file association for .cjs / .mjs, so
#    `& pnpm.cjs` fails silently - $LASTEXITCODE does not even change.
#    Invoking `node <pnpm> ...` is deterministic on every machine.
#
#  WHY THE SPEC IS RELATIVE
#    pnpm resolves a `file:` spec against the profile directory, and
#    path.join ignores a Windows drive letter in its second argument. Passing
#    an absolute path produced:
#      ENOENT scandir 'C:\...\profiles\desktop\F:\<plugin folder>'
#    A spec that points outside the profile tree is handled inconsistently by
#    pnpm (it can fall back to git resolution), so the reliable strategy is:
#      - if the plugin already lives inside the profile, reference it directly
#      - otherwise copy it into <profile>\vendor\<pkg> and reference that
#    The second form is self-contained: moving or deleting the repo afterwards
#    does not break the installed plugin.
# ============================================================================

param(
  # Skip every prompt and fail fast instead of waiting. For automated checks.
  [switch]$Unattended,
  # Skip the "DSH must be closed" gate. For the scratch-profile dry run in
  # tools/test-install.ps1, which never touches the live profile.
  # Never use this against the profile a running DSH is reading.
  [switch]$SkipProcessCheck,
  # Always install from a copy inside <profile>\vendor. Only used by the dry
  # run, to exercise that code path deterministically.
  [switch]$ForceVendorCopy,
  # Install into this profile directory instead of the DSH_HOME-derived one.
  [string]$ProfileDir
)

$ErrorActionPreference = 'Stop'

$script:logDisabled = $false
$logPath = Join-Path $env:TEMP ('dsh-pardofelis-install-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

# Write to the console always; mirror to a log file when that is possible
# (a restricted environment may not allow writes outside the workspace).
function Log($m) {
  Write-Host $m
  if ($script:logDisabled) { return }
  try {
    Add-Content -LiteralPath $logPath -Value $m -ErrorAction Stop
  } catch {
    $script:logDisabled = $true
    Write-Host ('  [note] cannot write the log file (' + $logPath + '); continuing without it')
  }
}
function Ok($m)   { Log ('  [ok]   ' + $m) }
function Step($m) { Log ''; Log $m }
function Die($m)  { throw $m }

# Read JSON as UTF-8 regardless of BOM. Get-Content -Raw would use the ANSI code
# page for a BOM-less UTF-8 file and break on the plugin's non-ASCII description.
function Read-Json($path) {
  return ([System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
}

$pluginDir = Split-Path -Parent $PSScriptRoot
$pkgName   = 'dsh-pardofelis-widget'
$sep       = [char]92   # backslash, written as a char to avoid escape confusion

# Target profile: DSH_HOME / DSH_PROFILE when set, otherwise the defaults.
$dshHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($dshHome)) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
$profileName = $env:DSH_PROFILE
if ([string]::IsNullOrWhiteSpace($profileName)) { $profileName = 'desktop' }
$prof = Join-Path (Join-Path $dshHome 'profiles') $profileName
if (-not [string]::IsNullOrWhiteSpace($ProfileDir)) { $prof = $ProfileDir }

# pnpm: prefer the runtime bundled with DSH, then the desktop shim, then PATH.
$pnpmCandidates = @(
  (Join-Path $dshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'),
  (Join-Path $prof '.desktop-bin\pnpm.cmd'),
  (Join-Path $dshHome '.desktop-bin\pnpm.cmd'),
  (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\pnpm\bin\pnpm.cjs'),
  (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\pnpm\bin\pnpm.mjs')
)
$pnpm = $null
foreach ($candidate in $pnpmCandidates) {
  if (Test-Path $candidate) { $pnpm = $candidate; break }
}
if ($null -eq $pnpm) {
  $onPath = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($null -ne $onPath) { $pnpm = $onPath.Source }
}

# node.exe: used to invoke pnpm (see the header).
$nodeExe = $null
$nodeCandidates = @(
  (Join-Path $dshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\bin\node.exe')
)
foreach ($candidate in $nodeCandidates) {
  if (Test-Path $candidate) { $nodeExe = $candidate; break }
}
if ($null -eq $nodeExe) {
  $onPath = Get-Command node -ErrorAction SilentlyContinue
  if ($null -ne $onPath) { $nodeExe = $onPath.Source }
}

# Express $target relative to $root, using ..\ hops when needed.
# Not [System.IO.Path]::GetRelativePath: Windows PowerShell 5.1 runs on .NET
# Framework, which does not have it (that method arrived in .NET Core 2.0).
function Get-RelativePath($root, $target) {
  if ($target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $target.Substring($root.Length).TrimStart($sep)
  }
  $up = 0
  $cursor = $root
  while (-not $target.StartsWith($cursor, [System.StringComparison]::OrdinalIgnoreCase)) {
    $parent = Split-Path -Parent $cursor
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $cursor) { return $null }
    $cursor = $parent
    $up += 1
  }
  $tail = $target.Substring($cursor.Length).TrimStart($sep)
  $prefix = (@('..') * $up) -join '/'
  if ([string]::IsNullOrWhiteSpace($tail)) { return $prefix }
  return $prefix + '/' + ($tail -replace '\\', '/')
}

# Remove a path if it exists. Test-Path throws on an empty string in 5.1.
function Remove-PathQuietly {
  param([string]$Target)
  if ([string]::IsNullOrWhiteSpace($Target)) { return }
  if (Test-Path -LiteralPath $Target) {
    Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue
    Log ('  removed ' + $Target)
  }
}

$stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$backedUp  = $false
$installed = $false

function Get-DshProcesses {
  @(Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -like '*DSH*' -or $_.ProcessName -like '*harness*' -or $_.ProcessName -like '*DeepSeek*' })
}

function WaitForDshClosed {
  while ($true) {
    $procs = Get-DshProcesses
    if ($procs.Count -eq 0) { return }
    $names = ($procs | ForEach-Object { $_.ProcessName + '(' + $_.Id + ')' }) -join ', '
    if ($Unattended) { Die ('DSH is still running: ' + $names) }
    Log ''
    Log ('  DSH Desktop is still running: ' + $names)
    Log '  Installing rewrites the profile node_modules, so DSH must be closed.'
    Log '  Quit DSH completely (tray icon -> Quit), then press Enter here.'
    Log '  This window belongs to PowerShell, not to DSH, and stays open.'
    Read-Host '  press Enter to continue' | Out-Null
  }
}

function Restore-Backups {
  foreach ($f in @('package.json', 'pnpm-lock.yaml')) {
    $bak = Join-Path $prof ($f + '.bak-' + $stamp)
    if (Test-Path $bak) {
      Copy-Item $bak (Join-Path $prof $f) -Force
      Log ('  restored ' + $f + ' from the backup taken before this run')
    }
  }
  # pnpm may have left a half-linked entry; drop it so a re-run starts clean.
  Remove-PathQuietly (Join-Path $prof ('node_modules\' + $pkgName))
  Remove-PathQuietly (Join-Path $prof ('vendor\' + $pkgName))
}

try {
  Log ''
  Log 'dsh-pardofelis-widget - local installer'
  Log ('-' * 58)

  Step '1/5  checking the plugin directory'
  foreach ($needed in @('package.json', 'cordis.patch.yml', 'bundle\host.js', 'bundle\client.js')) {
    $path = Join-Path $pluginDir $needed
    if (-not (Test-Path $path)) { Die ('missing ' + $path + ' - is this the plugin repository root?') }
  }
  $manifest = Read-Json (Join-Path $pluginDir 'package.json')
  if ($manifest.name -ne $pkgName) { Die ('package.json name is ' + $manifest.name + ', expected ' + $pkgName) }
  Ok ('plugin ' + $manifest.name + ' ' + $manifest.version)

  Step '2/5  checking the target profile'
  if (-not (Test-Path $prof)) {
    Die ('profile not found: ' + $prof + ' - start DSH Desktop once so it creates the profile, then re-run')
  }
  if ($null -eq $pnpm) {
    Die ('pnpm not found. Looked for:' + [Environment]::NewLine + ($pnpmCandidates -join [Environment]::NewLine))
  }
  Ok ('profile  ' + $prof)
  Ok ('pnpm     ' + $pnpm)
  if ([string]::IsNullOrWhiteSpace($nodeExe)) {
    Log '  [warn] node.exe not found; falling back to invoking pnpm directly'
  } else {
    Ok ('node     ' + $nodeExe)
  }

  Step '3/5  making sure DSH is closed'
  if ($SkipProcessCheck) {
    Log '  [warn] -SkipProcessCheck: skipping the DSH process gate (dry run only)'
  } else {
    WaitForDshClosed
    Ok 'DSH is not running'
  }

  Step '4/5  installing'
  foreach ($f in @('package.json', 'pnpm-lock.yaml')) {
    $source = Join-Path $prof $f
    if (Test-Path $source) {
      Copy-Item $source (Join-Path $prof ($f + '.bak-' + $stamp)) -Force
      $backedUp = $true
    }
  }
  if ($backedUp) { Ok ('backed up package.json / pnpm-lock.yaml (suffix .bak-' + $stamp + ')') }

  $profRoot = (Resolve-Path -LiteralPath $prof).Path.TrimEnd($sep)
  $pluginFull = (Resolve-Path -LiteralPath $pluginDir).Path.TrimEnd($sep)
  Log ('  profile root : ' + $profRoot)
  Log ('  plugin root  : ' + $pluginFull)

  $vendor = Join-Path $prof ('vendor\' + $pkgName)

  function Copy-PluginInto($Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($item in @('package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'DESIGN.md', 'bundle', 'assets', 'src', 'tools')) {
      $from = Join-Path $pluginFull $item
      if (Test-Path -LiteralPath $from) {
        Copy-Item -LiteralPath $from -Destination $Destination -Recurse -Force
      }
    }
    # Drop any .git that came along with a directory copy. Its presence makes
    # pnpm treat the dependency as a git checkout and shell out to `git init`,
    # which fails outright in a restricted environment.
    Get-ChildItem -LiteralPath $Destination -Recurse -Force -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -eq '.git' } |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    Log ('  copied the plugin into ' + $Destination)
  }

  $relative = Get-RelativePath $profRoot $pluginFull
  $insideProfile = $false
  if (-not [string]::IsNullOrWhiteSpace($relative)) {
    $insideProfile = -not $relative.StartsWith('..')
  }
  if ($ForceVendorCopy) {
    $insideProfile = $false
    Log '  [warn] -ForceVendorCopy: using the vendor copy unconditionally'
  }

  $nodeModulesEntry = Join-Path $prof ('node_modules\' + $pkgName)
  $profileManifestPath = Join-Path $prof 'package.json'
  $profileManifest = Read-Json $profileManifestPath

  function Get-BundleList($Manifest) {
    $list = $Manifest.dsh.profile.bundles
    if ($null -eq $list) { return @() }
    return @($list)
  }

  function New-DirectoryJunction($LinkPath, $TargetPath) {
    # New-Item -ItemType Junction is blocked in some environments; mklink /J is
    # the same thing and goes through cmd, which is more consistently allowed.
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LinkPath) | Out-Null
    $output = & cmd /c mklink /J $LinkPath $TargetPath 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) { return $null }
    return ($output -join ' ')
  }

  # The manual route: register the dependency in the profile manifest and point
  # node_modules at the plugin with a directory junction. It is what pnpm's
  # `add` produces for a local dependency, minus the lockfile entry, and it does
  # not depend on pnpm or on git being usable.
  function Install-Manually($LinkTarget, $DepSpec) {
    if ($null -eq $profileManifest.dependencies) {
      $profileManifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $profileManifest.dependencies | Add-Member -NotePropertyName $pkgName -NotePropertyValue $DepSpec -Force

    $bundles = Get-BundleList $profileManifest
    if ($bundles -notcontains $pkgName) {
      $newBundles = @($bundles) + @($pkgName)
      if ($null -eq $profileManifest.dsh) {
        $profileManifest | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{ profile = [pscustomobject]@{ bundles = $newBundles } }) -Force
      } elseif ($null -eq $profileManifest.dsh.profile) {
        $profileManifest.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{ bundles = $newBundles }) -Force
      } else {
        $profileManifest.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $newBundles -Force
      }
      Log ('  added ' + $pkgName + ' to dsh.profile.bundles')
    }
    # Write the manifest back as UTF-8 WITHOUT a BOM: Set-Content -Encoding UTF8
    # in Windows PowerShell 5.1 prepends one, and a BOM can upset strict JSON
    # readers.
    $json = $profileManifest | ConvertTo-Json -Depth 32
    [System.IO.File]::WriteAllText($profileManifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Log '  updated the profile package.json'

    Remove-PathQuietly $nodeModulesEntry
    $linked = New-DirectoryJunction $nodeModulesEntry $LinkTarget
    if ($null -eq $linked) { Die ('could not create the node_modules junction at ' + $nodeModulesEntry) }
    Ok ('node_modules\' + $pkgName + ' -> ' + $LinkTarget)
  }

  function Invoke-PnpmAdd($Spec) {
    # pnpm is invoked through node.exe when available (see the header).
    if (-not [string]::IsNullOrWhiteSpace($nodeExe)) {
      $verb = $nodeExe
      $pnpmArgs = @($pnpm, '--dir', $prof, 'add', $Spec)
    } else {
      $verb = $pnpm
      $pnpmArgs = @('--dir', $prof, 'add', $Spec)
    }
    Log ('  running: ' + $verb + ' ' + ($pnpmArgs -join ' '))
    # Let pnpm write straight to the console: relaying a package manager's stdio
    # through a PowerShell pipeline can wedge the run and hides its progress.
    $global:LASTEXITCODE = 0
    & $verb @pnpmArgs
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    return $code
  }

  $pnpmExit = 1
  # Prefer pnpm. It is the documented path and it keeps the lockfile consistent.
  # Junction creation is blocked in restricted environments (and pnpm itself can
  # fail there because it shells out to git), so a failure here is not fatal:
  # the manual route below produces an equivalent local install.
  if ($null -ne $pnpm) {
    $pnpmSpec = 'file:./' + $(if ($insideProfile) { $relative } else { 'vendor/' + $pkgName })
    if (-not $insideProfile) {
      if ($ForceVendorCopy) { Log '  [warn] -ForceVendorCopy: copying the plugin into vendor' }
      Remove-PathQuietly $vendor
      Copy-PluginInto $vendor
    }
    $pnpmExit = Invoke-PnpmAdd $pnpmSpec
  } else {
    Log '  [note] pnpm not available; installing manually'
  }

  if ($pnpmExit -eq 0) {
    $installed = $true
    Ok 'pnpm add finished'
  } else {
    Log ('  [note] pnpm did not complete (exit ' + $pnpmExit + '); installing manually instead')
    # Restore the manifest first: pnpm may have left it half-written.
    $bak = Join-Path $prof ('package.json.bak-' + $stamp)
    if (Test-Path $bak) { Copy-Item $bak $profileManifestPath -Force }
    $profileManifest = Read-Json $profileManifestPath

    if ($insideProfile) {
      Install-Manually $pluginFull ('file:./' + $relative)
    } else {
      Remove-PathQuietly $vendor
      Copy-PluginInto $vendor
      Install-Manually $vendor ('file:./vendor/' + $pkgName)
    }
    $installed = $true
  }

  Step '5/5  verifying'
  $manifestAfter = Read-Json (Join-Path $prof 'package.json')
  $dep = $manifestAfter.dependencies.$pkgName
  if ([string]::IsNullOrWhiteSpace($dep)) { Die ($pkgName + ' is not listed in the profile dependencies') }
  Ok ('profile dependency: ' + $pkgName + ' = ' + $dep)

  $bundles = @($manifestAfter.dsh.profile.bundles)
  if ($bundles -notcontains $pkgName) {
    Die ($pkgName + ' is missing from dsh.profile.bundles; add it manually to ' + (Join-Path $prof 'package.json'))
  }
  Ok ('profile bundle list contains ' + $pkgName)

  $installedPkg = Join-Path $prof ('node_modules\' + $pkgName + '\package.json')
  if (-not (Test-Path $installedPkg)) { Die ('node_modules entry not found: ' + $installedPkg) }
  $installedManifest = Read-Json $installedPkg
  if ($installedManifest.dsh.bundle.patch -ne './cordis.patch.yml') { Die 'installed package does not declare dsh.bundle.patch' }
  Ok 'installed package declares dsh.bundle.patch'

  foreach ($half in @('bundle\host.js', 'bundle\client.js')) {
    $path = Join-Path $prof ('node_modules\' + $pkgName + '\' + $half)
    if (-not (Test-Path $path)) { Die ('installed package is missing ' + $half) }
  }
  Ok 'both halves (host + client) are present'

  Log ''
  Log '  INSTALLED'
  Log ('  log: ' + $logPath)
  Log ''
  Log '  Next steps:'
  Log '    1. start DSH Desktop'
  Log '    2. refresh the page (Ctrl+R)'
  Log '    3. open a conversation - the launcher appears at the bottom right'
  Log ''
  Log '  Rollback (if you want to undo it):'
  Log ('    node "' + $pnpm + '" --dir "' + $prof + '" remove ' + $pkgName)
  Log ('    then restore package.json from package.json.bak-' + $stamp)
  Log ''
} catch {
  Log ''
  Log ('  FAILED: ' + $_.Exception.Message)
  if (-not $installed -and $backedUp) {
    Log '  rolling back the manifest changes...'
    Restore-Backups
  }
  Log ('  log: ' + $logPath)
  exit 1
}
