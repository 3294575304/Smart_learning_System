import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import test from "node:test";

import { RecommendationStatus } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import { integrationPrisma } from "./database";
import { RecommendationTestFactory } from "./factories";

interface ApiEnvelope {
  success: boolean;
  data?: {
    studentId?: string;
    items?: Array<Record<string, unknown>>;
  };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(baseUrl: string, output: string[]): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Next.js test server did not start:\n${output.join("")}`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000)),
  ]);
}

function assertSafeRecommendationResponse(value: unknown): void {
  const forbidden = new Set([
    "acceptableAnswers",
    "correctBoolean",
    "creatorId",
    "deletedAt",
    "explanation",
    "isCorrect",
    "passwordHash",
    "referenceAnswer",
    "updatedAt",
  ]);
  if (Array.isArray(value)) {
    value.forEach(assertSafeRecommendationResponse);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.equal(
        forbidden.has(key),
        false,
        `API leaked forbidden field ${key}`,
      );
      assertSafeRecommendationResponse(child);
    }
  }
}

test("authenticated API executes through service and repository against PostgreSQL without leaking answers or other students", async (t) => {
  const factory = new RecommendationTestFactory("api_chain");
  const output: string[] = [];
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextCli = resolve("node_modules/next/dist/bin/next");
  const server = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  server.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  t.after(async () => {
    await stopServer(server);
    await factory.cleanup();
  });

  await waitForServer(baseUrl, output);
  const [teacher, student, otherStudent, admin] = await Promise.all([
    factory.teacher(),
    factory.student(),
    factory.student(),
    factory.admin(),
  ]);
  const classroom = await factory.classroom(teacher.id);
  await Promise.all([
    factory.membership(classroom.id, student.id),
    factory.membership(classroom.id, otherStudent.id),
  ]);
  const [question, otherQuestion] = await Promise.all([
    factory.question(teacher.id),
    factory.question(teacher.id),
  ]);
  await factory.recommendation({
    studentId: otherStudent.id,
    questionId: otherQuestion.id,
    status: RecommendationStatus.PENDING,
  });
  const [studentCookie, adminCookie] = await Promise.all([
    factory.sessionCookie(student.id),
    factory.sessionCookie(admin.id),
  ]);

  const unauthenticated = await fetch(`${baseUrl}/api/recommendations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      studentId: student.id,
      classroomId: classroom.id,
      recommendedDifficulty: 3,
      limit: 1,
    }),
  });
  assert.equal(unauthenticated.status, 401);

  const adminResponse = await fetch(`${baseUrl}/api/recommendations`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({
      studentId: student.id,
      classroomId: classroom.id,
      recommendedDifficulty: 3,
      limit: 1,
    }),
  });
  assert.equal(adminResponse.status, 403);

  const response = await fetch(`${baseUrl}/api/recommendations`, {
    method: "POST",
    headers: { cookie: studentCookie, "content-type": "application/json" },
    body: JSON.stringify({
      studentId: student.id,
      classroomId: classroom.id,
      recommendedDifficulty: 3,
      limit: 1,
    }),
  });
  assert.equal(response.status, 200, output.join(""));
  const body = (await response.json()) as ApiEnvelope;
  assert.equal(body.success, true);
  assert.equal(body.data?.studentId, student.id);
  assert.equal(body.data?.items?.length, 1);
  assert.ok(
    [question.id, otherQuestion.id].includes(
      String(body.data?.items?.[0]?.questionId),
    ),
  );
  assertSafeRecommendationResponse(body);
  assert.equal(JSON.stringify(body).includes(otherStudent.id), false);

  assert.equal(
    await integrationPrisma.personalizedRecommendation.count({
      where: { studentId: student.id },
    }),
    1,
  );
});

test.after(async () => {
  await Promise.all([integrationPrisma.$disconnect(), prisma.$disconnect()]);
});
