#Requires -Version 5.1

param(
    [string]$Model = "gpt-5.6-sol",
    [switch]$NoLaunch,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$NodeVersion = "v22.16.0"
$ProviderId = "onekey_relay"
$BaseUrl = "https://llapi.org/v1"
$ApiKey = $env:CODEX_API_KEY
$messagesBase64 = "eyJDb21tYW5kUGF0aEVycm9yIjoi5peg5rOV56Gu5a6a5ZG95Luk6Lev5b6EOiB7MH0iLCJOcG1NaXNzaW5nIjoiICDmnKrmo4DmtYvliLAgbnBt77yM5q2j5Zyo5a6J6KOFIE5vZGUuanMgezB9Li4uIiwiVW5zdXBwb3J0ZWRBcmNoIjoiQ29kZXggQ0xJIOS4jeaUr+aMgeW9k+WJjSBXaW5kb3dzIOaetuaehDogezB9IiwiVHJ5aW5nRG93bmxvYWQiOiIgIOWwneivleS4i+i9vTogezB9IiwiTm9kZURvd25sb2FkRmFpbGVkIjoiTm9kZS5qcyDkuIvovb3lpLHotKXjgILor7flhYjku44gaHR0cHM6Ly9ucG1taXJyb3IuY29tL21pcnJvcnMvbm9kZS8g5a6J6KOFIE5vZGUuanMgMTgrIOWQjumHjeivleOAgiIsIkluc3RhbGxpbmdOb2RlQWRtaW4iOiIgIOato+WcqOWuieijhSBOb2RlLmpz77yI5bCG6K+35rGC566h55CG5ZGY5p2D6ZmQ77yJLi4uIiwiTm9kZUluc3RhbGxGYWlsZWQiOiJOb2RlLmpzIOWuieijheWksei0pe+8jG1zaWV4ZWMg6YCA5Ye656CBOiB7MH0iLCJVc2FnZSI6IueUqOazlTogLlxcc2V0dXAucHMxIFstTW9kZWwgTU9ERUxdIFstTm9MYXVuY2hdIiwiRGVmYXVsdE1vZGVsIjoi6buY6K6k5qih5Z6LOiBncHQtNS42LXNvbCIsIktleVByb21wdEluZm8iOiJDb2RleCBDTEkg5a6J6KOF5a6M5oiQ5ZCO5Lya6K+i6Zeu5piv5ZCm5pu05pawIEFQSSBLZXnjgIIiLCJUaXRsZSI6IiAgQ29kZXggQ0xJIOS4gOmUruWuieijheS4juS4rei9rOermemFjee9riIsIkRldGVjdENvZGV4Ijoi5qOA5rWLIENvZGV4IENMSSIsIkluc3RhbGxlZCI6IiAg5bey5a6J6KOFOiB7MH0iLCJWZXJzaW9uIjoiICDniYjmnKw6IHswfSIsIk5wbVN0aWxsTWlzc2luZyI6Ik5vZGUuanMg5a6J6KOF5ZCO5LuN5pyq5om+5YiwIG5wbe+8jOivt+mHjeWQr+e7iOerr+WQjumHjeivleOAgiIsIkluc3RhbGxpbmdDb2RleCI6IiAg5L2/55So5Zu95YaFIG5wbSDplZzlg4/lronoo4UgQG9wZW5haS9jb2RleC4uLiIsIlVzZXJEaXJGYWxsYmFjayI6IiAg5YWo5bGA55uu5b2V5LiN5Y+v5YaZ77yM5pS56KOF5Yiw55So5oi355uu5b2VOiB7MH0iLCJDb2RleEluc3RhbGxGYWlsZWQiOiJDb2RleCBDTEkg5a6J6KOF5aSx6LSl44CCIiwiQ29kZXhOb3RGb3VuZCI6IuWuieijheW3suWujOaIkO+8jOS9hiBQQVRIIOS4reacquaJvuWIsCBjb2RleOOAguivt+mHjeWQr+e7iOerr+WQjumHjeivleOAgiIsIkNvZGV4SW5zdGFsbGVkIjoiICBDb2RleCBDTEkg5a6J6KOF5oiQ5YqfOiB7MH0iLCJDb25maWd1cmVSZWxheSI6IumFjee9ruS4rei9rOermSIsIlVwZGF0ZUtleVByb21wdCI6IkNvZGV4IENMSSDlronoo4XlrozmiJDvvIzmmK/lkKbmm7TmlrAgQVBJIEtlee+8n1t5L05dIiwiU2tpcENvbmZpZyI6IiAg5bey6YCJ5oup5LiN5pu05pawIEFQSSBLZXnvvIzot7Pov4fkuK3ovaznq5nphY3nva4iLCJQYXN0ZUtleSI6IiAg6K+357KY6LS05L2g55qEIEFQSSBLZXnvvIjovpPlhaXkuI3kvJrmmL7npLrvvIkiLCJFbXB0eUtleSI6IkFQSSBLZXkg5LiN6IO95Li656m644CCIiwiQ29uZmlnQmFja3VwIjoiICDlt7LlpIfku73ljp/phY3nva46IHswfSIsIkF1dGhCYWNrdXAiOiIgIOW3suWkh+S7veWOn+iupOivgTogezB9IiwiQ29uZmlnV3JpdHRlbiI6IiAg6YWN572u5bey5YaZ5YWlOiB7MH0iLCJBdXRoV3JpdHRlbiI6IiAgQVBJIEtleSDlt7LlhpnlhaU6IHswfSIsIk1vZGVsIjoiICDmqKHlnos6IHswfSIsIkNvbXBsZXRlIjoiICDlronoo4XkuI7phY3nva7lrozmiJAiLCJMYXVuY2hpbmciOiLmraPlnKjlkK/liqggQ29kZXggQ0xJLi4uIn0="
$Text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($messagesBase64)) | ConvertFrom-Json

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
    throw ($Text.CommandPathError -f $Command)
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
    Write-Host ($Text.NpmMissing -f $NodeVersion) -ForegroundColor Yellow
    $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
        "ARM64" { "arm64" }
        "AMD64" { "x64" }
        default { throw ($Text.UnsupportedArch -f $env:PROCESSOR_ARCHITECTURE) }
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
        Write-Host ($Text.TryingDownload -f $url) -ForegroundColor DarkGray
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
        throw $Text.NodeDownloadFailed
    }

    Write-Host $Text.InstallingNodeAdmin -ForegroundColor Yellow
    $arguments = '/i "' + $msiPath + '" /qn /norestart'
    $process = Start-Process msiexec.exe -ArgumentList $arguments -Wait -PassThru -Verb RunAs
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0) { throw ($Text.NodeInstallFailed -f $process.ExitCode) }
    Refresh-ProcessPath
}

