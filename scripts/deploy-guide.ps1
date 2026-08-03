param(
  [switch]$Key,
  [switch]$SkipVerify,
  [string]$HostName = "xiaoji",
  [string]$User = "root",
  [int]$SshPort = 22,
  [string]$InstallDir = "/www/kkflow-guide",
  [string]$Version = "latest",
  [string]$ImageRepository = "614626370/kkflow-guide",
  [string]$GithubRepo = "h614626370-del/token_guide",
  [string]$SiteUrl = "https://guide.kkflow.org",
  [string]$Sub2apiOrigin = "https://kkflow.org",
  [int]$AppPort = 3000,
  [string]$KeyPath = "$HOME\.ssh\xiaoji_ed25519"
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command ssh

if ($HostName -notmatch '^[A-Za-z0-9._-]+$' -or $User -notmatch '^[A-Za-z0-9._-]+$') {
  throw "HostName or User contains unsupported characters."
}
if ($InstallDir -notmatch '^/[A-Za-z0-9._/-]+$') {
  throw "InstallDir must be an absolute path containing only letters, numbers, dot, underscore, slash, and dash."
}
if ($Version -notmatch '^(latest|v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?)$') {
  throw "Version must be latest or a semantic version."
}
if ($ImageRepository -notmatch '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$') {
  throw "ImageRepository is invalid."
}
if ($GithubRepo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
  throw "GithubRepo is invalid."
}
foreach ($value in @($SiteUrl, $Sub2apiOrigin)) {
  $uri = [Uri]$value
  if ($uri.Scheme -ne 'https' -or -not $uri.Host) { throw "Public origins must use HTTPS." }
}

$target = "${User}@${HostName}"
$sshArgs = @('-p', "$SshPort")

if ($Key) {
  Require-Command ssh-keygen
  $sshDir = Split-Path -Parent $KeyPath
  if (-not (Test-Path -LiteralPath $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir | Out-Null
  }
  if (-not (Test-Path -LiteralPath $KeyPath)) {
    ssh-keygen -t ed25519 -f $KeyPath -N "" -C "$env:USERNAME@$env:COMPUTERNAME"
  }
  $publicKey = (Get-Content -Raw -LiteralPath "$KeyPath.pub").Trim()
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publicKey))
  $command = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && K=`$(printf %s '$encoded' | base64 -d) && grep -qxF `"`$K`" ~/.ssh/authorized_keys || printf '%s\n' `"`$K`" >> ~/.ssh/authorized_keys"
  ssh @sshArgs $target $command
  exit $LASTEXITCODE
}

if (-not $SkipVerify) {
  $repoRoot = Split-Path -Parent $PSScriptRoot
  Push-Location $repoRoot
  try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }
    npm test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
  }
  finally {
    Pop-Location
  }
}

$installUrl = "https://raw.githubusercontent.com/$GithubRepo/main/scripts/install-guide.sh"
$remote = "mkdir -p '$InstallDir' && cd '$InstallDir' && curl -fsSL '$installUrl' | bash -s -- --version '$Version' --image '$ImageRepository' --install-dir '$InstallDir' --port '$AppPort' --site-url '$SiteUrl' --sub2api-origin '$Sub2apiOrigin'"

Write-Host "Deploying $ImageRepository`:$Version to $target ..."
ssh @sshArgs $target $remote
if ($LASTEXITCODE -ne 0) { throw "Remote deployment failed." }
Write-Host "Deploy complete: $SiteUrl"
