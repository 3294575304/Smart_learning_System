import "dotenv/config";

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../database";

function run(args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Integration command exited with ${result.status ?? "unknown"}`,
    );
  }
}

async function main(): Promise<void> {
  const baseUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `classroom_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(baseUrl, schema),
    COURSE_CLASSROOM_INTEGRATION_SCHEMA: schema,
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
        "--test",
        resolve("tests/courses/course-classroom-creation.integration.ts"),
      ],
      env,
    );
  } finally {
    await dropIsolatedSchema(baseUrl, schema);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
