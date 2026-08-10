import "dotenv/config";

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../integration/database";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

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
  const executorUrl = required("SANDBOX_EXECUTOR_URL");
  const executorApiKey = required("SANDBOX_EXECUTOR_API_KEY");
  if (executorApiKey.length < 32) {
    throw new Error("SANDBOX_EXECUTOR_API_KEY must contain 32 characters");
  }
  const schema = `programming_runtime_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(baseUrl, schema),
    HTTP_INTEGRATION_SCHEMA: schema,
    AI_PROVIDER: "mock",
    PROGRAMMING_RUNTIME_EXECUTOR_URL: executorUrl,
    PROGRAMMING_RUNTIME_EXECUTOR_API_KEY: executorApiKey,
  };
  const prismaCli = resolve("node_modules/prisma/build/index.js");

  try {
    run(process.execPath, [prismaCli, "migrate", "deploy"], environment);
    run(process.execPath, [prismaCli, "db", "seed"], environment);
    run(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve("tests/programming-attempts/http-integration.ts"),
      ],
      environment,
    );
  } finally {
    await dropIsolatedSchema(baseUrl, schema);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Real programming runtime integration failed: ${message}`);
  process.exitCode = 1;
});
