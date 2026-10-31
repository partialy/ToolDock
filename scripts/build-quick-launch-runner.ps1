$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:DOTNET_CLI_HOME = Join-Path $projectRoot 'native/.cli-home'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
Push-Location (Join-Path $projectRoot 'native/quick-launch-runner')
try {
  dotnet publish QuickLaunchRunner.csproj -c Release -r win-x64 --self-contained true -o publish --nologo
  if ($LASTEXITCODE -ne 0) { throw 'Quick launch Runner build failed' }
} finally { Pop-Location }
