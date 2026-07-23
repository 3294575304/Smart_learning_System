import "dotenv/config";

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../database";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status ?? "unknown"}`,
    );
  }
}

async function main(): Promise<void> {
  const baseUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `http_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(baseUrl, schema),
    HTTP_INTEGRATION_SCHEMA: schema,
    AI_PROVIDER: "mock",
  };
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  const testFiles = [
    "tests/auth/http-integration.ts",
    "tests/admin/http-integration.ts",
    "tests/classrooms/http-integration.ts",
    "tests/questions/http-integration.ts",
    "tests/assignments/http-integration.ts",
    "tests/ai-analysis/http-integration.ts",
    "tests/recommendations/http-integration.ts",
    "tests/notifications/http-integration.ts",
    "tests/wrong-questions/http-integration.ts",
  ];

  try {
    run(process.execPath, [prismaCli, "migrate", "deploy"], environment);
    run(process.execPath, [prismaCli, "db", "seed"], environment);
    for (const testFile of testFiles) {
      run(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", resolve(testFile)],
        environment,
      );
    }
  } finally {
    await dropIsolatedSchema(baseUrl, schema);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`HTTP integration test runner failed: ${message}`);
  process.exitCode = 1;
});
