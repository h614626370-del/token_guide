param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$ImageRepository = "614626370/kkflow-guide",
  [string]$GithubRepo = "h614626370-del/token_guide",
  [string]$TargetCommitish = "main",
  [switch]$SkipBuild,
  [switch]$SkipPush,
  [switch]$SkipGithubRelease,
  [switch]$NoLatest,
  [switch]$NativeDocker
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Missing required command: $Name" }
}

function Invoke-Docker {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  if ($NativeDocker) { & docker @Args } else { & wsl docker @Args }
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($Args -join ' ')" }
}

if ($Version -notmatch '^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$') {
  throw "Version must look like v2.0.0."
}
if ($ImageRepository -notmatch '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$') { throw "ImageRepository is invalid." }
if ($GithubRepo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw "GithubRepo is invalid." }

if ($NativeDocker) { Require-Command docker } else { Require-Command wsl }
if (-not $SkipGithubRelease) { Require-Command gh }

$tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
$imageRef = "${ImageRepository}:$tag"
$latestRef = "${ImageRepository}:latest"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($NativeDocker) {
  $buildRoot = $repoRoot
  $dockerfile = Join-Path $repoRoot 'Dockerfile'
}
else {
  $resolved = (Resolve-Path -LiteralPath $repoRoot).Path
  $drive = $resolved.Substring(0, 1).ToLowerInvariant()
  $rest = $resolved.Substring(2).Replace([char]92, [char]47)
  $buildRoot = "/mnt/$drive$rest"
  $dockerfile = "$buildRoot/Dockerfile"
}

if ($SkipBuild) {
  Invoke-Docker image inspect $imageRef
}
else {
  $args = @('build', '--platform', 'linux/amd64', '-f', $dockerfile, '-t', $imageRef)
  if (-not $NoLatest) { $args += @('-t', $latestRef) }
  $args += $buildRoot
  Invoke-Docker @args
}

if (-not $SkipPush) {
  Invoke-Docker push $imageRef
  if (-not $NoLatest) { Invoke-Docker push $latestRef }
}

if ($SkipGithubRelease) { exit 0 }

$installUrl = "https://raw.githubusercontent.com/$GithubRepo/$TargetCommitish/scripts/install-guide.sh"
$notes = @"
Unified guide application image: $imageRef

Install or upgrade:

curl -fsSL $installUrl | bash -s -- --version $tag --image $ImageRepository
"@
$notesPath = Join-Path ([IO.Path]::GetTempPath()) "kkflow-guide-$tag.md"
Set-Content -LiteralPath $notesPath -Value $notes -Encoding utf8

& gh release view $tag --repo $GithubRepo *> $null
if ($LASTEXITCODE -eq 0) {
  & gh release edit $tag --repo $GithubRepo --title "kkflow-guide $tag" --notes-file $notesPath
}
else {
  & gh release create $tag --repo $GithubRepo --target $TargetCommitish --title "kkflow-guide $tag" --notes-file $notesPath
}
if ($LASTEXITCODE -ne 0) { throw "GitHub release failed." }
