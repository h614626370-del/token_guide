param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$Owner = "readhou",
  [string]$Repo = "token_guide",
  [string]$ImageName = "kkflow-guide-api",
  [string]$GiteeToken = $env:GITEE_TOKEN,
  [string]$GiteeApiBase = "https://gitee.com/api/v5",
  [switch]$SkipUpload
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

function To-WslPath {
  param([string]$Path)

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $drive = $resolved.Substring(0, 1).ToLowerInvariant()
  $rest = $resolved.Substring(2).Replace([char]92, [char]47)
  return "/mnt/$drive$rest"
}

function New-GiteeRelease {
  param(
    [string]$TagName,
    [string]$Name,
    [string]$Body
  )

  $uri = "$GiteeApiBase/repos/$Owner/$Repo/releases"
  $bodyObject = @{
    access_token = $GiteeToken
    tag_name = $TagName
    name = $Name
    body = $Body
    prerelease = $false
  }

  try {
    return Invoke-RestMethod -Method Post -Uri $uri -Body $bodyObject
  }
  catch {
    $errorText = $_.ErrorDetails.Message
    if ($errorText -match "already|exist") {
      $encodedTag = [Uri]::EscapeDataString($TagName)
      $releaseByTagUri = "{0}/repos/{1}/{2}/releases/tags/{3}?access_token={4}" -f $GiteeApiBase, $Owner, $Repo, $encodedTag, $GiteeToken
      return Invoke-RestMethod -Method Get -Uri $releaseByTagUri
    }
    throw
  }
}

function Upload-GiteeReleaseAsset {
  param(
    [string]$ReleaseId,
    [string]$FilePath
  )

  $uri = "{0}/repos/{1}/{2}/releases/{3}/attach_files?access_token={4}" -f $GiteeApiBase, $Owner, $Repo, $ReleaseId, $GiteeToken
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) {
    throw "curl.exe is required to upload release assets."
  }

  & $curl.Source -fsS -X POST -F "file=@$FilePath" $uri
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload release asset: $FilePath"
  }
}

if ($Version -notmatch "^v?\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$") {
  throw "Version must look like v1.2.3 or 1.2.3."
}

$tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactsDir = Join-Path $repoRoot "artifacts\guide-api"
$imageTag = "${ImageName}:$tag"
$tarName = "guide-api-$tag-linux-amd64.docker.tar"
$tarPath = Join-Path $artifactsDir $tarName
$gzPath = "$tarPath.gz"
$shaPath = "$gzPath.sha256"

Require-Command wsl
if (-not $SkipUpload -and [string]::IsNullOrWhiteSpace($GiteeToken)) {
  throw "GITEE_TOKEN is required unless -SkipUpload is used."
}

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

$repoRootWsl = To-WslPath $repoRoot
$tarPathWsl = To-WslPath $artifactsDir

Write-Host "Building Docker image in WSL: $imageTag"
Invoke-Wsl docker build --platform linux/amd64 -f "$repoRootWsl/apps/guide-api/Dockerfile" -t $imageTag "$repoRootWsl"

Write-Host "Saving image archive: $tarName"
$saveCommand = 'mkdir -p "{0}" && docker save "{1}" -o "{0}/{2}" && gzip -f "{0}/{2}" && sha256sum "{0}/{2}.gz" > "{0}/{2}.gz.sha256"' -f $tarPathWsl, $imageTag, $tarName
Invoke-Wsl sh -lc $saveCommand

if (-not (Test-Path -LiteralPath $gzPath)) {
  throw "Image archive was not created: $gzPath"
}

Write-Host "Created:"
Write-Host "  $gzPath"
Write-Host "  $shaPath"

if ($SkipUpload) {
  Write-Host "SkipUpload enabled. Release asset upload was skipped."
  exit 0
}

$releaseBody = @"
Guide API Docker image package.

Install or upgrade on server:

curl -fsSL https://gitee.com/$Owner/$Repo/raw/main/scripts/install-guide-api.sh | bash -s -- --version $tag --owner $Owner --repo $Repo
"@

Write-Host "Creating or reusing Gitee release: $tag"
$release = New-GiteeRelease -TagName $tag -Name "guide-api $tag" -Body $releaseBody
$releaseId = if ($release.id) { $release.id } elseif ($release.number) { $release.number } else { $release.tag_name }
if (-not $releaseId) {
  throw "Could not determine Gitee release id from response."
}

Write-Host "Uploading assets to release $releaseId ..."
Upload-GiteeReleaseAsset -ReleaseId $releaseId -FilePath $gzPath
Upload-GiteeReleaseAsset -ReleaseId $releaseId -FilePath $shaPath

Write-Host "Release complete: https://gitee.com/$Owner/$Repo/releases/tag/$tag"
