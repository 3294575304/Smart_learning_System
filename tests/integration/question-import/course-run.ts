import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../database";

function run(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Teaching workflow test exited with status ${result.status ?? "unknown"}`,
    );
}
async function main() {
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `teaching_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const environment = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    LOCAL_UPLOAD_ROOT: resolve(".data", "teaching-tests", schema),
    AI_PROVIDER: "mock",
  };
  const cli = resolve("node_modules/prisma/build/index.js");
  try {
    run([cli, "migrate", "deploy"], environment);
    run(["--import", "tsx", resolve("prisma/seed.ts")], environment);
    run(
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve("tests/questions/course-import.integration.ts"),
        ...process.argv.slice(2),
      ],
      environment,
    );
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Teaching workflow verification failed",
  );
  process.exitCode = 1;
});
