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
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Provisioning check exited with status ${result.status ?? "unknown"}`,
    );
}

async function main() {
  const baseUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `school_admin_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(baseUrl, schema),
    SUPER_ADMIN_PROVISIONING_SCHEMA: schema,
    NODE_ENV: "test",
  };
  try {
    run(
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      environment,
    );
    run(
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        resolve(
          "tests/integration/super-admin/provisioning.integration.test.ts",
        ),
      ],
      environment,
    );
  } finally {
    await dropIsolatedSchema(baseUrl, schema);
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