if ($Help) {
    Write-Host $Text.Usage
    Write-Host $Text.DefaultModel
    Write-Host $Text.KeyPromptInfo
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host $Text.Title -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Step $Text.DetectCodex
$codexCommand = Get-CodexCommand
if ($codexCommand) {
    $codexPath = Get-CommandPath $codexCommand
    Write-Host ($Text.Installed -f $codexPath) -ForegroundColor Green
    try { Write-Host ($Text.Version -f (& $codexPath --version)) -ForegroundColor DarkGray } catch {}
} else {
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
    if (-not $npmCommand) { throw $Text.NpmStillMissing }

    Write-Host $Text.InstallingCodex -ForegroundColor Yellow
    & $npmCommand.Source install -g '@openai/codex' --registry 'https://registry.npmmirror.com'
    if ($LASTEXITCODE -ne 0) {
        $userPrefix = Join-Path $env:LOCALAPPDATA "Programs\codex-cli"
        Write-Host ($Text.UserDirFallback -f $userPrefix) -ForegroundColor Yellow
        & $npmCommand.Source install -g --prefix $userPrefix '@openai/codex' --registry 'https://registry.npmmirror.com'
        if ($LASTEXITCODE -ne 0) { throw $Text.CodexInstallFailed }
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
    if (-not $codexCommand) { throw $Text.CodexNotFound }
    $codexPath = Get-CommandPath $codexCommand
    Write-Host ($Text.CodexInstalled -f $codexPath) -ForegroundColor Green
}

Write-Step $Text.ConfigureRelay
$skipConfig = $false
if (-not $ApiKey) {
    $choice = $env:CODEX_UPDATE_KEY
    if (-not $choice) { $choice = Read-Host $Text.UpdateKeyPrompt }
    if ($choice -notmatch '^(?i:y|yes)$') {
        $skipConfig = $true
        Write-Host $Text.SkipConfig -ForegroundColor Yellow
    } else {
        Write-Host $Text.PasteKey -ForegroundColor Cyan
        $secureKey = Read-Host "API Key" -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try { $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
}

if (-not $skipConfig) {
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw $Text.EmptyKey }

$codexDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$configFile = Join-Path $codexDir "config.toml"
$authFile = Join-Path $codexDir "auth.json"
New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
$configContent = if (Test-Path $configFile) { [IO.File]::ReadAllText($configFile) } else { "" }
if (Test-Path $configFile) {
    $backup = "$configFile.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $configFile $backup -Force
    Write-Host ($Text.ConfigBackup -f $backup) -ForegroundColor DarkGray
}

if (Test-Path $authFile) {
    $authBackup = "$authFile.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $authFile $authBackup -Force
    Write-Host ($Text.AuthBackup -f $authBackup) -ForegroundColor DarkGray
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
$authContent = [PSCustomObject]@{
    auth_mode = "apikey"
    OPENAI_API_KEY = $ApiKey
} | ConvertTo-Json
[IO.File]::WriteAllText($authFile, ($authContent + "`n"), $utf8NoBom)

Write-Host ($Text.ConfigWritten -f $configFile) -ForegroundColor Green
Write-Host ($Text.AuthWritten -f $authFile) -ForegroundColor Green
if ($Model) { Write-Host ($Text.Model -f $Model) -ForegroundColor Green }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host $Text.Complete -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

if (-not $NoLaunch) {
    Write-Host ("`n{0}`n" -f $Text.Launching) -ForegroundColor Cyan
    & $codexPath
}
