param(
  [string]$RepoRoot = $PSScriptRoot,
  [string]$SandboxHost = "8.133.167.139"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$taskNames = @("Zhixue-SSH-Tunnel", "Zhixue-Next", "Zhixue-Judge-Worker")

foreach ($taskName in $taskNames) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

# Task Scheduler can occasionally leave a native child alive after its
# PowerShell wrapper stops. Only terminate children whose command lines match
# this resolved repository and its dedicated tunnel endpoint.
Start-Sleep -Milliseconds 500
$deploymentProcesses = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq "node.exe" -and (
    $_.CommandLine -like "*$RepoRoot\node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000*" -or
    $_.CommandLine -like "*$RepoRoot\node_modules\next\dist\bin\next start -H ::1 -p 3000*" -or
    $_.CommandLine -like "*$RepoRoot\.data\programming-judge-worker-build\main.js*"
  )) -or
  ($_.Name -eq "ssh.exe" -and
    $_.CommandLine -like "*-L 18788:127.0.0.1:8788*" -and
    $_.CommandLine -like "*root@$SandboxHost*")
}
foreach ($process in $deploymentProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Output "MANUAL_SERVICES_STOPPED=1"
