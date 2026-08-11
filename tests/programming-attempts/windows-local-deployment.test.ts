import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Windows local tasks remain active when user activity resumes", async () => {
  const installer = await readFile(
    new URL(
      "../../deploy/windows-local/install-local-deployment.ps1",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(installer, /-DontStopOnIdleEnd/u);
  assert.match(installer, /-RestartCount 999/u);
  assert.match(installer, /-DontStopIfGoingOnBatteries/u);
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
