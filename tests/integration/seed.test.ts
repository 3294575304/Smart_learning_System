import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "./database";
import { assertSafeSeedDatabase } from "../../prisma/seed-safety";

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

test("demo seed refuses production and unsafe remote targets", () => {
  assert.throws(
    () =>
      assertSafeSeedDatabase({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
        NODE_ENV: "production",
      }),
    /production environment/u,
  );
  assert.throws(
    () =>
      assertSafeSeedDatabase({
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/zhixue_production",
      }),
    /production or staging target/u,
  );
  assert.throws(
    () =>
      assertSafeSeedDatabase({
        DATABASE_URL:
          "postgresql://postgres:postgres@db.example.com:5432/zhixue",
      }),
    /remote database/u,
  );
});

test("demo seed allows local, dev, test, and demo targets", () => {
  assert.doesNotThrow(() =>
    assertSafeSeedDatabase({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/zhixue",
    }),
  );
  assert.doesNotThrow(() =>
    assertSafeSeedDatabase({
      DATABASE_URL:
        "postgresql://postgres:postgres@db.example.com:5432/zhixue_dev",
    }),
  );
  assert.doesNotThrow(() =>
    assertSafeSeedDatabase({
      DATABASE_URL:
        "postgresql://postgres:postgres@db.example.com:5432/zhixue_test",
    }),
  );
  assert.doesNotThrow(() =>
    assertSafeSeedDatabase({
      DATABASE_URL:
        "postgresql://postgres:postgres@db.example.com:5432/zhixue_demo",
    }),
  );
});

async function captureUniversityDemoSnapshot(
  client: PrismaClient,
): Promise<Record<string, number>> {
  const [
    userCount,
    classroomCount,
    courseTemplateCount,
    pythonTemplateAvailableCount,
    courseCount,
    knowledgePointCount,
    questionCount,
  ] = await Promise.all([
    client.user.count({
      where: { email: { startsWith: "net-" } },
    }),
    client.classroom.count({
      where: { joinCode: "CNSE2024" },
    }),
    client.courseTemplate.count({
      where: { code: "python-programming-v1" },
    }),
    client.courseTemplate.count({
      where: {
        code: "python-programming-v1",
        isActive: true,
        isBuiltin: true,
      },
    }),
    client.course.count({
      where: {
        courseNo: "PYTHON-2026",
        term: "2026-2027-1",
      },
    }),
    client.knowledgePoint.count({
      where: { code: { startsWith: "CN-" } },
    }),
    client.question.count({
      where: {
        creator: { email: "net-teacher@example.com" },
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
  ]);

  const [
    questionOptionCount,
    assignmentCount,
    submissionCount,
    studentAnswerCount,
  ] = await Promise.all([
    client.questionOption.count({
      where: {
        question: { creator: { email: "net-teacher@example.com" } },
      },
    }),
    client.assignment.count({
      where: { teacher: { email: "net-teacher@example.com" } },
    }),
    client.submission.count({
      where: {
        assignment: {
          classroom: { joinCode: "CNSE2024" },
        },
      },
    }),
    client.studentAnswer.count({
      where: {
        submission: {
          assignment: {
            classroom: { joinCode: "CNSE2024" },
          },
        },
      },
    }),
  ]);

  const [
    wrongQuestionCount,
    analysisCount,
    insightCount,
    recommendationCount,
    masteryCount,
  ] = await Promise.all([
    client.wrongQuestion.count({
      where: {
        assignmentQuestion: {
          is: {
            assignment: {
              classroom: { joinCode: "CNSE2024" },
            },
          },
        },
      },
    }),
    client.aIAnalysis.count({
      where: { requestKey: { startsWith: "seed-network-" } },
    }),
    client.aIAnalysisInsight.count({
      where: {
        analysis: { requestKey: { startsWith: "seed-network-" } },
      },
    }),
    client.personalizedRecommendation.count({
      where: { cycleKey: { startsWith: "2024-network-" } },
    }),
    client.studentKnowledgeMastery.count({
      where: {
        student: { email: { startsWith: "net-student-" } },
        knowledgePoint: { code: { startsWith: "CN-" } },
      },
    }),
  ]);

  return {
    userCount,
    classroomCount,
    courseTemplateCount,
    pythonTemplateAvailableCount,
    courseCount,
    knowledgePointCount,
    questionCount,
    questionOptionCount,
    assignmentCount,
    submissionCount,
    studentAnswerCount,
    wrongQuestionCount,
    analysisCount,
    insightCount,
    recommendationCount,
    masteryCount,
  };
}

test("university demo seed is repeatable and complete", async () => {
  const baseUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `seed_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(baseUrl, schema),
  };
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  const client = new PrismaClient({
    datasourceUrl: environment.DATABASE_URL,
  });

  try {
    run(process.execPath, [prismaCli, "migrate", "deploy"], environment);
    run(process.execPath, [prismaCli, "db", "seed"], environment);

    const first = await captureUniversityDemoSnapshot(client);
    assert.deepEqual(first, {
      userCount: 4,
      classroomCount: 1,
      courseTemplateCount: 1,
      pythonTemplateAvailableCount: 1,
      courseCount: 1,
      knowledgePointCount: 8,
      questionCount: 15,
      questionOptionCount: 24,
      assignmentCount: 2,
      submissionCount: 6,
      studentAnswerCount: 45,
      wrongQuestionCount: 15,
      analysisCount: 4,
      insightCount: 8,
      recommendationCount: 3,
      masteryCount: 24,
    });

    run(process.execPath, [prismaCli, "db", "seed"], environment);
    const second = await captureUniversityDemoSnapshot(client);
    assert.deepEqual(second, first);
  } finally {
    await client.$disconnect();
    await dropIsolatedSchema(baseUrl, schema);
  }
});
