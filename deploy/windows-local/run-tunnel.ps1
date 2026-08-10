param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$stdoutPath = Join-Path $config.logRoot "tunnel.stdout.log"
$stderrPath = Join-Path $config.logRoot "tunnel.stderr.log"
$arguments = @(
  "-N",
  "-i", $config.sshKeyPath,
  "-o", "IdentitiesOnly=yes",
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "UserKnownHostsFile=$($config.knownHostsPath)",
  "-o", "ExitOnForwardFailure=yes",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
  "-L", "18788:127.0.0.1:8788",
  "root@$($config.sandboxHost)"
)

while ($true) {
  Push-Location $config.repoRoot
  try {
    & $config.sshExecutable @arguments 1>> $stdoutPath 2>> $stderrPath
  } finally {
    Pop-Location
  }
  Start-Sleep -Seconds 3
}
