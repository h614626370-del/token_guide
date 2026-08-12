#Requires -Version 5.1

param(
    [switch]$NoLaunch,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$NodeVersion = "v22.16.0"
$BaseUrl = "{{BASE_URL}}"
$Model = $env:ANTHROPIC_MODEL
if ([string]::IsNullOrWhiteSpace($Model)) { $Model = "{{DEFAULT_MODEL}}" }
$ApiKey = $env:CLAUDE_API_KEY

$utf8Encoding = New-Object System.Text.UTF8Encoding($false)
try {
    & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null
    [Console]::InputEncoding = $utf8Encoding
    [Console]::OutputEncoding = $utf8Encoding
    $OutputEncoding = $utf8Encoding
} catch {}

function Write-Step([string]$Message) {
    Write-Host "`n[$Message]" -ForegroundColor Yellow
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Add-UserPath([string]$PathEntry) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @($userPath -split ";" | Where-Object { $_ })
    if ($entries -notcontains $PathEntry) {
        [Environment]::SetEnvironmentVariable("Path", (($entries + $PathEntry) -join ";"), "User")
    }
    if (($env:Path -split ";") -notcontains $PathEntry) { $env:Path = "$PathEntry;$env:Path" }
}

function Get-NpmCommand {
    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command npm -ErrorAction SilentlyContinue }
    return $command
}

function Get-ClaudeCommand {
    $command = Get-Command claude.cmd -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command claude -ErrorAction SilentlyContinue }
    return $command
}

function Get-CommandPath($Command) {
    if ($Command.Source) { return $Command.Source }
    if ($Command.Path) { return $Command.Path }
    if ($Command.FullName) { return $Command.FullName }
    throw "无法确定命令路径: $Command"
}

function Install-Node {
    Write-Host "  未检测到 npm，正在安装 Node.js $NodeVersion..." -ForegroundColor Yellow
    $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
        "ARM64" { "arm64" }
        "AMD64" { "x64" }
        default { throw "Claude Code 不支持当前 Windows 架构: $env:PROCESSOR_ARCHITECTURE" }
    }
    $msiName = "node-$NodeVersion-$arch.msi"
    $msiPath = Join-Path $env:TEMP $msiName
    $urls = @(
        "https://npmmirror.com/mirrors/node/$NodeVersion/$msiName",
        "https://cdn.npmmirror.com/binaries/node/$NodeVersion/$msiName"
    )
    $downloaded = $false
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    foreach ($url in $urls) {
        try {
            (New-Object Net.WebClient).DownloadFile($url, $msiPath)
            if ((Test-Path $msiPath) -and (Get-Item $msiPath).Length -gt 1MB) { $downloaded = $true; break }
        } catch { Remove-Item $msiPath -Force -ErrorAction SilentlyContinue }
    }
    if (-not $downloaded) { throw "Node.js 下载失败，请先安装 Node.js 18+ 后重试。" }
    $arguments = '/i "' + $msiPath + '" /qn /norestart'
    $process = Start-Process msiexec.exe -ArgumentList $arguments -Wait -PassThru -Verb RunAs
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0) { throw "Node.js 安装失败，退出码: $($process.ExitCode)" }
    Refresh-ProcessPath
}

if ($Help) {
    Write-Host "用法: .\setup.ps1 [-NoLaunch]"
    exit 0
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Claude Code 一键安装与中转站配置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Step "检测 Claude Code"
$claudeCommand = Get-ClaudeCommand
if (-not $claudeCommand) {
    $npmCommand = Get-NpmCommand
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodeMajor = if ($nodeCommand) { try { [int](((& $nodeCommand.Source --version).Trim().TrimStart("v") -split '\.')[0]) } catch { 0 } } else { 0 }
    if (-not $npmCommand -or $nodeMajor -lt 18) { Install-Node; $npmCommand = Get-NpmCommand }
    if (-not $npmCommand) { throw "Node.js 安装后仍未找到 npm，请重启终端后重试。" }
    & $npmCommand.Source install -g '@anthropic-ai/claude-code' --registry 'https://registry.npmmirror.com'
    if ($LASTEXITCODE -ne 0) {
        $userPrefix = Join-Path $env:LOCALAPPDATA "Programs\claude-code"
        & $npmCommand.Source install -g --prefix $userPrefix '@anthropic-ai/claude-code' --registry 'https://registry.npmmirror.com'
        if ($LASTEXITCODE -ne 0) { throw "Claude Code 安装失败。" }
        Add-UserPath $userPrefix
    }
    Refresh-ProcessPath
    $claudeCommand = Get-ClaudeCommand
    if (-not $claudeCommand) { throw "安装完成，但 PATH 中未找到 claude。请重启终端后重试。" }
}
$claudePath = Get-CommandPath $claudeCommand
Write-Host "  已安装: $claudePath" -ForegroundColor Green

Write-Step "配置中转站"
if (-not $ApiKey) {
    Write-Host "  请粘贴你的 API Key（输入不会显示）" -ForegroundColor Cyan
    $secureKey = Read-Host "API Key" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try { $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw "API Key 不能为空。" }

$backupDir = Join-Path $env:USERPROFILE ".claude"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backup = Join-Path $backupDir "relay-env.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
@(
    "ANTHROPIC_BASE_URL=$([Environment]::GetEnvironmentVariable('ANTHROPIC_BASE_URL', 'User'))",
    "ANTHROPIC_AUTH_TOKEN=$([Environment]::GetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', 'User'))",
    "ANTHROPIC_MODEL=$([Environment]::GetEnvironmentVariable('ANTHROPIC_MODEL', 'User'))"
) | Set-Content -Path $backup -Encoding UTF8

[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", $BaseUrl, "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", $ApiKey, "User")
if ($Model) { [Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", $Model, "User") }
$env:ANTHROPIC_BASE_URL = $BaseUrl
$env:ANTHROPIC_AUTH_TOKEN = $ApiKey
if ($Model) { $env:ANTHROPIC_MODEL = $Model }

Write-Host "  环境配置已写入，旧值备份于: $backup" -ForegroundColor Green
Write-Host "`n安装与配置完成" -ForegroundColor Green
if (-not $NoLaunch) { & $claudePath }
