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
  const schema = `practice_scoring_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    RECOMMENDATION_INTEGRATION_SCHEMA: schema,
    AI_PROVIDER: "mock",
  };
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Practice scoring integration failed: ${result.status}`);
  };
  try {
    run([resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    for (const file of [
      "tests/integration/recommendations/recommendation-service.integration.test.ts",
      "tests/integration/practice-scoring/scoring.integration.ts",
      "tests/integration/practice-scoring/management.integration.ts",
      ...(process.env.PRACTICE_HTTP_DIST
        ? ["tests/integration/practice-scoring/management-http.integration.ts"]
        : []),
    ]) {
      run([
        "--conditions=react-server",
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        resolve(file),
      ]);
    }
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Scoring integration failed",
  );
  process.exitCode = 1;
});
