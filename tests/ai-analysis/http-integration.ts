import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  MembershipStatus,
  PrismaClient,
  SubmissionStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

interface ApiEnvelope {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

const prisma = new PrismaClient();
const port = 3105;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const createdAnalysisIds: string[] = [];
let studentIdForCleanup: string | undefined;
let membershipToRestore:
  { id: string; status: MembershipStatus; endedAt: Date | null } | undefined;

const server = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_PROVIDER: "mock",
      AI_PSEUDONYM_SALT: "http-integration-pseudonym-salt",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (chunk: Buffer) =>
  serverOutput.push(chunk.toString()),
);
server.stderr.on("data", (chunk: Buffer) =>
  serverOutput.push(chunk.toString()),
);

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // Starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Test server did not start:\n${serverOutput.join("")}`);
}

async function sessionCookie(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 120_000),
    },
  });
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function apiRequest(
  path: string,
  method: "GET" | "POST",
  cookie?: string,
): Promise<{ response: Response; body: ApiEnvelope }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  return { response, body: (await response.json()) as ApiEnvelope };
}

async function main(): Promise<void> {
  await waitForServer();
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  studentIdForCleanup = student.id;
  await prisma.aIAnalysis.deleteMany({
    where: {
      studentId: student.id,
      provider: "mock",
      model: "mock-student-analyzer-v1",
    },
  });
  const otherStudent = await prisma.user.findUniqueOrThrow({
    where: { email: "student2@example.com" },
  });
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const submission = await prisma.submission.findFirstOrThrow({
    where: {
      studentId: student.id,
      status: { in: [SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED] },
    },
    orderBy: { createdAt: "desc" },
    include: { assignment: { select: { classroomId: true } } },
  });
  const membership = await prisma.classMembership.findUniqueOrThrow({
    where: {
      classroomId_studentId: {
        classroomId: submission.assignment.classroomId,
        studentId: student.id,
      },
    },
    select: { id: true, status: true, endedAt: true },
  });
  membershipToRestore = membership;
  await prisma.classMembership.update({
    where: { id: membership.id },
    data: { status: MembershipStatus.ACTIVE, endedAt: null },
  });
  const preexistingIds = new Set(
    (
      await prisma.aIAnalysis.findMany({
        where: { studentId: student.id },
        select: { id: true },
      })
    ).map((item) => item.id),
  );
  const path = `/api/student/submissions/${submission.id}/analysis`;

  const unauthenticated = await apiRequest(path, "POST");
  assert.equal(unauthenticated.response.status, 401);

  const teacherRequest = await apiRequest(
    path,
    "POST",
    await sessionCookie(teacher.id),
  );
  assert.equal(teacherRequest.response.status, 403);

  const otherStudentRequest = await apiRequest(
    path,
    "POST",
    await sessionCookie(otherStudent.id),
  );
  assert.equal(otherStudentRequest.response.status, 404);

  const studentCookie = await sessionCookie(student.id);
  const first = await apiRequest(path, "POST", studentCookie);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.success, true);
  assert.deepEqual(Object.keys(first.body.data ?? {}).sort(), [
    "confidence",
    "errorPatterns",
    "masteredKnowledgePoints",
    "overallLevel",
    "recommendedDifficulty",
    "suggestions",
    "weakKnowledgePoints",
  ]);

  const countAfterFirst = await prisma.aIAnalysis.count({
    where: { studentId: student.id },
  });
  const second = await apiRequest(path, "POST", studentCookie);
  const countAfterSecond = await prisma.aIAnalysis.count({
    where: { studentId: student.id },
  });
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.body.data, first.body.data);
  assert.equal(countAfterSecond, countAfterFirst);

  const read = await apiRequest(path, "GET", studentCookie);
  assert.equal(read.response.status, 200);
  assert.deepEqual(read.body.data, first.body.data);

  const gradeResult = await apiRequest(
    `/api/student/submissions/${submission.id}/result`,
    "GET",
    studentCookie,
  );
  assert.equal(gradeResult.response.status, 200);
  assert.equal(gradeResult.body.success, true);

  const currentAnalyses = await prisma.aIAnalysis.findMany({
    where: { studentId: student.id },
    select: { id: true },
  });
  createdAnalysisIds.push(
    ...currentAnalyses
      .map((item) => item.id)
      .filter((id) => !preexistingIds.has(id)),
  );
  console.log("AI analysis HTTP integration checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    console.error(serverOutput.join(""));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (membershipToRestore) {
      await prisma.classMembership.update({
        where: { id: membershipToRestore.id },
        data: {
          status: membershipToRestore.status,
          endedAt: membershipToRestore.endedAt,
        },
      });
    }
    if (createdAnalysisIds.length > 0) {
      await prisma.aIAnalysis.deleteMany({
        where: { id: { in: createdAnalysisIds } },
      });
    }
    if (studentIdForCleanup) {
      await prisma.aIAnalysis.deleteMany({
        where: {
          studentId: studentIdForCleanup,
          provider: "mock",
          model: "mock-student-analyzer-v1",
        },
      });
    }
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    server.kill();
    if (server.exitCode === null) await once(server, "exit");
    await prisma.$disconnect();
  });
