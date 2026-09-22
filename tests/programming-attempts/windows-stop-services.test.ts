import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url)).replace(
  /[\\/]$/u,
  "",
);

function runStopScript(failToStop = false) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$repo = '${repoRoot.replaceAll("'", "''")}'
$global:stopped = @()
$global:tasks = @()
$global:failToStop = ${failToStop ? "$true" : "$false"}
$global:fixtures = @(
  @{ ProcessId = 101; Name = 'node.exe'; CommandLine = 'node "' + $repo + '\node_modules\next\dist\bin\next" start -H ::1 -p 3000' },
  @{ ProcessId = 102; Name = 'node.exe'; CommandLine = 'node "' + $repo + '\node_modules\.bin\\..\next\dist\bin\next" dev --turbopack --port 3001' },
  @{ ProcessId = 103; Name = 'node.exe'; CommandLine = 'node "' + $repo + '\node_modules\next\dist\server\lib\start-server.js"' },
  @{ ProcessId = 104; Name = 'node.exe'; CommandLine = 'node "' + $repo + '\.data\programming-judge-worker-build\main.js"' },
  @{ ProcessId = 105; Name = 'node.exe'; CommandLine = 'node --conditions=react-server "' + $repo.Replace('\', '/') + '/.data/background-worker-build/main.js"' },
  @{ ProcessId = 106; Name = 'ssh.exe'; CommandLine = 'ssh -N -L 18788:127.0.0.1:8788 root@8.133.167.139' },
  @{ ProcessId = 201; Name = 'node.exe'; CommandLine = 'node "' + $repo + '-other\node_modules\next\dist\bin\next" dev' },
  @{ ProcessId = 202; Name = 'node.exe'; CommandLine = 'node "' + $repo + '\node_modules\next\dist\bin\next" build' },
  @{ ProcessId = 203; Name = 'node.exe'; CommandLine = 'node "' + $repo + '\.data\background-worker-build\main.js.backup"' },
  @{ ProcessId = 204; Name = 'node.exe'; CommandLine = $null },
  @{ ProcessId = 205; Name = 'node.exe'; CommandLine = 'node C:\other\server.mjs' },
  @{ ProcessId = 206; Name = 'ssh.exe'; CommandLine = 'ssh -N -L 18788:127.0.0.1:8788 root@another-host' }
) | ForEach-Object { [pscustomobject]$_ }
function Stop-ScheduledTask {
  [CmdletBinding()]param($TaskName)
  $global:tasks += $TaskName
}
function Start-Sleep { param($Milliseconds) }
function Get-CimInstance { param($ClassName) $global:fixtures }
function Get-Process {
  [CmdletBinding()]param($Id)
  if ($Id -notin $global:stopped) { [pscustomobject]@{ Id = $Id } }
}
function Stop-Process {
  [CmdletBinding()]param($Id, [switch]$Force)
  if ($global:failToStop) { throw 'Simulated access denied' }
  $global:stopped += $Id
}
function Wait-Process { [CmdletBinding()]param($Id, $Timeout) }
& (Join-Path $repo 'stop-all.ps1') -RepoRoot $repo
@{ stopped = $global:stopped; tasks = $global:tasks } | ConvertTo-Json -Compress
`;
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
}

test(
  "Windows stop covers both workers and Next dev children without stopping other projects",
  {
    skip: process.platform !== "win32",
  },
  () => {
    const result = runStopScript();
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(
      result.stdout.trim().split(/\r?\n/u).at(-1) ?? "{}",
    );
    assert.deepEqual(summary.stopped, [101, 102, 103, 104, 105, 106]);
    assert.deepEqual(summary.tasks, [
      "Zhixue-SSH-Tunnel",
      "Zhixue-Next",
      "Zhixue-Judge-Worker",
      "Zhixue-Background-Worker",
    ]);
  },
);

test(
  "Windows stop reports process termination failures instead of claiming success",
  {
    skip: process.platform !== "win32",
  },
  () => {
    const result = runStopScript(true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Simulated access denied/u);
    assert.doesNotMatch(result.stdout, /MANUAL_SERVICES_STOPPED=1/u);
  },
);

test("startup releases Prisma users before generation, migration and build", async () => {
  const source = await readFile(
    new URL("../../start-all.ps1", import.meta.url),
    "utf8",
  );
  const stop = source.indexOf("& $stopScriptPath -RepoRoot");
  const generate = source.indexOf("& $npmExecutable run prisma:generate");
  const migrate = source.indexOf("& $npxExecutable prisma migrate deploy");
  const build = source.indexOf("& $installerPath @installerArguments");
  assert.ok(
    stop >= 0 && generate > stop && migrate > generate && build > migrate,
  );
});
