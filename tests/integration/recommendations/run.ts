import "dotenv/config";

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

function databaseIdentity(value: string): string {
  const url = new URL(value);
  return `${url.protocol}//${url.username}@${url.hostname}:${url.port || "5432"}${url.pathname}`.toLowerCase();
}

function validateTestDatabaseUrl(value: string | undefined): URL {
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required. Integration tests never fall back to DATABASE_URL.",
    );
  }
  const url = new URL(value);
  if (!url.protocol.startsWith("postgres")) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/test/iu.test(databaseName)) {
    throw new Error(
      `Unsafe test database name "${databaseName}": its name must contain "test".`,
    );
  }
  if (
    process.env.DATABASE_URL &&
    databaseIdentity(value) === databaseIdentity(process.env.DATABASE_URL)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must not point to the same database as DATABASE_URL.",
    );
  }
  return url;
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
  const schema = `recommendation_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const isolatedUrl = new URL(baseUrl);
  isolatedUrl.searchParams.set("schema", schema);
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedUrl.toString(),
    RECOMMENDATION_INTEGRATION_SCHEMA: schema,
    NODE_ENV: "test",
  };
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  const allTestFiles = [
    resolve(
      "tests/integration/recommendations/recommendation-service.integration.test.ts",
    ),
    resolve(
      "tests/integration/recommendations/recommendation-api.integration.test.ts",
    ),
    resolve(
      "tests/integration/notifications/notification-service.integration.test.ts",
    ),
  ];
  const requestedSuite = process.env.INTEGRATION_SUITE ?? "all";
  if (!["all", "recommendations", "notifications"].includes(requestedSuite)) {
    throw new Error(
      "INTEGRATION_SUITE must be all, recommendations, or notifications.",
    );
  }
  const testFiles =
    requestedSuite === "notifications"
      ? [allTestFiles[2]]
      : requestedSuite === "recommendations"
        ? allTestFiles.slice(0, 2)
        : allTestFiles;

  try {
    run(process.execPath, [prismaCli, "migrate", "deploy"], environment);
    run(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        ...testFiles,
      ],
      environment,
    );
  } finally {
    const cleanupUrl = new URL(baseUrl);
    cleanupUrl.searchParams.set("schema", "public");
    const cleanupClient = new PrismaClient({
      datasourceUrl: cleanupUrl.toString(),
    });
    try {
      if (/^recommendation_it_[a-z0-9_]+$/u.test(schema)) {
        await cleanupClient.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
      }
    } finally {
      await cleanupClient.$disconnect();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Recommendation integration test runner failed: ${message}`);
  process.exitCode = 1;
});
