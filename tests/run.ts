import "dotenv/config";

import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "./integration/database";

const testDirectories = [
  "auth",
  "admin",
  "classrooms",
  "course-rosters",
  "courses",
  "course-files",
  "questions",
  "exams",
  "programming-questions",
  "programming-attempts",
  "assignments",
  "assignment-results",
  "assessment-schemes",
  "gradebook",
  "attendance",
  "outcome-attainment",
  "course-surveys",
  "quality-reports",
  "ai-analysis",
  "recommendations",
  "course-recommendations",
  "notifications",
  "wrong-questions",
  "knowledge-graph",
  "concept-mastery",
  "learner-profiles",
  "question-mapping",
  "background-jobs",
  "learning-events",
  "sandbox-executor",
  "integration",
  "ui",
] as const;

// These service tests import the server-only marker through their production modules.
// React UI tests must keep the default export condition.
const serverOnlyTests = new Set([
  "assessment-schemes/service.test.ts",
  "classrooms/dissolution-service.test.ts",
  "course-files/service.test.ts",
  "course-files/student-import-execution.test.ts",
  "course-files/student-import-preview.test.ts",
  "courses/service.test.ts",
  "courses/syllabus-parsing.test.ts",
  "courses/syllabus-review.test.ts",
  "courses/syllabus-service.test.ts",
]);

function run(args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Test command exited with status ${result.status ?? "unknown"}`,
    );
  }
}

async function main(): Promise<void> {
  const requestedFile = process.argv[2];
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `unit_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    AI_PROVIDER: "mock",
    SEED_SUPER_ADMIN_PASSWORD:
      process.env.SEED_SUPER_ADMIN_PASSWORD ??
      `Test-${randomBytes(24).toString("base64url")}-Aa1!`,
  };
  const files = testDirectories.flatMap((directory) =>
    readdirSync(resolve("tests", directory))
      .filter((filename) => filename.endsWith(".test.ts"))
      .map((filename) => `${directory}/${filename}`),
  );
  const seedTest = "integration/seed.test.ts";
  if (requestedFile && !files.includes(requestedFile)) {
    throw new Error(`Unknown test file: ${requestedFile}`);
  }

  try {
    run(
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      env,
    );
    run([resolve("node_modules/prisma/build/index.js"), "db", "seed"], env);
    for (const useServerCondition of [false, true]) {
      const selected = files.filter((file) =>
        (requestedFile && file !== requestedFile) || file === seedTest
          ? false
          : useServerCondition
            ? serverOnlyTests.has(file)
            : !serverOnlyTests.has(file),
      );
      if (selected.length === 0) continue;
      run(
        [
          ...(useServerCondition ? ["--conditions=react-server"] : []),
          "--import",
          "tsx",
          "--test",
          "--test-concurrency=1",
          ...selected.map((file) => resolve("tests", file)),
        ],
        env,
      );
    }
    // This test creates its own schema and checks the test URL against the
    // original development URL, so it runs outside the outer schema.
    if (!requestedFile || requestedFile === seedTest) {
      run(
        ["--import", "tsx", "--test", resolve("tests", seedTest)],
        process.env,
      );
    }
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unit tests failed");
  process.exitCode = 1;
});
