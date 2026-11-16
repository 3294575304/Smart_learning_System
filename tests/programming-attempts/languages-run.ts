import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../integration/database";

async function main() {
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `programming_languages_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    HTTP_INTEGRATION_SCHEMA: schema,
    AI_PROVIDER: "mock",
  };
  try {
    for (const args of [
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve("tests/programming-attempts/languages.integration.ts"),
      ],
    ]) {
      const result = spawnSync(process.execPath, args, {
        env,
        windowsHide: true,
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `Programming language integration exited with ${result.status}`,
        );
    }
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Programming language integration failed",
  );
  process.exitCode = 1;
});
