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
  const schema = `student_tasks_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    AI_PROVIDER: "mock",
    STUDENT_TASK_BROWSER_HOLD: process.argv.includes("--browser") ? "1" : "0",
  };
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Student task integration failed: ${result.status}`);
  };
  try {
    run([resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    run([
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve("tests/courses/student-task-overview.integration.ts"),
    ]);
    run([
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve("tests/courses/student-task-pages.integration.ts"),
    ]);
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Student task integration failed",
  );
  process.exitCode = 1;
});
