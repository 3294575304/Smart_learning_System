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

$stdoutPath = Join-Path $config.logRoot "background-worker.stdout.log"
$stderrPath = Join-Path $config.logRoot "background-worker.stderr.log"
$workerEntry = Join-Path $config.repoRoot ".data/background-worker-build/main.js"
Push-Location $config.repoRoot
try {
  $ErrorActionPreference = "Continue"
  & $config.nodeExecutable --conditions=react-server $workerEntry 1>> $stdoutPath 2>> $stderrPath
  $processExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = "Stop"
  Pop-Location
}
exit $processExitCode
