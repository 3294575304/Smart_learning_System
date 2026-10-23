param(
  [string]$RepoRoot = $PSScriptRoot,
  [string]$SandboxHost = "8.133.167.139",
  [string]$SshKeyPath = "",
  [string]$KnownHostsPath = (Join-Path $HOME ".ssh\codex_sandbox_known_hosts_20260808"),
  [switch]$SkipBuild,
  [switch]$SkipMigration
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Wait-LocalPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port }) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Port $Port did not become ready within $TimeoutSeconds seconds. Check service logs in .data/local-deployment/logs and retry start-all.ps1."
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$environmentPath = Join-Path $RepoRoot ".env"
$packagePath = Join-Path $RepoRoot "package.json"
$installerPath = Join-Path $RepoRoot "deploy/windows-local/install-local-deployment.ps1"
$stopScriptPath = Join-Path $RepoRoot "stop-all.ps1"

foreach ($requiredPath in @($environmentPath, $packagePath, $installerPath, $stopScriptPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required file does not exist: $requiredPath"
  }
}

$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$npxExecutable = (Get-Command npx.cmd -ErrorAction Stop).Source
$sshCommand = Get-Command ssh.exe -ErrorAction SilentlyContinue
if ($null -eq $sshCommand) {
  throw "OpenSSH Client is required. Install the Windows optional feature 'OpenSSH.Client', then reopen PowerShell."
}
$sshExecutable = $sshCommand.Source

if (-not (Test-Path -LiteralPath $KnownHostsPath -PathType Leaf)) {
  throw "SSH known_hosts file is missing: $KnownHostsPath. Prepare a verified host-key file and pass -KnownHostsPath."
}

if (-not [string]::IsNullOrWhiteSpace($SshKeyPath) -and
    -not (Test-Path -LiteralPath $SshKeyPath -PathType Leaf)) {
  throw "SSH private key file is missing: $SshKeyPath"
}

if ([string]::IsNullOrWhiteSpace($SshKeyPath)) {
  $repoKeyPath = Join-Path $RepoRoot "codex.pem"
  if (Test-Path -LiteralPath $repoKeyPath -PathType Leaf) {
    $SshKeyPath = $repoKeyPath
  }
}
if ([string]::IsNullOrWhiteSpace($SshKeyPath) -or
    -not (Test-Path -LiteralPath $SshKeyPath -PathType Leaf)) {
  throw "SSH private key file is missing. Put codex.pem in the repository root or pass -SshKeyPath."
}

Write-Output "[1/4] Checking PostgreSQL..."
$postgresServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match "postgres" -or $_.DisplayName -match "PostgreSQL"
})
if (-not (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) {
  $postgresService = $postgresServices | Select-Object -First 1
  if ($null -eq $postgresService) {
    throw "PostgreSQL is not listening on port 5432 and no Windows PostgreSQL service was found."
  }
  if ($postgresService.Status -ne "Running") {
    Start-Service -Name $postgresService.Name
  }
  Wait-LocalPort -Port 5432 -TimeoutSeconds 30
}

Push-Location $RepoRoot
try {
  Write-Output "[2/4] Preparing Prisma..."
  # Windows cannot replace the Prisma engine DLL while Next.js or a worker
  # has it loaded. Release repository runtimes before generation and migration.
  Write-Output "Stopping existing repository services and development previews..."
  & $stopScriptPath -RepoRoot $RepoRoot -SandboxHost $SandboxHost
  # Windows PowerShell 5 promotes a native command's stderr output to a
  # terminating NativeCommandError while the global preference is Stop, and
  # Prisma writes its config banner ("Loaded Prisma config from
  # prisma.config.ts.") to stderr even on success. Relax the preference for
  # these calls and rely on $LASTEXITCODE for failure detection.
  $ErrorActionPreference = "Continue"
  & $npmExecutable run prisma:generate
  $prismaGenerateExitCode = $LASTEXITCODE
  $prismaMigrateExitCode = 0
  if (-not $SkipMigration) {
    & $npxExecutable prisma migrate deploy
    $prismaMigrateExitCode = $LASTEXITCODE
  }
  $ErrorActionPreference = "Stop"
  if ($prismaGenerateExitCode -ne 0) {
    throw "Prisma Client generation failed. If the engine DLL is locked, close other Prisma scripts or Prisma Studio using this repository and retry."
  }
  if ($prismaMigrateExitCode -ne 0) {
    throw "Database migration failed."
  }

  Write-Output "[3/4] Building and starting the application, judge worker, and sandbox tunnel..."
  $installerArguments = @{
    RepoRoot = $RepoRoot
    SandboxHost = $SandboxHost
    KnownHostsPath = $KnownHostsPath
    SkipBuild = $SkipBuild
  }
  if (-not [string]::IsNullOrWhiteSpace($SshKeyPath)) {
    $installerArguments.SshKeyPath = $SshKeyPath
  }
  & $installerPath @installerArguments

  Write-Output "[4/4] Verifying local services..."
  Wait-LocalPort -Port 18788 -TimeoutSeconds 60
  Wait-LocalPort -Port 3000 -TimeoutSeconds 60
  $response = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 15
  if ($response.StatusCode -ne 200) {
    throw "Application health check failed."
  }

  Get-ScheduledTask -TaskName "Zhixue-*" |
    Sort-Object TaskName |
    Select-Object TaskName, State
  Write-Output "START_ALL_READY=1"
  Write-Output "Open http://localhost:3000"
  Write-Output "Stop manually with: powershell -ExecutionPolicy Bypass -File .\stop-all.ps1"
} finally {
  Pop-Location
}
