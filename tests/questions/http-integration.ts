import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  Prisma,
  PrismaClient,
  ProgrammingTestVisibility,
  QuestionType,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface QuestionResponse {
  id: string;
  title: string;
  questionCategoryId: string | null;
  revision: number;
}

interface DeleteResponse {
  questionId: string;
  mode: "ARCHIVED";
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
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
      // The production server is still starting.
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

function questionInput(knowledgePointId: string, questionCategoryId: string) {
  return {
    title: `共享题库集成题-${randomBytes(3).toString("hex")}`,
    content: "下列哪一项等于 2 + 3？",
    type: QuestionType.SINGLE_CHOICE,
    questionCategoryId,
    difficulty: 2,
    options: [
      { label: "A", content: "4", sortOrder: 1 },
      { label: "B", content: "5", sortOrder: 2 },
    ],
    answer: { kind: "CHOICE", correctOptionLabels: ["B"] },
    explanation: "2 + 3 = 5。",
    knowledgePointIds: [knowledgePointId],
    tags: ["共享题库集成测试"],
  };
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [teacher, teacherTwo, student, admin, knowledgePoint, classroom] =
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
        prisma.user.findUniqueOrThrow({
          where: { email: "admin@example.com" },
        }),
        prisma.knowledgePoint.findFirstOrThrow({ where: { isActive: true } }),
        prisma.classroom.findFirstOrThrow({
          where: { teacher: { email: "teacher@example.com" } },
          include: { course: { select: { questionCategoryId: true } } },
        }),
      ]);
    const category = classroom.course
      ? await prisma.questionCourseCategory.findUniqueOrThrow({
          where: { id: classroom.course.questionCategoryId },
          select: { id: true },
        })
      : await prisma.questionCourseCategory.findFirstOrThrow({
          where: { isActive: true },
          select: { id: true },
        });
    const [teacherCookie, teacherTwoCookie, studentCookie, adminCookie] =
      await Promise.all([
        sessionCookie(teacher.id),
        sessionCookie(teacherTwo.id),
        sessionCookie(student.id),
        sessionCookie(admin.id),
      ]);

    assert.equal((await requestJson("/api/teacher/questions")).status, 401);
    assert.equal(
      (
        await requestJson(
          "/api/teacher/questions",
          studentCookie,
          "POST",
          questionInput(knowledgePoint.id, category.id),
        )
      ).status,
      403,
    );
    const missingCategory = questionInput(knowledgePoint.id, category.id);
    delete (missingCategory as Partial<typeof missingCategory>)
      .questionCategoryId;
    assert.equal(
      (
        await requestJson(
          "/api/teacher/questions",
          teacherCookie,
          "POST",
          missingCategory,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await requestJson("/api/teacher/questions", teacherCookie, "POST", {
          ...questionInput(knowledgePoint.id, category.id),
          difficulty: 9,
        })
      ).status,
      400,
    );

    const createResponse = await requestJson(
      "/api/teacher/questions",
      teacherCookie,
      "POST",
      questionInput(knowledgePoint.id, category.id),
    );
    assert.equal(createResponse.status, 201);
    const created =
      (await createResponse.json()) as ApiSuccess<QuestionResponse>;
    questionIds.push(created.data.id);
    assert.equal(created.data.questionCategoryId, category.id);

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
          studentCookie,
        )
      ).status,
      403,
    );

    const sharedEdit = {
      ...questionInput(knowledgePoint.id, category.id),
      title: created.data.title,
      revision: created.data.revision,
    };
    const updateResponse = await requestJson(
      `/api/teacher/questions/${created.data.id}`,
      teacherTwoCookie,
      "PATCH",
      sharedEdit,
    );
    assert.equal(updateResponse.status, 200);
    const updated =
      (await updateResponse.json()) as ApiSuccess<QuestionResponse>;
    assert.equal(updated.data.revision, created.data.revision + 1);
    assert.equal(
      (
        await requestJson(
          `/api/teacher/questions/${created.data.id}`,
          teacherCookie,
          "PATCH",
          sharedEdit,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await requestJson(
          `/api/teacher/questions/${created.data.id}/copy`,
          teacherCookie,
          "POST",
        )
      ).status,
      404,
    );

    const listResponse = await requestJson(
      `/api/teacher/questions?scope=OWNED&categoryId=${category.id}&type=SINGLE_CHOICE&difficulty=2`,
      teacherTwoCookie,
    );
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as ApiSuccess<{
      items: Array<{ id: string }>;
    }>;
    assert.ok(listed.data.items.some((item) => item.id === created.data.id));

    const programmingQuestion = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        questionCategoryId: category.id,
        title: `共享编程题-${randomBytes(3).toString("hex")}`,
        content: "实现两个整数相加。",
        type: QuestionType.PYTHON_PROGRAMMING,
        difficulty: 2,
        status: "ACTIVE",
        explanation: "读取两个整数并输出其和。",
        gradingConfig: { mode: "ASYNC_PROGRAMMING" },
      },
    });
    questionIds.push(programmingQuestion.id);
    const programmingConfigResponse = await requestJson(
      `/api/teacher/questions/${programmingQuestion.id}/programming-config`,
      teacherTwoCookie,
      "POST",
      {
        standardCode: "a, b = map(int, input().split())\nprint(a + b)",
        starterCode: "a, b = map(int, input().split())\n",
        totalPoints: 10,
        limits: {
          cpuTimeMs: 1000,
          wallTimeMs: 3000,
          memoryBytes: 67_108_864,
          outputBytes: 16_384,
          processCount: 4,
        },
        testCases: [
          {
            visibility: ProgrammingTestVisibility.PUBLIC,
            name: "公开样例",
            stdin: "2 3\n",
            expectedOutput: "5\n",
            points: 5,
            sortOrder: 1,
          },
          {
            visibility: ProgrammingTestVisibility.HIDDEN,
            name: "隐藏用例",
            stdin: "10 7\n",
            expectedOutput: "17\n",
            points: 5,
            sortOrder: 2,
          },
        ],
      },
    );
    assert.equal(programmingConfigResponse.status, 201);
    assert.equal(
      (
        await requestJson(
          `/api/teacher/questions/${programmingQuestion.id}/programming-config`,
          teacherCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      await prisma.programmingTestCase.count({
        where: {
          configRevision: { questionId: programmingQuestion.id },
          visibility: ProgrammingTestVisibility.HIDDEN,
        },
      }),
      1,
    );

    const assignment = await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        teacherId: teacher.id,
        title: "共享题目历史快照测试",
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
        contentSnapshot: sharedEdit.content,
        typeSnapshot: QuestionType.SINGLE_CHOICE,
        difficultySnapshot: 2,
        explanationSnapshot: sharedEdit.explanation,
        acceptableAnswersSnapshot: [],
        isCaseSensitiveSnapshot: false,
        gradingConfigSnapshot: { mode: "EXACT_SET" },
      },
    });
    const snapshotBeforeArchive =
      await prisma.assignmentQuestion.findFirstOrThrow({
        where: { assignmentId: assignment.id, questionId: created.data.id },
      });

    const archivedResponse = await requestJson(
      `/api/teacher/questions/${created.data.id}`,
      teacherCookie,
      "DELETE",
    );
    assert.equal(archivedResponse.status, 200);
    assert.equal(
      ((await archivedResponse.json()) as ApiSuccess<DeleteResponse>).data.mode,
      "ARCHIVED",
    );
    const archived = await prisma.question.findUniqueOrThrow({
      where: { id: created.data.id },
    });
    assert.equal(archived.status, "ARCHIVED");
    assert.equal(archived.deletedAt, null);
    assert.equal(
      await prisma.assignmentQuestion.count({
        where: { assignmentId: assignment.id, questionId: created.data.id },
      }),
      1,
    );
    const snapshotAfterArchive =
      await prisma.assignmentQuestion.findUniqueOrThrow({
        where: { id: snapshotBeforeArchive.id },
      });
    assert.equal(
      snapshotAfterArchive.titleSnapshot,
      snapshotBeforeArchive.titleSnapshot,
    );
    assert.equal(
      snapshotAfterArchive.contentSnapshot,
      snapshotBeforeArchive.contentSnapshot,
    );

    const restoreResponse = await requestJson(
      `/api/admin/questions/${created.data.id}/restore`,
      adminCookie,
      "POST",
    );
    assert.equal(restoreResponse.status, 200);
    const restored = await prisma.question.findUniqueOrThrow({
      where: { id: created.data.id },
    });
    assert.equal(restored.status, "ACTIVE");
    assert.equal(restored.archivedFromStatus, null);

    console.info(
      "Question HTTP integration checks passed: category required, shared teacher editing, revision conflicts, student isolation, copy removal, shared Python configuration, soft archive, admin restore, and frozen assignment snapshots.",
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
      await prisma.programmingTestCase.deleteMany({
        where: { configRevision: { questionId: { in: questionIds } } },
      });
      await prisma.programmingQuestionConfigRevision.deleteMany({
        where: { questionId: { in: questionIds } },
      });
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
