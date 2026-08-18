param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
  [string]$SandboxHost = "8.133.167.139",
  [string]$SshKeyPath = "",
  [string]$KnownHostsPath = "C:\Users\HONOR\.ssh\codex_sandbox_known_hosts_20260808",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($SshKeyPath)) {
  $materialSuffix = -join @([char]0x6750, [char]0x6599)
  $SshKeyPath = "${RepoRoot}${materialSuffix}\codex.pem"
}

function New-RandomSecret {
  $bytes = [byte[]]::new(48)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
}

function Wait-LocalPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds
  )
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Port $Port did not become ready within $TimeoutSeconds seconds"
}

foreach ($path in @($RepoRoot, $SshKeyPath, $KnownHostsPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required path does not exist: $path"
  }
}

$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$sshExecutable = (Get-Command ssh.exe -ErrorAction Stop).Source
$powershellExecutable = (Get-Command powershell.exe -ErrorAction Stop).Source
$runtimeRoot = Join-Path $RepoRoot ".data/local-deployment"
$logRoot = Join-Path $runtimeRoot "logs"
$configPath = Join-Path $runtimeRoot "service-config.json"
$workerBuildRoot = Join-Path $RepoRoot ".data/programming-judge-worker-build"
$nextBuildDirectory = ".data/next-production"
$nextBuildRoot = Join-Path $RepoRoot $nextBuildDirectory
New-Item -ItemType Directory -Force -Path $runtimeRoot, $logRoot | Out-Null
if (-not $SkipBuild) {
  Push-Location $RepoRoot
  $previousDistDir = $env:NEXT_DIST_DIR
  $generatedTypeFiles = @(
    (Join-Path $RepoRoot "next-env.d.ts"),
    (Join-Path $RepoRoot "tsconfig.json")
  )
  $originalTypeFiles = @{}
  foreach ($generatedTypeFile in $generatedTypeFiles) {
    $originalTypeFiles[$generatedTypeFile] = [System.IO.File]::ReadAllBytes($generatedTypeFile)
  }
  try {
    $env:NEXT_DIST_DIR = $nextBuildDirectory
    & $npmExecutable run build
    if ($LASTEXITCODE -ne 0) {
      throw "Next.js production build failed"
    }
    & $npmExecutable run build:programming-judge-worker
    if ($LASTEXITCODE -ne 0) {
      throw "Programming judge worker build failed"
    }
  } finally {
    foreach ($generatedTypeFile in $generatedTypeFiles) {
      [System.IO.File]::WriteAllBytes(
        $generatedTypeFile,
        [byte[]]$originalTypeFiles[$generatedTypeFile]
      )
    }
    $env:NEXT_DIST_DIR = $previousDistDir
    Pop-Location
  }
}
$routesManifestPath = Join-Path $nextBuildRoot "routes-manifest.json"
if (-not (Test-Path -LiteralPath $routesManifestPath)) {
  throw "Next.js production routes manifest is missing"
}
$routesManifest = Get-Content -LiteralPath $routesManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $routesManifest.dataRoutes -or
    $null -eq $routesManifest.dynamicRoutes -or
    $null -eq $routesManifest.staticRoutes) {
  throw "Next.js production routes manifest is invalid"
}
if (-not (Test-Path -LiteralPath (Join-Path $workerBuildRoot "main.js"))) {
  throw "Programming judge worker build is missing"
}
[System.IO.File]::WriteAllText(
  (Join-Path $workerBuildRoot "package.json"),
  '{"type":"module"}',
  [System.Text.UTF8Encoding]::new($false)
)

$existingSecret = ""
if (Test-Path -LiteralPath $configPath) {
  try {
    $existing = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $existingSecret = [string]$existing.environment.BACKGROUND_JOB_WORKER_SECRET
  } catch {
    $existingSecret = ""
  }
}
$workerSecret = if ($existingSecret.Length -ge 32) { $existingSecret } else { New-RandomSecret }

