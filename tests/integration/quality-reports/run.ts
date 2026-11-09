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
  const schema = `quality_scope_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    LOCAL_UPLOAD_ROOT: resolve(".data", "quality-report-tests", schema),
    BACKGROUND_LONG_TASK_WORKER_WAKE_URL: "",
    SEED_SUPER_ADMIN_PASSWORD: randomBytes(24).toString("hex"),
    AI_PROVIDER: "mock",
  };
  function run(args: string[]) {
    const result = spawnSync(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Quality report integration failed (${result.status})`);
  }
  try {
    run([resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    run(["--import", "tsx", resolve("prisma/seed.ts")]);
    run([
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve("tests/quality-reports/scope.integration.ts"),
      ...(process.argv.includes("--http") ? ["--http"] : []),
    ]);
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
