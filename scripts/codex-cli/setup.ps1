#Requires -Version 5.1

param(
    [string]$Model = "{{DEFAULT_MODEL}}",
    [string]$BaseUrl = $env:CODEX_BASE_URL,
    [string]$ApiKey = $env:CODEX_API_KEY,
    [switch]$NoLaunch,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$NodeVersion = "v22.16.0"
$ProviderId = "custom"
if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "{{BASE_URL}}" }
$BaseUrl = $BaseUrl.TrimEnd("/")

# Windows PowerShell 5.1 defaults to the active legacy code page.
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
    if (($env:Path -split ";") -notcontains $PathEntry) {
        $env:Path = "$PathEntry;$env:Path"
    }
}

function Get-NpmCommand {
    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command npm -ErrorAction SilentlyContinue }
    return $command
}

function Get-CodexCommand {
    $command = Get-Command codex.cmd -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command codex -ErrorAction SilentlyContinue }
    return $command
}

function Get-CommandPath($Command) {
    if ($Command.Source) { return $Command.Source }
    if ($Command.Path) { return $Command.Path }
    if ($Command.FullName) { return $Command.FullName }
    throw "无法确定命令路径: $Command"
}

function ConvertTo-TomlString([string]$Value) {
    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    $escaped = $escaped.Replace("`r", "\r").Replace("`n", "\n").Replace("`t", "\t")
    return '"' + $escaped + '"'
}

function Set-TopLevelTomlKey {
    param(
        [string]$Content,
        [string]$Key,
        [string]$Value
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in ($Content -split "`r?`n")) { $lines.Add($line) }

    $sectionIndex = $lines.Count
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*\[') { $sectionIndex = $i; break }
    }

    $keyPattern = '^\s*' + [regex]::Escape($Key) + '\s*='
    for ($i = 0; $i -lt $sectionIndex; $i++) {
        if ($lines[$i] -match $keyPattern) {
            $lines[$i] = "$Key = $Value"
            return ($lines -join "`n")
        }
    }

    $lines.Insert(0, "$Key = $Value")
    return ($lines -join "`n")
}

function Set-ProviderBlock {
    param(
        [string]$Content,
        [string[]]$Block
    )

    $header = "[model_providers.$ProviderId]"
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in ($Content -split "`r?`n")) { $lines.Add($line) }

    $start = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq $header) { $start = $i; break }
    }

    if ($start -ge 0) {
        $end = $lines.Count
        for ($i = $start + 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^\s*\[') { $end = $i; break }
        }
        $lines.RemoveRange($start, $end - $start)
        for ($i = $Block.Count - 1; $i -ge 0; $i--) { $lines.Insert($start, $Block[$i]) }
    } else {
        if ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -ne "") { $lines.Add("") }
        foreach ($line in $Block) { $lines.Add($line) }
    }

    return (($lines -join "`n").TrimEnd() + "`n")
}

function Install-Node {
    Write-Host "  未检测到 npm，正在安装 Node.js $NodeVersion..." -ForegroundColor Yellow
    $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
        "ARM64" { "arm64" }
        "AMD64" { "x64" }
        default { throw "Codex CLI 不支持当前 Windows 架构: $env:PROCESSOR_ARCHITECTURE" }
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
        Write-Host "  尝试下载: $url" -ForegroundColor DarkGray
        try {
            (New-Object Net.WebClient).DownloadFile($url, $msiPath)
            if ((Test-Path $msiPath) -and (Get-Item $msiPath).Length -gt 1MB) {
                $downloaded = $true
                break
            }
        } catch {
            Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not $downloaded) {
        throw "Node.js 下载失败。请先从 https://npmmirror.com/mirrors/node/ 安装 Node.js 18+ 后重试。"
    }

    Write-Host "  正在安装 Node.js（将请求管理员权限）..." -ForegroundColor Yellow
    $arguments = '/i "' + $msiPath + '" /qn /norestart'
    $process = Start-Process msiexec.exe -ArgumentList $arguments -Wait -PassThru -Verb RunAs
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0) { throw "Node.js 安装失败，msiexec 退出码: $($process.ExitCode)" }
    Refresh-ProcessPath
}

if ($Help) {
    Write-Host "用法: .\setup.ps1 [-Model MODEL] [-BaseUrl URL] [-ApiKey KEY] [-NoLaunch]"
    Write-Host "默认模型: gpt-5.6-sol"
    Write-Host "API Key 必须通过 -ApiKey 或 CODEX_API_KEY 传入。"
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Codex CLI 一键安装与中转站配置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Step "检测 Codex CLI"
$npmCommand = Get-NpmCommand
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeMajor = if ($nodeCommand) {
    try {
        $installedNodeVersion = (& $nodeCommand.Source --version).Trim().TrimStart("v")
        [int](($installedNodeVersion -split '\.')[0])
    } catch { 0 }
} else { 0 }
if (-not $npmCommand -or $nodeMajor -lt 18) {
    Install-Node
    $npmCommand = Get-NpmCommand
}
if (-not $npmCommand) { throw "Node.js 安装后仍未找到 npm，请重启终端后重试。" }

$codexReady = $false
$codexCommand = Get-CodexCommand
if ($codexCommand) {
    $codexPath = Get-CommandPath $codexCommand
    $codexVersion = & $codexPath --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $codexVersion) {
        $codexReady = $true
        Write-Host "  已安装: $codexPath" -ForegroundColor Green
        Write-Host "  版本: $codexVersion" -ForegroundColor DarkGray
    } else {
        Write-Host "  检测到无法运行的 Codex: $codexPath，准备重新安装..." -ForegroundColor Yellow
    }
}

