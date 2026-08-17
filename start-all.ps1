param(
  [string]$RepoRoot = $PSScriptRoot,
  [string]$SandboxHost = "8.133.167.139",
  [string]$SshKeyPath = "",
  [string]$KnownHostsPath = "C:\Users\HONOR\.ssh\codex_sandbox_known_hosts_20260808",
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
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Port $Port did not become ready within $TimeoutSeconds seconds."
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$environmentPath = Join-Path $RepoRoot ".env"
$packagePath = Join-Path $RepoRoot "package.json"
$installerPath = Join-Path $RepoRoot "deploy/windows-local/install-local-deployment.ps1"

foreach ($requiredPath in @($environmentPath, $packagePath, $installerPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required file does not exist: $requiredPath"
  }
}

$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$npxExecutable = (Get-Command npx.cmd -ErrorAction Stop).Source

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
  & $npmExecutable run prisma:generate
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma Client generation failed."
  }
  if (-not $SkipMigration) {
    & $npxExecutable prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
      throw "Database migration failed."
    }
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
  Wait-LocalPort -Port 18788 -TimeoutSeconds 15
  Wait-LocalPort -Port 3000 -TimeoutSeconds 30
  $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 15
  if ($response.StatusCode -ne 200) {
    throw "Application health check failed."
  }

  Get-ScheduledTask -TaskName "Zhixue-*" |
    Sort-Object TaskName |
    Select-Object TaskName, State
  Write-Output "START_ALL_READY=1"
  Write-Output "Open http://127.0.0.1:3000"
} finally {
  Pop-Location
}
