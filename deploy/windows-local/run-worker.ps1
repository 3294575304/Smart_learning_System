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

$stdoutPath = Join-Path $config.logRoot "worker.stdout.log"
$stderrPath = Join-Path $config.logRoot "worker.stderr.log"
$workerEntry = Join-Path $config.repoRoot ".data/programming-judge-worker-build/main.js"
Push-Location $config.repoRoot
try {
  # Native stderr is diagnostic output, not a PowerShell terminating error.
  $ErrorActionPreference = "Continue"
  & $config.nodeExecutable $workerEntry 1>> $stdoutPath 2>> $stderrPath
  $processExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = "Stop"
  Pop-Location
}
exit $processExitCode
