param(
  [switch]$Key,
  [string]$HostName = "xiaoji",
  [string]$User = "root",
  [int]$Port = 22,
  [string]$RemoteDir = "/www/wwwroot/guide",
  [string]$KeyPath = "$HOME\.ssh\xiaoji_ed25519"
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Quote-RemotePath {
  param([string]$Path)

  return "'" + $Path.Replace("'", "'\''") + "'"
}

Require-Command ssh
Require-Command scp

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = "${User}@${HostName}"
$sshArgs = @("-p", "$Port")

if ($Key) {
  Require-Command ssh-keygen

  $sshDir = Split-Path -Parent $KeyPath
  if (-not (Test-Path -LiteralPath $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir | Out-Null
  }

  if (-not (Test-Path -LiteralPath $KeyPath)) {
    ssh-keygen -t ed25519 -f $KeyPath -N "" -C "$env:USERNAME@$env:COMPUTERNAME"
  }

  $publicKeyPath = "$KeyPath.pub"
  if (-not (Test-Path -LiteralPath $publicKeyPath)) {
    throw "Public key not found: $publicKeyPath"
  }

  $publicKey = Get-Content -Raw -LiteralPath $publicKeyPath
  $encodedKey = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publicKey.Trim()))
  $remoteCommand = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && KEY=`$(printf %s $encodedKey | base64 -d) && grep -qxF `"`$KEY`" ~/.ssh/authorized_keys || printf '%s\n' `"`$KEY`" >> ~/.ssh/authorized_keys"

  Write-Host "Configuring passwordless SSH for $target ..."
  ssh @sshArgs $target $remoteCommand
  Write-Host "Done. Test with: ssh -p $Port $target"
  exit 0
}

Push-Location $repoRoot
try {
  Write-Host "Building VitePress guide site ..."
  npm run docs:build
}
finally {
  Pop-Location
}

$distDir = Join-Path $repoRoot "dist\guide"
if (-not (Test-Path -LiteralPath $distDir)) {
  throw "Build output not found: $distDir"
}

$remoteDirQuoted = Quote-RemotePath $RemoteDir
$remotePrepare = "mkdir -p $remoteDirQuoted && find $remoteDirQuoted -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +"

Write-Host "Clearing remote directory: $RemoteDir"
ssh @sshArgs $target $remotePrepare

Write-Host "Uploading dist contents to ${target}:$RemoteDir ..."
$items = Get-ChildItem -Force -LiteralPath $distDir
if (-not $items) {
  throw "Build output is empty: $distDir"
}

foreach ($item in $items) {
  scp -P $Port -r $item.FullName "${target}:$RemoteDir/"
}

Write-Host "Deploy complete: https://$HostName/guide/"
