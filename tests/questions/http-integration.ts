import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  Prisma,
  PrismaClient,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface QuestionResponse {
  id: string;
  title: string;
  visibility: QuestionVisibility;
}

interface DeleteResponse {
  questionId: string;
  mode: "PHYSICAL" | "ARCHIVED";
}

const prisma = new PrismaClient();
const port = 3102;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const questionIds: string[] = [];
const assignmentIds: string[] = [];

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
    env: process.env,
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
      // Production server is still starting.
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

async function requestJson(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function questionInput(
  knowledgePointId: string,
  visibility: QuestionVisibility = QuestionVisibility.PRIVATE,
) {
  return {
    title: `集成测试题-${randomBytes(3).toString("hex")}`,
    content: "下列哪一项等于 2 + 3？",
    type: QuestionType.SINGLE_CHOICE,
    difficulty: 2,
    options: [
      { label: "A", content: "4", sortOrder: 1 },
      { label: "B", content: "5", sortOrder: 2 },
    ],
    answer: { kind: "CHOICE", correctOptionLabels: ["B"] },
    explanation: "2 + 3 = 5。",
    knowledgePointIds: [knowledgePointId],
    tags: ["集成测试"],
    visibility,
  };
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [teacher, teacherTwo, student, knowledgePoint, classroom] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher2@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "student@example.com" },
        }),
        prisma.knowledgePoint.findFirstOrThrow({ where: { isActive: true } }),
        prisma.classroom.findFirstOrThrow({
          where: { teacher: { email: "teacher@example.com" } },
        }),
      ]);
    const [teacherCookie, teacherTwoCookie, studentCookie] = await Promise.all([
      sessionCookie(teacher.id),
      sessionCookie(teacherTwo.id),
      sessionCookie(student.id),
    ]);

    assert.equal((await requestJson("/api/teacher/questions")).status, 401);
    assert.equal(
      (
        await requestJson(
          "/api/teacher/questions",
          studentCookie,
          "POST",
          questionInput(knowledgePoint.id),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson("/api/teacher/questions", teacherCookie, "POST", {
          ...questionInput(knowledgePoint.id),
          difficulty: 9,
        })
      ).status,
      400,
    );

    const createResponse = await requestJson(
      "/api/teacher/questions",
      teacherCookie,
      "POST",
      questionInput(knowledgePoint.id),
    );
    assert.equal(createResponse.status, 201);
    const created =
      (await createResponse.json()) as ApiSuccess<QuestionResponse>;
    questionIds.push(created.data.id);

    assert.equal(
      (
        await requestJson(
          `/api/teacher/questions/${created.data.id}`,
          teacherTwoCookie,
        )
      ).status,
      404,
    );

    const publicInput = questionInput(
      knowledgePoint.id,
      QuestionVisibility.PUBLIC,
    );
    const updateResponse = await requestJson(
      `/api/teacher/questions/${created.data.id}`,
      teacherCookie,
      "PATCH",
      { ...publicInput, title: created.data.title },
    );
    assert.equal(updateResponse.status, 200);
    assert.equal(
      (
        await requestJson(
          `/api/teacher/questions/${created.data.id}`,
          teacherTwoCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await requestJson(
          `/api/teacher/questions/${created.data.id}`,
          teacherTwoCookie,
          "PATCH",
          publicInput,
        )
      ).status,
      403,
    );

    const copyResponse = await requestJson(
      `/api/teacher/questions/${created.data.id}/copy`,
      teacherTwoCookie,
      "POST",
    );
    assert.equal(copyResponse.status, 201);
    const copied = (await copyResponse.json()) as ApiSuccess<QuestionResponse>;
    questionIds.push(copied.data.id);
    assert.equal(copied.data.visibility, QuestionVisibility.PRIVATE);
    const copiedDelete = await requestJson(
      `/api/teacher/questions/${copied.data.id}`,
      teacherTwoCookie,
      "DELETE",
    );
    assert.equal(copiedDelete.status, 200);
    assert.equal(
      ((await copiedDelete.json()) as ApiSuccess<DeleteResponse>).data.mode,
      "PHYSICAL",
    );

    const listResponse = await requestJson(
      `/api/teacher/questions?scope=PUBLIC&type=SINGLE_CHOICE&difficulty=2&knowledgePointId=${knowledgePoint.id}`,
      teacherTwoCookie,
    );
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as ApiSuccess<{
      items: Array<{ id: string }>;
    }>;
    assert.equal(
      listed.data.items.some((item) => item.id === created.data.id),
      true,
    );

    const assignment = await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        teacherId: teacher.id,
        title: "题库删除引用测试",
      },
    });
    assignmentIds.push(assignment.id);
    await prisma.assignmentQuestion.create({
      data: {
        assignmentId: assignment.id,
        questionId: created.data.id,
        sortOrder: 1,
        points: new Prisma.Decimal(5),
        titleSnapshot: created.data.title,
        contentSnapshot: publicInput.content,
        typeSnapshot: QuestionType.SINGLE_CHOICE,
        difficultySnapshot: 2,
        explanationSnapshot: publicInput.explanation,
        acceptableAnswersSnapshot: [],
        isCaseSensitiveSnapshot: false,
        gradingConfigSnapshot: { mode: "EXACT_SET" },
      },
    });
    const referencedDelete = await requestJson(
      `/api/teacher/questions/${created.data.id}`,
      teacherCookie,
      "DELETE",
    );
    assert.equal(referencedDelete.status, 200);
    assert.equal(
      ((await referencedDelete.json()) as ApiSuccess<DeleteResponse>).data.mode,
      "ARCHIVED",
    );
    const archived = await prisma.question.findUniqueOrThrow({
      where: { id: created.data.id },
    });
    assert.ok(archived.deletedAt);
    assert.equal(
      await prisma.assignmentQuestion.count({
        where: { questionId: created.data.id },
      }),
      1,
    );

    console.info(
      "Question HTTP integration checks passed: auth, RBAC, ownership, public copy, filtering, physical deletion, and referenced archival.",
    );
  } finally {
    if (assignmentIds.length > 0) {
      await prisma.assignmentQuestion.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      });
      await prisma.assignment.deleteMany({
        where: { id: { in: assignmentIds } },
      });
    }
    if (questionIds.length > 0) {
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    }
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    await prisma.$disconnect();
    server.kill();
    await Promise.race([
      once(server, "exit"),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
