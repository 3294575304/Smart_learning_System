import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  validateTestDatabaseUrl,
  isolatedDatabaseUrl,
  dropIsolatedSchema,
} from "../database";
async function main() {
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `category_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    ASSIGNMENT_CATEGORY_TEST_SCHEMA: schema,
    AI_PROVIDER: "mock",
    LOCAL_UPLOAD_ROOT: resolve(".data", "category-tests", schema),
  };
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, args, {
      env,
      windowsHide: true,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Category verification failed: ${result.status}`);
  };
  try {
    run([resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    run(["--import", "tsx", resolve("prisma/seed.ts")]);
    run([
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve("tests/assignments/category.integration.ts"),
    ]);
    run([
      resolve("node_modules/tsx/dist/cli.mjs"),
      "--test",
      "--test-concurrency=1",
      ...["assignments", "assessment-schemes", "gradebook"].map(
        (dir) => `tests/${dir}/*.test.ts`,
      ),
    ]);
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
