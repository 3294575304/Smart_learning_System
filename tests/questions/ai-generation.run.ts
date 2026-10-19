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
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`AI 出题集成阶段失败：${result.status ?? "unknown"}`);
}

async function main() {
  const baseUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `ai_question_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(baseUrl, schema),
    HTTP_INTEGRATION_SCHEMA: schema,
    AI_PROVIDER: "mock",
  };
  try {
    const prismaCli = resolve("node_modules/prisma/build/index.js");
    run([prismaCli, "migrate", "deploy"], env);
    run([prismaCli, "db", "seed"], env);
    run(
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve("tests/questions/ai-generation.integration.ts"),
      ],
      env,
    );
  } finally {
    await dropIsolatedSchema(baseUrl, schema);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "AI 出题集成失败");
  process.exitCode = 1;
});