if (-not $codexReady) {
    Write-Host "  使用国内 npm 镜像安装 @openai/codex..." -ForegroundColor Yellow
    & $npmCommand.Source install -g '@openai/codex' --registry 'https://registry.npmmirror.com'
    if ($LASTEXITCODE -ne 0) {
        $userPrefix = Join-Path $env:LOCALAPPDATA "Programs\codex-cli"
        Write-Host "  全局目录不可写，改装到用户目录: $userPrefix" -ForegroundColor Yellow
        & $npmCommand.Source install -g --prefix $userPrefix '@openai/codex' --registry 'https://registry.npmmirror.com'
        if ($LASTEXITCODE -ne 0) { throw "Codex CLI 安装失败。" }
        Add-UserPath $userPrefix
    }

    Refresh-ProcessPath
    $codexCommand = Get-CodexCommand
    if (-not $codexCommand) {
        $userCodex = Join-Path $env:LOCALAPPDATA "Programs\codex-cli\codex.cmd"
        if (Test-Path $userCodex) {
            Add-UserPath (Split-Path $userCodex)
            $codexCommand = Get-Item $userCodex
        }
    }
    if (-not $codexCommand) { throw "安装已完成，但 PATH 中未找到 codex。请重启终端后重试。" }
    $codexPath = Get-CommandPath $codexCommand
    Write-Host "  Codex CLI 安装成功: $codexPath" -ForegroundColor Green
}

Write-Step "配置中转站"
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw "API Key 不能为空，请从自动安装页面复制完整命令。" }

$codexDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$configFile = Join-Path $codexDir "config.toml"
$authFile = Join-Path $codexDir "auth.json"
New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
$configContent = if (Test-Path $configFile) { [IO.File]::ReadAllText($configFile) } else { "" }
if (Test-Path $configFile) {
    $backup = "$configFile.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $configFile $backup -Force
    Write-Host "  已备份原配置: $backup" -ForegroundColor DarkGray
}

$authData = [ordered]@{}
if (Test-Path $authFile) {
    $authBackup = "$authFile.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $authFile $authBackup -Force
    Write-Host "  已备份原认证: $authBackup" -ForegroundColor DarkGray
    try {
        $existingAuth = [IO.File]::ReadAllText($authFile) | ConvertFrom-Json
        if ($null -eq $existingAuth -or $existingAuth -isnot [PSCustomObject]) {
            throw "根节点必须是 JSON 对象"
        }
        foreach ($property in $existingAuth.PSObject.Properties) {
            $authData[$property.Name] = $property.Value
        }
    } catch {
        throw "无法解析现有 auth.json，已保留原文件和备份: $($_.Exception.Message)"
    }
}

$configContent = Set-TopLevelTomlKey -Content $configContent -Key "model_provider" -Value (ConvertTo-TomlString $ProviderId)
if ($Model) {
    $configContent = Set-TopLevelTomlKey -Content $configContent -Key "model" -Value (ConvertTo-TomlString $Model.Trim())
}
$providerBlock = @(
    "[model_providers.$ProviderId]",
    'name = "OneKey Relay"',
    "base_url = $(ConvertTo-TomlString $BaseUrl)",
    'wire_api = "responses"',
    'requires_openai_auth = true'
)
$configContent = Set-ProviderBlock -Content $configContent -Block $providerBlock
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($configFile, $configContent, $utf8NoBom)

$authData["OPENAI_API_KEY"] = $ApiKey
$authJson = $authData | ConvertTo-Json -Depth 20
$authTemp = "$authFile.tmp.$PID"
[IO.File]::WriteAllText($authTemp, $authJson + "`n", $utf8NoBom)
Move-Item $authTemp $authFile -Force

Write-Host "  配置已写入: $configFile" -ForegroundColor Green
Write-Host "  认证已写入: $authFile" -ForegroundColor Green
Write-Host "  API Key 已写入 auth.json" -ForegroundColor Green
if ($Model) { Write-Host "  模型: $Model" -ForegroundColor Green }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  安装与配置完成" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

if (-not $NoLaunch) {
    Write-Host "`n正在启动 Codex CLI...`n" -ForegroundColor Cyan
    & $codexPath
}
