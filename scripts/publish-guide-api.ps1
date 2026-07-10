param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$ImageRepository = "614626370/kkflow-guide-api",
  [string]$GithubRepo = "h614626370-del/token_guide",
  [string]$TargetCommitish = "main",
  [switch]$SkipBuild,
  [switch]$SkipPush,
  [switch]$SkipGithubRelease,
  [switch]$NoLatest
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Invoke-Wsl {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

  & wsl @Args
  if ($LASTEXITCODE -ne 0) {
    throw "wsl command failed: $($Args -join ' ')"
  }
}

function Invoke-Gh {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

  & gh @Args
  if ($LASTEXITCODE -ne 0) {
    throw "gh command failed: $($Args -join ' ')"
  }
}

function To-WslPath {
  param([string]$Path)

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $drive = $resolved.Substring(0, 1).ToLowerInvariant()
  $rest = $resolved.Substring(2).Replace([char]92, [char]47)
  return "/mnt/$drive$rest"
}

if ($Version -notmatch "^v?\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$") {
  throw "Version must look like v1.2.3 or 1.2.3."
}
if ($ImageRepository -notmatch "^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$") {
  throw "ImageRepository must look like namespace/repository, for example 614626370/kkflow-guide-api."
}
if ($GithubRepo -notmatch "^[^/]+/[^/]+$") {
  throw "GithubRepo must look like owner/repo."
}

$tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
$imageRef = "${ImageRepository}:$tag"
$latestRef = "${ImageRepository}:latest"
$repoRoot = Split-Path -Parent $PSScriptRoot
$repoRootWsl = To-WslPath $repoRoot
$dockerfileWsl = "$repoRootWsl/apps/guide-api/Dockerfile"

if (-not $SkipBuild -or -not $SkipPush) {
  Require-Command wsl
}
if (-not $SkipGithubRelease) {
  Require-Command gh
}

if ($SkipBuild) {
  Write-Host "SkipBuild enabled. Reusing local Docker image: $imageRef"
  Invoke-Wsl docker image inspect $imageRef
}
else {
  Write-Host "Building Docker image in WSL: $imageRef"
  $buildArgs = @(
    "docker", "build",
    "--platform", "linux/amd64",
    "-f", $dockerfileWsl,
    "-t", $imageRef
  )
  if (-not $NoLatest) {
    $buildArgs += @("-t", $latestRef)
  }
  $buildArgs += $repoRootWsl
  Invoke-Wsl @buildArgs
}

if ($SkipPush) {
  Write-Host "SkipPush enabled. Docker image push was skipped."
}
else {
  Write-Host "Pushing Docker image: $imageRef"
  Invoke-Wsl docker push $imageRef
  if (-not $NoLatest) {
    Write-Host "Pushing Docker image: $latestRef"
    Invoke-Wsl docker push $latestRef
  }
}

if ($SkipGithubRelease) {
  Write-Host "SkipGithubRelease enabled. GitHub release was skipped."
  exit 0
}

$installUrl = "https://raw.githubusercontent.com/$GithubRepo/$TargetCommitish/scripts/install-guide-api.sh"
$releaseBody = @"
Guide API Docker image has been published to Docker Hub.

Docker image:
$imageRef

Install or upgrade on server:
curl -fsSL $installUrl | bash -s -- --version $tag --image $ImageRepository
"@

$notesPath = Join-Path ([System.IO.Path]::GetTempPath()) "guide-api-$tag-release-notes.md"
Set-Content -LiteralPath $notesPath -Value $releaseBody -Encoding utf8

Write-Host "Creating or updating GitHub release: $GithubRepo@$tag"
& gh release view $tag --repo $GithubRepo *> $null
if ($LASTEXITCODE -eq 0) {
  Invoke-Gh release edit $tag --repo $GithubRepo --title "guide-api $tag" --notes-file $notesPath
}
else {
  Invoke-Gh release create $tag --repo $GithubRepo --target $TargetCommitish --title "guide-api $tag" --notes-file $notesPath
}

Write-Host "Release complete: https://github.com/$GithubRepo/releases/tag/$tag"
