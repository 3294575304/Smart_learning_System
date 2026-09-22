param(
  [string]$RepoRoot = $PSScriptRoot,
  [string]$SandboxHost = "8.133.167.139"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$taskNames = @("Zhixue-SSH-Tunnel", "Zhixue-Next", "Zhixue-Judge-Worker", "Zhixue-Background-Worker")

foreach ($taskName in $taskNames) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

# Task Scheduler can occasionally leave a native child alive after its
# PowerShell wrapper stops. Only terminate children whose command lines match
# this resolved repository and its dedicated tunnel endpoint. Include dev
# servers: they load the same Prisma engine DLL as the production services.
Start-Sleep -Milliseconds 500
$escapedRepoRoot = [regex]::Escape($RepoRoot.TrimEnd('\'))
$nodeEntryPrefix = '(?:^|\s)"?' + $escapedRepoRoot
$nodeEntrySuffix = '"?(?:\s|$)'
$nextCommandPattern = $nodeEntryPrefix + '\\node_modules\\(?:\.bin\\+\.\.\\)?next\\dist\\bin\\next(?:\.js)?"?\s+(?:dev|start)(?:\s|$)'
$nextServerPattern = $nodeEntryPrefix + '\\node_modules\\next\\dist\\server\\lib\\start-server\.js' + $nodeEntrySuffix
$workerPattern = $nodeEntryPrefix + '\\\.data\\(?:programming-judge|background)-worker-build\\main\.js' + $nodeEntrySuffix
$deploymentProcesses = Get-CimInstance Win32_Process | Where-Object {
  $commandLine = ([string]$_.CommandLine).Replace('/', '\')
  ($_.Name -eq "node.exe" -and (
    $commandLine -match $nextCommandPattern -or
    $commandLine -match $nextServerPattern -or
    $commandLine -match $workerPattern
  )) -or
  ($_.Name -eq "ssh.exe" -and
    $_.CommandLine -like "*-L 18788:127.0.0.1:8788*" -and
    $_.CommandLine -like "*root@$SandboxHost*")
}
foreach ($process in $deploymentProcesses) {
  # A process may have exited with its wrapper. Other failures must abort
  # startup instead of continuing into a misleading Prisma EPERM error.
  if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    Wait-Process -Id $process.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
    if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
      throw "Repository process $($process.ProcessId) is still running; Prisma preparation cannot safely continue."
    }
  }
}

Write-Output "MANUAL_SERVICES_STOPPED=1"
