param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$Owner = "readhou",
  [string]$Repo = "token_guide",
  [string]$TargetCommitish = "main",
  [string]$ImageName = "kkflow-guide-api",
  [string]$GiteeToken = $env:GITEE_TOKEN,
  [string]$GiteeApiBase = "https://gitee.com/api/v5",
  [int]$AssetPartSizeMB = 95,
  [switch]$SkipBuild,
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
    target_commitish = $TargetCommitish
    name = $Name
    body = $Body
    prerelease = $false
  }

  try {
    return Invoke-RestMethod -Method Post -Uri $uri -Body $bodyObject
  }
  catch {
    $originalError = $_
    $encodedTag = [Uri]::EscapeDataString($TagName)
    $releaseByTagUri = "{0}/repos/{1}/{2}/releases/tags/{3}?access_token={4}" -f $GiteeApiBase, $Owner, $Repo, $encodedTag, $GiteeToken
    try {
      return Invoke-RestMethod -Method Get -Uri $releaseByTagUri
    }
    catch {
      throw $originalError
    }
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

function Split-FileIntoParts {
  param(
    [string]$FilePath,
    [int64]$PartSizeBytes
  )

  $partDir = "$FilePath.parts"
  if (Test-Path -LiteralPath $partDir) {
    Remove-Item -LiteralPath $partDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $partDir | Out-Null

  $buffer = New-Object byte[] (1024 * 1024)
  $inputStream = [System.IO.File]::OpenRead($FilePath)
  $parts = New-Object System.Collections.Generic.List[string]
  try {
    $partIndex = 1
    while ($inputStream.Position -lt $inputStream.Length) {
      $partName = "{0}.part-{1:D3}" -f (Split-Path -Leaf $FilePath), $partIndex
      $partPath = Join-Path $partDir $partName
      $outputStream = [System.IO.File]::Open($partPath, [System.IO.FileMode]::CreateNew)
      try {
        $remaining = $PartSizeBytes
        while ($remaining -gt 0 -and $inputStream.Position -lt $inputStream.Length) {
          $readSize = [Math]::Min($buffer.Length, $remaining)
          $read = $inputStream.Read($buffer, 0, [int]$readSize)
          if ($read -le 0) { break }
          $outputStream.Write($buffer, 0, $read)
          $remaining -= $read
        }
      }
      finally {
        $outputStream.Dispose()
      }
      $parts.Add($partPath)
      $partIndex += 1
    }
  }
  finally {
    $inputStream.Dispose()
  }

  return $parts.ToArray()
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
$manifestPath = "$gzPath.parts.txt"

if (-not $SkipBuild) {
  Require-Command wsl
}
if (-not $SkipUpload -and [string]::IsNullOrWhiteSpace($GiteeToken)) {
  throw "GITEE_TOKEN is required unless -SkipUpload is used."
}

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

if ($SkipBuild) {
  Write-Host "SkipBuild enabled. Reusing existing archive:"
  Write-Host "  $gzPath"
  Write-Host "  $shaPath"
}
else {
  $repoRootWsl = To-WslPath $repoRoot
  $tarPathWsl = To-WslPath $artifactsDir

  Write-Host "Building Docker image in WSL: $imageTag"
  Invoke-Wsl docker build --platform linux/amd64 -f "$repoRootWsl/apps/guide-api/Dockerfile" -t $imageTag "$repoRootWsl"

  Write-Host "Saving image archive: $tarName"
  $saveCommand = 'mkdir -p "{0}" && docker save "{1}" -o "{0}/{2}" && gzip -f "{0}/{2}" && sha256sum "{0}/{2}.gz" > "{0}/{2}.gz.sha256"' -f $tarPathWsl, $imageTag, $tarName
  Invoke-Wsl sh -lc $saveCommand
}

if (-not (Test-Path -LiteralPath $gzPath)) {
  throw "Image archive was not created: $gzPath"
}
if (-not (Test-Path -LiteralPath $shaPath)) {
  throw "Checksum file was not created: $shaPath"
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

Write-Host "Preparing release assets ..."
$assetPartSizeBytes = [int64]$AssetPartSizeMB * 1024 * 1024
$gzItem = Get-Item -LiteralPath $gzPath
if ($gzItem.Length -gt $assetPartSizeBytes) {
  Write-Host "Archive is larger than $AssetPartSizeMB MB. Splitting before upload ..."
  $parts = Split-FileIntoParts -FilePath $gzPath -PartSizeBytes $assetPartSizeBytes
  $partNames = $parts | ForEach-Object { Split-Path -Leaf $_ }
  Set-Content -LiteralPath $manifestPath -Value $partNames -Encoding ascii
  Write-Host "Uploading manifest and $($parts.Count) parts to release $releaseId ..."
  Upload-GiteeReleaseAsset -ReleaseId $releaseId -FilePath $manifestPath
  foreach ($part in $parts) {
    Upload-GiteeReleaseAsset -ReleaseId $releaseId -FilePath $part
  }
}
else {
  Write-Host "Uploading archive to release $releaseId ..."
  Upload-GiteeReleaseAsset -ReleaseId $releaseId -FilePath $gzPath
}
Upload-GiteeReleaseAsset -ReleaseId $releaseId -FilePath $shaPath

Write-Host "Release complete: https://gitee.com/$Owner/$Repo/releases/tag/$tag"
