param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $config.environment.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($entry.Name, [string]$entry.Value, "Process")
}

$stdoutPath = Join-Path $config.logRoot "next.stdout.log"
$stderrPath = Join-Path $config.logRoot "next.stderr.log"
$arguments = @(
  (Join-Path $config.repoRoot "node_modules/next/dist/bin/next"),
  "start",
  "-H",
  "127.0.0.1",
  "-p",
  "3000"
)

Push-Location $config.repoRoot
try {
  & $config.nodeExecutable @arguments 1>> $stdoutPath 2>> $stderrPath
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
