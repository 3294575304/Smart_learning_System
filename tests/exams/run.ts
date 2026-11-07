import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../integration/database";

function run(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Exam integration exited with status ${result.status ?? "unknown"}`,
    );
}
async function main() {
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `exam_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    AI_PROVIDER: "mock",
  };
  try {
    run(
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      env,
    );
    run([resolve("node_modules/prisma/build/index.js"), "db", "seed"], env);
    run(
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve("tests/exams/integration.ts"),
      ],
      env,
    );
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Exam integration failed",
  );
  process.exitCode = 1;
});
