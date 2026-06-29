param(
  [string]$Token = $env:BAIDU_PUSH_TOKEN,
  [string]$Site = "https://kkflow.org",
  [string[]]$Urls = @(
    "https://kkflow.org/",
    "https://kkflow.org/guide/"
  )
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  throw "Missing curl.exe. Please install curl or use Windows 10/11 built-in curl.exe."
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "Missing Baidu push token. Set `$env:BAIDU_PUSH_TOKEN or pass -Token."
}

if (-not $Urls -or $Urls.Count -eq 0) {
  throw "At least one URL is required."
}

$endpoint = "http://data.zz.baidu.com/urls?site=$Site&token=$Token"
$body = ($Urls | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join "`n"

Write-Host "Pushing URLs to Baidu:"
$body -split "`n" | ForEach-Object { Write-Host "  $_" }
Write-Host "Endpoint:"
Write-Host "  $endpoint"

$response = & curl.exe -sS -X POST $endpoint -H "Content-Type: text/plain" --data-binary $body
if ($LASTEXITCODE -ne 0) {
  throw "curl.exe failed with exit code $LASTEXITCODE."
}

Write-Host "Baidu response:"
Write-Host $response

try {
  $json = $response | ConvertFrom-Json
  if ($null -ne $json.error) {
    throw "Baidu error $($json.error): $($json.message)"
  }
} catch {
  if ($_.Exception.Message -like "Baidu error*") {
    throw
  }
}