$executorApiKey = (& $sshExecutable `
  -i $SshKeyPath `
  -o IdentitiesOnly=yes `
  -o BatchMode=yes `
  -o StrictHostKeyChecking=yes `
  -o "UserKnownHostsFile=$KnownHostsPath" `
  "root@$SandboxHost" `
  "sed -n 's/^SANDBOX_EXECUTOR_API_KEY=//p' /etc/zhixue-sandbox-executor.env").Trim()
if ($LASTEXITCODE -ne 0 -or $executorApiKey.Length -lt 32) {
  throw "Unable to retrieve the remote executor credential"
}

$config = [ordered]@{
  repoRoot = $RepoRoot
  logRoot = $logRoot
  nodeExecutable = $nodeExecutable
  sshExecutable = $sshExecutable
  sshKeyPath = $SshKeyPath
  knownHostsPath = $KnownHostsPath
  sandboxHost = $SandboxHost
  environment = [ordered]@{
    NODE_ENV = "production"
    NEXT_DIST_DIR = $nextBuildDirectory
    BACKGROUND_JOB_WORKER_SECRET = $workerSecret
    APPLICATION_INTERNAL_URL = "http://[::1]:3000"
    SANDBOX_EXECUTOR_URL = "http://127.0.0.1:18788"
    SANDBOX_EXECUTOR_API_KEY = $executorApiKey
    PROGRAMMING_JUDGE_WORKER_ID = "windows-local-$($env:COMPUTERNAME.ToLowerInvariant())"
    PROGRAMMING_JUDGE_POLL_INTERVAL_MS = "1000"
    PROGRAMMING_JUDGE_LEASE_DURATION_MS = "30000"
    PROGRAMMING_JUDGE_RECOVERY_INTERVAL_MS = "30000"
  }
}
[System.IO.File]::WriteAllText(
  $configPath,
  ($config | ConvertTo-Json -Depth 5),
  [System.Text.UTF8Encoding]::new($false)
)

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $runtimeRoot /inheritance:r /grant:r "${currentUser}:(OI)(CI)(F)" "*S-1-5-18:(OI)(CI)(F)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Unable to restrict the local deployment directory ACL"
}
$workspaceToolUser = "$env:COMPUTERNAME\codexsandboxoffline"
if (Get-LocalUser -Name "codexsandboxoffline" -ErrorAction SilentlyContinue) {
  & icacls.exe $runtimeRoot /grant:r "${workspaceToolUser}:(OI)(CI)(RX)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to grant workspace traversal permission"
  }
}
& icacls.exe $configPath /inheritance:r /grant:r "${currentUser}:(F)" "*S-1-5-18:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Unable to restrict the runtime configuration ACL"
}

$taskDefinitions = @(
  @{ Name = "Zhixue-SSH-Tunnel"; Script = "run-tunnel.ps1" },
  @{ Name = "Zhixue-Next"; Script = "run-next.ps1" },
  @{ Name = "Zhixue-Judge-Worker"; Script = "run-worker.ps1" }
)
foreach ($definition in $taskDefinitions) {
  Stop-ScheduledTask -TaskName $definition.Name -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
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
  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}
foreach ($logName in @(
  "next.stdout.log",
  "next.stderr.log",
  "worker.stdout.log",
  "worker.stderr.log",
  "tunnel.stdout.log",
  "tunnel.stderr.log"
)) {
  [System.IO.File]::WriteAllText(
    (Join-Path $logRoot $logName),
    "",
    [System.Text.UTF8Encoding]::new($false)
  )
}

$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

foreach ($definition in $taskDefinitions) {
  $scriptPath = Join-Path $PSScriptRoot $definition.Script
  $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`" -ConfigPath `"$configPath`""
  $action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $arguments -WorkingDirectory $RepoRoot
  # No trigger is registered: these tasks only run when start-all.ps1 (or the
  # operator) starts them explicitly, and they stay stopped after stop-all.ps1.
  $task = New-ScheduledTask -Action $action -Principal $principal -Settings $settings
  Register-ScheduledTask -TaskName $definition.Name -InputObject $task -Force | Out-Null
}

Start-ScheduledTask -TaskName "Zhixue-SSH-Tunnel"
Wait-LocalPort -Port 18788 -TimeoutSeconds 15
Start-ScheduledTask -TaskName "Zhixue-Next"
Wait-LocalPort -Port 3000 -TimeoutSeconds 30
Start-ScheduledTask -TaskName "Zhixue-Judge-Worker"
Start-Sleep -Seconds 2

$health = Invoke-RestMethod -Uri "http://127.0.0.1:18788/health" -Headers @{
  Authorization = "Bearer $executorApiKey"
} -TimeoutSec 10
if ($health.status -ne "ok") {
  throw "Remote executor health check failed"
}

$appResponse = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 15
if ($appResponse.StatusCode -ne 200) {
  throw "Next.js health check failed"
}

Get-ScheduledTask -TaskName ($taskDefinitions.Name) |
  Select-Object TaskName, State
Write-Output "LOCAL_DEPLOYMENT_READY=1"
