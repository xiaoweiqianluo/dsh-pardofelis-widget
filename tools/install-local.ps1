# ============================================================================
#  dsh-pardofelis-widget - DSH Desktop 本地安装脚本（Windows）
#
#  用法
#    右键本文件 ->「使用 PowerShell 运行」
#    或：powershell -ExecutionPolicy Bypass -File "<本文件路径>"
#
#  这个脚本做什么
#    1. 等待 DSH Desktop 完全退出。安装会重写 profile 的 node_modules，
#       DSH 运行期间读取它是不安全的。PowerShell 窗口独立于 DSH，
#       退出 DSH 不会关掉本窗口 —— 回到这里按回车即可继续。
#    2. 备份 profile 的 package.json 与 pnpm-lock.yaml。
#    3. 把插件目录链接到 <profile>\vendor\ 下，再执行
#         pnpm add "file:./vendor/dsh-pardofelis-widget"
#    4. 校验依赖已登记、包能解析、并声明了 dsh.bundle.patch 且两半都在。
#    5. 若 pnpm 本身失败，从备份还原 package.json 与 pnpm-lock.yaml，
#       并移除半个链接的 node_modules 条目，保证失败不留残留。
#       pnpm 一旦成功就不再回滚清单 —— 回滚会让 node_modules 变成孤儿，
#       比「校验失败」更糟。
#
#  为什么用相对 spec
#    pnpm 会把 file: 说明符拼到 profile 目录上，而不是当成绝对路径
#    （path.join 不认第二个参数里的 Windows 盘符）。传绝对路径会得到
#      ENOENT scandir 'C:\...\profiles\desktop\F:\<插件目录>'
#    相对说明符不会被误读，但它必须与 profile 同盘（C:），而仓库常常在别的盘。
#    于是先在 profile 内建一个目录联接（junction）把两边接上 ——
#    与符号链接不同，junction 不需要管理员权限。
#
#  两个 PowerShell 陷阱
#    1. 本文件刻意只用 ASCII。Windows PowerShell 5.1 会把无 BOM 的 UTF-8
#       脚本按 ANSI 读取，非 ASCII 文本会变成乱码，硬编码的非 ASCII 路径
#       会直接失效。插件目录由本脚本自身位置推导，因此不需要写中文路径。
#    2. 每个 JSON 文件都用 [System.IO.File]::ReadAllText 配显式 UTF-8 读取。
#       Get-Content -Raw 对无 BOM 的 UTF-8 会用 ANSI 代码页，会把插件描述里的
#       中文变成乱码、破坏引号，最终让 ConvertFrom-Json 抛错。
# ============================================================================

param(
  # 跳过所有交互，遇到问题直接失败。用于自动化检查。
  [switch]$Unattended
)

$ErrorActionPreference = 'Stop'

$logPath = Join-Path $env:TEMP ('dsh-pardofelis-install-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

function Log($m) {
  Write-Host $m
  try { Add-Content -LiteralPath $logPath -Value $m -ErrorAction SilentlyContinue } catch { }
}
function Ok($m)   { Log ('  [ok]   ' + $m) }
function Step($m) { Log ''; Log $m }
function Die($m)  { throw $m }

# 无论有无 BOM 都按 UTF-8 读 JSON
function Read-Json($path) {
  return ([System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
}

$pluginDir = Split-Path -Parent $PSScriptRoot
$pkgName   = 'dsh-pardofelis-widget'

# profile 目录：优先 DSH_HOME 环境变量，否则用默认的 %USERPROFILE%\.dsh
$dshHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($dshHome)) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
$profileName = $env:DSH_PROFILE
if ([string]::IsNullOrWhiteSpace($profileName)) { $profileName = 'desktop' }
$prof = Join-Path $dshHome ('profiles\' + $profileName)

# pnpm：优先用 DSH 自带的运行时
$pnpmCandidates = @(
  (Join-Path $dshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'),
  (Join-Path $prof '.desktop-bin\pnpm.cmd')
)
$pnpm = $null
foreach ($candidate in $pnpmCandidates) {
  if (Test-Path $candidate) { $pnpm = $candidate; break }
}

$stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$backedUp  = $false
$installed = $false
$failure   = $null

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
  # pnpm 可能留下半个链接，清掉，让重跑从干净状态开始
  $entry = Join-Path $prof ('node_modules\' + $pkgName)
  if (Test-Path $entry) {
    Remove-Item $entry -Recurse -Force -ErrorAction SilentlyContinue
    Log ('  removed the half-linked ' + $entry)
  }
  $vendor = Join-Path $prof ('vendor\' + $pkgName)
  if (Test-Path $vendor) {
    Remove-Item $vendor -Recurse -Force -ErrorAction SilentlyContinue
    Log ('  removed the vendor junction ' + $vendor)
  }
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

  Step '3/5  making sure DSH is closed'
  WaitForDshClosed
  Ok 'DSH is not running'

  Step '4/5  installing'
  foreach ($f in @('package.json', 'pnpm-lock.yaml')) {
    $source = Join-Path $prof $f
    if (Test-Path $source) {
      Copy-Item $source (Join-Path $prof ($f + '.bak-' + $stamp)) -Force
      $backedUp = $true
    }
  }
  if ($backedUp) { Ok ('backed up package.json / pnpm-lock.yaml (suffix .bak-' + $stamp + ')') }

  # 在 profile 内建 junction，指向真实插件目录，然后把相对 spec 交给 pnpm
  $vendor = Join-Path $prof ('vendor\' + $pkgName)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $vendor) | Out-Null
  if (Test-Path $vendor) { Remove-Item $vendor -Recurse -Force }
  New-Item -ItemType Junction -Path $vendor -Target $pluginDir | Out-Null
  Ok ('linked ' + $vendor + ' -> ' + $pluginDir)

  $spec = 'file:./vendor/' + $pkgName
  $pnpmArgs = @()
  if ($pnpm.EndsWith('.mjs')) {
    $pnpmArgs += $pnpm
    $pnpmCmd = 'node'
  } else {
    $pnpmCmd = $pnpm
  }
  $pnpmArgs += @('--dir', $prof, 'add', $spec)

  Log ('  running: ' + $pnpmCmd + ' ' + ($pnpmArgs -join ' '))
  & $pnpmCmd @pnpmArgs 2>&1 | ForEach-Object { Log ('    ' + $_) }
  if ($LASTEXITCODE -ne 0) { Die ('pnpm exited with code ' + $LASTEXITCODE) }
  $installed = $true
  Ok 'pnpm add finished'

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
  $failure = $_
  Log ''
  Log ('  FAILED: ' + $_.Exception.Message)
  if (-not $installed -and $backedUp) {
    Log '  rolling back the manifest changes...'
    Restore-Backups
  }
  Log ('  log: ' + $logPath)
  exit 1
}
