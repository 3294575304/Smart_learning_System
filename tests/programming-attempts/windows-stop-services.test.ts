import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Windows deployment documents machine-local start and stop scripts", async () => {
  const deploymentGuide = await readFile(
    new URL("../../deploy/windows-local/README.md", import.meta.url),
    "utf8",
  );
  const rootReadme = await readFile(
    new URL("../../README.md", import.meta.url),
    "utf8",
  );

  assert.match(deploymentGuide, /install-local-deployment\.ps1/u);
  assert.match(
    deploymentGuide,
    /start-all\.ps1.*stop-all\.ps1.*已从 Git 跟踪中移除/u,
  );
  assert.match(deploymentGuide, /Windows 任务计划程序中手动停止/u);
  assert.match(rootReadme, /本机启停脚本属于机器相关配置，不随仓库分发/u);
});
