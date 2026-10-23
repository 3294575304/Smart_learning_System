import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const file of ["deploy/windows-local/install-local-deployment.ps1"]) {
  test(
    `启动端口检测及时发现监听并明确报告超时：${file}`,
    { skip: process.platform !== "win32" },
    () => {
      const path = fileURLToPath(
        new URL(`../../${file}`, import.meta.url),
      ).replace(/'/gu, "''");
      const command = `
      $ErrorActionPreference='Stop'
      $tokens=$null; $errors=$null
      $ast=[System.Management.Automation.Language.Parser]::ParseFile('${path}',[ref]$tokens,[ref]$errors)
      if($errors.Count){throw 'PowerShell parse failed'}
      $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Wait-LocalPort'},$true)
      Invoke-Expression $function.Extent.Text
      $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
      $listener.Start(); $port=$listener.LocalEndpoint.Port
      try { Wait-LocalPort -Port $port -TimeoutSeconds 1 } finally { $listener.Stop() }
      $clock=[System.Diagnostics.Stopwatch]::StartNew()
      try { Wait-LocalPort -Port $port -TimeoutSeconds 1; throw 'Expected timeout' }
      catch { if($_.Exception.Message -notlike '*Check service logs*'){throw}; if($clock.Elapsed.TotalSeconds -gt 3){throw 'Readiness timeout was not bounded'} }
      Write-Output 'READINESS_OK'
    `;
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        { encoding: "utf8", timeout: 15000 },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /READINESS_OK/u);
    },
  );
}
