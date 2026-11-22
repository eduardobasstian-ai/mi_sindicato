$ErrorActionPreference = 'Stop'
$configPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MiSindicato/admin.xml'
if (Test-Path -LiteralPath $configPath) {
  $config = Import-Clixml -LiteralPath $configPath
  $env:SINDICATO_ADMIN_USER = $config.User
  $env:SINDICATO_ADMIN_PASSWORD_HASH = [System.Net.NetworkCredential]::new('', $config.Hash).Password
  $env:SINDICATO_ADMIN_TOTP = [System.Net.NetworkCredential]::new('', $config.Totp).Password
}
if (-not $env:PORT) { $env:PORT = '3317' }
Push-Location $PSScriptRoot
try {
  node server.js
} finally {
  Pop-Location
}
