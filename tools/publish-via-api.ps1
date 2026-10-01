# ============================================================================
#  Publish the current commit to GitHub through the REST API.
#
#  Why this exists: in this environment `git push` over HTTPS keeps failing with
#  "Connection was reset" while the GitHub API is reachable. Rather than hand the
#  user a half-published repository, this publishes the same commit through the
#  API - and verifies it three ways, so "same content" is proven rather than
#  assumed:
#
#    1. every uploaded blob's SHA must equal the local git object's SHA
#    2. the resulting tree's SHA must equal the local commit's tree SHA
#    3. the commit is rebuilt with the identical author, committer and dates, so
#       even the commit SHA should come out the same
#
#  IMPORTANT: content is read out of the git object store (via `git archive`),
#  never from the working tree. The repo sets `* text=auto eol=lf`, so files on
#  disk can legitimately differ from what was committed, and uploading the disk
#  copy would silently change bytes.
#
#  ASCII-only on purpose: Windows PowerShell 5.1 mis-decodes non-ASCII in a
#  BOM-less script.
#
#  Usage: powershell -ExecutionPolicy Bypass -File tools\publish-via-api.ps1
# ============================================================================

param(
  [string]$Owner = 'xiaoweiqianluo',
  [string]$Repo = 'dsh-pardofelis-widget',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Say($m) { Write-Host $m }
function Utf8NoBom([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}
# Retry wrapper. The network to GitHub from this machine is intermittent:
# TLS handshake timeouts and "connection reset" come and go, so a single
# attempt is not a reliable signal of failure.
function ApiJson([string]$Method, [string]$Endpoint, [string]$BodyFile) {
  # The link to GitHub from this machine times out often enough that a handful of
  # retries is not enough; blobs and trees regularly need five or more attempts.
  $attempts = 14
  for ($i = 1; $i -le $attempts; $i++) {
    $apiArgs = @('api', '--method', $Method, $Endpoint)
    if (-not [string]::IsNullOrWhiteSpace($BodyFile)) { $apiArgs += @('--input', $BodyFile) }
    # gh writes its failures to stderr, and with $ErrorActionPreference = 'Stop'
    # PowerShell 5.1 turns a native command's stderr line into a terminating error
    # before the retry loop ever sees it. Relax the preference for the call only.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $raw = & gh @apiArgs 2>&1
      $code = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previous
    }
    if ($code -eq 0) {
      return ($raw | Out-String | ConvertFrom-Json)
    }
    $text = ($raw | Out-String).Trim()
    Say ('  [retry ' + $i + '/' + $attempts + '] ' + $Method + ' ' + $Endpoint + ' -> ' + $text.Split("`n")[0])
    if ($i -eq $attempts) { throw ("gh api failed after " + $attempts + ' attempts: ' + $Method + ' ' + $Endpoint + ' :: ' + $text) }
    Start-Sleep -Seconds ([Math]::Min(20, 2 * $i))
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
$scratch = Join-Path $repoRoot '.scratch'
New-Item -ItemType Directory -Force -Path $scratch | Out-Null

$head = (git rev-parse HEAD).Trim()
$parent = (git rev-parse 'HEAD^').Trim()
$localTree = (git rev-parse 'HEAD^{tree}').Trim()
$parentTree = (git rev-parse ($parent + '^{tree}')).Trim()
$message = (git log -1 --format=%B) -join "`n"
$authorName = (git log -1 --format=%an).Trim()
$authorEmail = (git log -1 --format=%ae).Trim()
$authorDate = (git log -1 --format=%aI).Trim()
$committerName = (git log -1 --format=%cn).Trim()
$committerEmail = (git log -1 --format=%ce).Trim()
$committerDate = (git log -1 --format=%cI).Trim()

Say ''
Say 'publish-via-api'
Say ('-' * 60)
Say ('commit      ' + $head)
Say ('parent      ' + $parent)
Say ('local tree  ' + $localTree)
Say ('message     ' + ($message.Split("`n")[0]))

# --- export the committed content -------------------------------------------------
$zip = Join-Path $scratch 'publish.zip'
$extract = Join-Path $scratch 'publish'
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
& git archive HEAD -o $zip
if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
Expand-Archive -Path $zip -DestinationPath $extract -Force
Say ('exported    ' + $extract)

# --- upload every changed file as a blob, verifying each SHA ----------------------
$changed = @(& git -c core.quotepath=false diff --name-only HEAD^ HEAD)
Say ('changed     ' + $changed.Count + ' files')
$entries = @()
$blobBody = Join-Path $scratch 'blob.json'
foreach ($name in $changed) {
  $onDisk = Join-Path $extract ($name -replace '/', '\')
  if (-not (Test-Path -LiteralPath $onDisk)) {
    # A file listed by the diff but absent from the export was DELETED by this
    # commit. Deleting a path in the API's tree means sending sha = null.
    # (First run of this script treated that as an error and aborted - it had
    # never been asked to publish a deletion.)
    $entries += @{ path = $name; mode = '100644'; type = 'blob'; sha = $null }
    Say ('  delete  ' + $name)
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes($onDisk)
  $payload = @{
    content  = [System.Convert]::ToBase64String($bytes)
    encoding = 'base64'
  } | ConvertTo-Json -Compress
  Utf8NoBom $blobBody $payload
  $blob = ApiJson 'POST' ("/repos/" + $Owner + '/' + $Repo + '/git/blobs') $blobBody
  $localBlob = (& git rev-parse ('HEAD:' + $name)).Trim()
  if ($blob.sha -ne $localBlob) {
    throw ('blob mismatch for ' + $name + ' remote=' + $blob.sha + ' local=' + $localBlob)
  }
  $entries += @{ path = $name; mode = '100644'; type = 'blob'; sha = $blob.sha }
  Say ('  blob  ' + $blob.sha.Substring(0, 10) + '  ' + $name + '  (' + $bytes.Length + ' bytes)')
}

# --- build the tree and verify its SHA -------------------------------------------
$treeBody = Join-Path $scratch 'tree.json'
Utf8NoBom $treeBody (@{
  base_tree = $parentTree
  tree      = $entries
} | ConvertTo-Json -Depth 6 -Compress)
$tree = ApiJson 'POST' ("/repos/" + $Owner + '/' + $Repo + '/git/trees') $treeBody
if ($tree.sha -ne $localTree) {
  throw ('tree mismatch: remote=' + $tree.sha + ' local=' + $localTree)
}
Say ('tree  OK    ' + $tree.sha + '  (matches the local commit exactly)')

# --- create the commit -----------------------------------------------------------
$commitBody = Join-Path $scratch 'commit.json'
Utf8NoBom $commitBody (@{
  message   = $message
  tree      = $tree.sha
  parents   = @($parent)
  author    = @{ name = $authorName; email = $authorEmail; date = $authorDate }
  committer = @{ name = $committerName; email = $committerEmail; date = $committerDate }
} | ConvertTo-Json -Depth 6 -Compress)
$commit = ApiJson 'POST' ("/repos/" + $Owner + '/' + $Repo + '/git/commits') $commitBody
Say ('commit      ' + $commit.sha)
if ($commit.sha -eq $head) {
  Say '            (identical SHA to the local commit - author, dates and tree all matched)'
} else {
  Say ('            note: SHA differs from local ' + $head + ' but the tree is identical')
}

# --- move the branch --------------------------------------------------------------
$refBody = Join-Path $scratch 'ref.json'
Utf8NoBom $refBody (@{ sha = $commit.sha; force = $false } | ConvertTo-Json -Compress)
$ref = ApiJson 'PATCH' ("/repos/" + $Owner + '/' + $Repo + '/git/refs/heads/' + $Branch) $refBody
Say ('ref         ' + $ref.ref + ' -> ' + $ref.object.sha)

# --- confirm ---------------------------------------------------------------------
$check = ApiJson 'GET' ("/repos/" + $Owner + '/' + $Repo + '/git/ref/heads/' + $Branch) $null
Say ''
if ($check.object.sha -eq $commit.sha) {
  Say ('PUBLISHED   ' + $Branch + ' is now at ' + $check.object.sha)
} else {
  throw ('ref did not move as expected: ' + $check.object.sha)
}
