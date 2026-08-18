import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Windows local tasks only start and stop through explicit commands", async () => {
  const installer = await readFile(
    new URL(
      "../../deploy/windows-local/install-local-deployment.ps1",
      import.meta.url,
    ),
    "utf8",
  );
  const stopScript = await readFile(
    new URL("../../stop-all.ps1", import.meta.url),
    "utf8",
  );

  assert.match(installer, /-DontStopOnIdleEnd/u);
  assert.match(installer, /-DontStopIfGoingOnBatteries/u);
  assert.match(installer, /-MultipleInstances IgnoreNew/u);
  assert.doesNotMatch(installer, /New-ScheduledTaskTrigger/u);
  assert.doesNotMatch(installer, /-RestartCount/u);
  assert.match(stopScript, /Stop-ScheduledTask/u);
  assert.match(stopScript, /MANUAL_SERVICES_STOPPED=1/u);
});

test("Windows wrappers keep native stderr from terminating services", async () => {
  const wrappers = await Promise.all(
    ["run-next.ps1", "run-worker.ps1", "run-tunnel.ps1"].map((file) =>
      readFile(
        new URL(`../../deploy/windows-local/${file}`, import.meta.url),
        "utf8",
      ),
    ),
  );

  for (const wrapper of wrappers) {
    assert.match(wrapper, /\$ErrorActionPreference = "Continue"/u);
  }
  assert.match(wrappers[0], /"::1"/u);
  assert.doesNotMatch(wrappers[0], /while \(\$true\)/u);
  assert.match(wrappers[0], /\$processExitCode = \$LASTEXITCODE/u);
  assert.match(wrappers[1], /\$processExitCode = \$LASTEXITCODE/u);
});

test("Windows production build is isolated from the Next.js development output", async () => {
  const [installer, nextConfig] = await Promise.all([
    readFile(
      new URL(
        "../../deploy/windows-local/install-local-deployment.ps1",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../next.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(
    nextConfig,
    /distDir: process\.env\.NEXT_DIST_DIR\?\.trim\(\) \|\| "\.next"/u,
  );
  assert.match(installer, /nextBuildDirectory = "\.data\/next-production"/u);
  assert.match(installer, /routesManifest\.dataRoutes/u);
  assert.match(installer, /originalTypeFiles/u);
});

test("public-run polling shows a connection interruption instead of stale running text", async () => {
  const component = await readFile(
    new URL(
      "../../components/assignments/programming-question-input.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(component, /error\s*\?\s*"状态查询中断，请重试查询"/u);
});
