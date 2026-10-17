import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../database";

async function main() {
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `dashboard_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const environment = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    AI_PROVIDER: "mock",
    LOCAL_UPLOAD_ROOT: resolve(".data", "dashboard-tests", schema),
  };
  function run(args: string[]) {
    const result = spawnSync(process.execPath, args, {
      env: environment,
      windowsHide: true,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Dashboard verification exited with status ${result.status ?? "unknown"}`,
      );
  }
  try {
    const cli = resolve("node_modules/prisma/build/index.js");
    run([cli, "migrate", "deploy"]);
    run([cli, "db", "seed"]);
    run([
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve("tests/courses/teacher-dashboard.integration.ts"),
    ]);
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Dashboard verification failed",
  );
  process.exitCode = 1;
});
