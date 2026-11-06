$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'fetch-media-binaries.cjs')
if ($LASTEXITCODE -ne 0) { throw '媒体引擎准备失败' }
