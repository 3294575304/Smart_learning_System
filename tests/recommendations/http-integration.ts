import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  MembershipStatus,
  PrismaClient,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface RecommendationItemResponse {
  id: string;
  questionId: string;
  type: QuestionType;
  status: RecommendationStatus;
  startedAt?: string | null;
}

interface GenerationResponse {
  cycleKey: string;
  items: RecommendationItemResponse[];
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const port = 3105;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const generatedCycles: Array<{ studentId: string; cycleKey: string }> = [];
const createdRecommendationIds: string[] = [];
let createdMembershipId: string | null = null;
let membershipToRestore: {
  id: string;
  status: MembershipStatus;
  endedAt: Date | null;
} | null = null;
let practiceQuestionId: string | null = null;
let practiceKnowledgePointId: string | null = null;

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

function assertNoAnswerFields(value: unknown): void {
  const forbidden = new Set([
    "answer",
    "explanation",
    "isCorrect",
    "correctBoolean",
    "referenceAnswer",
    "acceptableAnswers",
  ]);
  if (Array.isArray(value)) {
    value.forEach(assertNoAnswerFields);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `response leaked ${key}`);
      assertNoAnswerFields(child);
    }
  }
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [teacher, teacherTwo, admin, student, outsider] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher2@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "admin@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student2@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student3@example.com" },
      }),
    ]);
    const [classroom, otherClass] = await Promise.all([
      prisma.classroom.findFirstOrThrow({
        where: { teacherId: teacher.id, status: "ACTIVE" },
      }),
      prisma.classroom.findFirstOrThrow({
        where: { teacherId: teacherTwo.id, status: "ACTIVE" },
      }),
    ]);
    const [
      teacherCookie,
      teacherTwoCookie,
      adminCookie,
      studentCookie,
      outsiderCookie,
    ] = await Promise.all([
      sessionCookie(teacher.id),
      sessionCookie(teacherTwo.id),
      sessionCookie(admin.id),
      sessionCookie(student.id),
      sessionCookie(outsider.id),
    ]);

    const generationInput = {
      studentId: student.id,
      classroomId: classroom.id,
      recommendedDifficulty: 3,
      limit: 2,
    };
    assert.equal(
      (
        await requestJson(
          "/api/recommendations",
          undefined,
          "POST",
          generationInput,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await requestJson("/api/recommendations", studentCookie, "POST", {
          ...generationInput,
          limit: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await requestJson("/api/recommendations", studentCookie, "POST", {
          ...generationInput,
          studentId: outsider.id,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await requestJson(
          "/api/recommendations",
          teacherTwoCookie,
          "POST",
          generationInput,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await requestJson(
          "/api/recommendations",
          adminCookie,
          "POST",
          generationInput,
        )
      ).status,
      403,
    );

    const generatedResponse = await requestJson(
      "/api/recommendations",
      studentCookie,
      "POST",
      generationInput,
    );
    assert.equal(generatedResponse.status, 200);
    const generated =
      (await generatedResponse.json()) as ApiSuccess<GenerationResponse>;
    assert.ok(generated.data.items.length > 0);
    assert.equal(
      generated.data.items.some(
        (item) => item.type === QuestionType.SHORT_ANSWER,
      ),
      false,
    );
    generatedCycles.push({
      studentId: student.id,
      cycleKey: generated.data.cycleKey,
    });
    assertNoAnswerFields(generated);

    const initialCount = await prisma.personalizedRecommendation.count({
      where: {
        studentId: student.id,
        cycleKey: generated.data.cycleKey,
      },
    });
    const repeatedResponse = await requestJson(
      "/api/recommendations",
      teacherCookie,
      "POST",
      generationInput,
    );
    assert.equal(repeatedResponse.status, 200);
    const repeated =
      (await repeatedResponse.json()) as ApiSuccess<GenerationResponse>;
    assert.equal(repeated.data.cycleKey, generated.data.cycleKey);
    assert.equal(
      await prisma.personalizedRecommendation.count({
        where: {
          studentId: student.id,
          cycleKey: generated.data.cycleKey,
        },
      }),
      initialCount,
    );

    const listResponse = await requestJson(
      "/api/recommendations?status=PENDING&limit=1",
      studentCookie,
    );
    assert.equal(listResponse.status, 200);
    const list = (await listResponse.json()) as ApiSuccess<{
      items: RecommendationItemResponse[];
      pagination: { nextCursor: string | null };
    }>;
    assert.equal(list.data.items.length, 1);
    assert.ok(list.data.pagination.nextCursor);
    assertNoAnswerFields(list);

    const recommendationId = generated.data.items[0].id;
    const detailResponse = await requestJson(
      `/api/recommendations/${recommendationId}`,
      studentCookie,
    );
    assert.equal(detailResponse.status, 200);
    assertNoAnswerFields(await detailResponse.json());
    assert.equal(
      (
        await requestJson(
          `/api/recommendations/${recommendationId}`,
          outsiderCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/recommendations/does-not-exist", studentCookie))
        .status,
      404,
    );

    const startResponse = await requestJson(
      `/api/recommendations/${recommendationId}/start`,
      studentCookie,
      "POST",
    );
    assert.equal(startResponse.status, 200);
    const started =
      (await startResponse.json()) as ApiSuccess<RecommendationItemResponse>;
    assert.equal(started.data.status, RecommendationStatus.STARTED);
    assert.ok(started.data.startedAt);
    const repeatedStartResponse = await requestJson(
      `/api/recommendations/${recommendationId}/start`,
      studentCookie,
      "POST",
    );
    assert.equal(repeatedStartResponse.status, 200);
    const repeatedStart =
      (await repeatedStartResponse.json()) as ApiSuccess<RecommendationItemResponse>;
    assert.equal(repeatedStart.data.startedAt, started.data.startedAt);

    const practiceKnowledgePoint = await prisma.knowledgePoint.create({
      data: {
        createdById: teacher.id,
        code: `REC_HTTP_${randomBytes(5).toString("hex").toUpperCase()}`,
        name: "推荐练习事务测试知识点",
      },
    });
    practiceKnowledgePointId = practiceKnowledgePoint.id;
    const practiceQuestion = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        title: "推荐练习提交测试题",
        content: "请选择正确选项",
        type: QuestionType.SINGLE_CHOICE,
        difficulty: 3,
        visibility: QuestionVisibility.PRIVATE,
        status: QuestionStatus.ACTIVE,
        explanation: "A 是本题正确答案。",
        options: {
          create: [
            { label: "A", content: "正确选项", isCorrect: true, sortOrder: 1 },
            { label: "B", content: "错误选项", isCorrect: false, sortOrder: 2 },
          ],
        },
        knowledgePointLinks: {
          create: {
            knowledgePointId: practiceKnowledgePoint.id,
            weight: 1,
          },
        },
      },
      include: { options: true },
    });
    practiceQuestionId = practiceQuestion.id;
    const correctOption = practiceQuestion.options.find(
      (option) => option.isCorrect,
    );
    const wrongOption = practiceQuestion.options.find(
      (option) => !option.isCorrect,
    );
    assert.ok(correctOption);
    assert.ok(wrongOption);

    async function createStartedPractice(studentId: string, reason: string) {
      const practice = await prisma.personalizedRecommendation.create({
        data: {
          studentId,
          questionId: practiceQuestion.id,
          knowledgePointId: practiceKnowledgePoint.id,
          cycleKey: `integration-practice-${randomUUID()}`,
          source: RecommendationSource.RULE,
          status: RecommendationStatus.STARTED,
          reason,
          targetDifficulty: 3,
          priority: 10,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      createdRecommendationIds.push(practice.id);
      return practice;
    }

    const correctPractice = await createStartedPractice(
      student.id,
      "验证正确判分与掌握度正向更新",
    );
    const submitPath = `/api/recommendations/${correctPractice.id}/submit`;
    const correctIdempotencyKey = randomUUID();
    const correctBody = {
      idempotencyKey: correctIdempotencyKey,
      answers: [
        {
          questionId: practiceQuestion.id,
          kind: "CHOICE",
          optionIds: [correctOption.id],
          responseTimeMs: 12_000,
        },
      ],
    };
    assert.equal(
      (await requestJson(submitPath, undefined, "POST", correctBody)).status,
      401,
    );
    const outsiderPractice = await createStartedPractice(
      outsider.id,
      "验证学生资源隔离",
    );
    assert.equal(
      (
        await requestJson(
          `/api/recommendations/${outsiderPractice.id}/submit`,
          studentCookie,
          "POST",
          correctBody,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson(submitPath, studentCookie, "POST", {
          ...correctBody,
          score: 100,
          isCorrect: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await requestJson(submitPath, studentCookie, "POST", {
          idempotencyKey: randomUUID(),
          answers: [
            {
              ...correctBody.answers[0],
              questionId: "forged-question-id",
            },
          ],
        })
      ).status,
      400,
    );

    const correctSubmitResponse = await requestJson(
      submitPath,
      studentCookie,
      "POST",
      correctBody,
    );
    assert.equal(correctSubmitResponse.status, 200);
    const correctResult = (await correctSubmitResponse.json()) as ApiSuccess<{
      status: RecommendationStatus;
      correctCount: number;
      totalCount: number;
      score: number;
      percentage: number;
      answers: Array<{
        isCorrect: boolean;
        correctAnswer: string;
        explanation: string;
      }>;
    }>;
    assert.equal(correctResult.data.status, RecommendationStatus.COMPLETED);
    assert.equal(correctResult.data.correctCount, 1);
    assert.equal(correctResult.data.totalCount, 1);
    assert.equal(correctResult.data.score, 1);
    assert.equal(correctResult.data.percentage, 100);
    assert.equal(correctResult.data.answers[0].isCorrect, true);
    assert.match(correctResult.data.answers[0].correctAnswer, /A\. 正确选项/u);
    assert.match(correctResult.data.answers[0].explanation, /正确答案/u);
    assert.equal(
      await prisma.wrongQuestion.count({
        where: { studentId: student.id, questionId: practiceQuestion.id },
      }),
      0,
    );
    const masteryAfterCorrect =
      await prisma.studentKnowledgeMastery.findUniqueOrThrow({
        where: {
          studentId_knowledgePointId: {
            studentId: student.id,
            knowledgePointId: practiceKnowledgePoint.id,
          },
        },
      });
    assert.equal(masteryAfterCorrect.answeredCount, 1);
    assert.equal(masteryAfterCorrect.correctCount, 1);
    assert.equal(masteryAfterCorrect.masteryScore.toNumber(), 100);

    const refreshedResult = await requestJson(
      `/api/recommendations/${correctPractice.id}`,
      studentCookie,
    );
    assert.equal(refreshedResult.status, 200);
    const refreshed = (await refreshedResult.json()) as ApiSuccess<{
      practiceResult: { correctCount: number; answers: unknown[] } | null;
    }>;
    assert.equal(refreshed.data.practiceResult?.correctCount, 1);
    assert.equal(refreshed.data.practiceResult?.answers.length, 1);

    const repeatedSubmit = await requestJson(
      submitPath,
      studentCookie,
      "POST",
      {
        idempotencyKey: randomUUID(),
        answers: [
          {
            questionId: practiceQuestion.id,
            kind: "CHOICE",
            optionIds: [wrongOption.id],
          },
        ],
      },
    );
    assert.equal(repeatedSubmit.status, 200);
    assert.equal(
      (
        (await repeatedSubmit.json()) as ApiSuccess<{
          correctCount: number;
        }>
      ).data.correctCount,
      1,
    );
    assert.equal(
      await prisma.recommendationPracticeAnswer.count({
        where: { recommendationId: correctPractice.id },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.studentKnowledgeMastery.findUniqueOrThrow({
          where: {
            studentId_knowledgePointId: {
              studentId: student.id,
              knowledgePointId: practiceKnowledgePoint.id,
            },
          },
        })
      ).answeredCount,
      1,
    );

    const firstWrongPractice = await createStartedPractice(
      student.id,
      "验证错题首次写入",
    );
    const wrongBody = {
      idempotencyKey: randomUUID(),
      answers: [
        {
          questionId: practiceQuestion.id,
          kind: "CHOICE",
          optionIds: [wrongOption.id],
        },
      ],
    };
    assert.equal(
      (
        await requestJson(
          `/api/recommendations/${firstWrongPractice.id}/submit`,
          studentCookie,
          "POST",
          wrongBody,
        )
      ).status,
      200,
    );
    const firstWrongRecord = await prisma.wrongQuestion.findUniqueOrThrow({
      where: {
        studentId_questionId: {
          studentId: student.id,
          questionId: practiceQuestion.id,
        },
      },
    });
    assert.equal(firstWrongRecord.wrongCount, 1);
    const masteryAfterWrong =
      await prisma.studentKnowledgeMastery.findUniqueOrThrow({
        where: {
          studentId_knowledgePointId: {
            studentId: student.id,
            knowledgePointId: practiceKnowledgePoint.id,
          },
        },
      });
    assert.equal(masteryAfterWrong.answeredCount, 2);
    assert.equal(masteryAfterWrong.correctCount, 1);
    assert.equal(masteryAfterWrong.masteryScore.toNumber(), 50);

    const secondWrongPractice = await createStartedPractice(
      student.id,
      "验证错题去重更新",
    );
    assert.equal(
      (
        await requestJson(
          `/api/recommendations/${secondWrongPractice.id}/submit`,
          studentCookie,
          "POST",
          { ...wrongBody, idempotencyKey: randomUUID() },
        )
      ).status,
      200,
    );
    const repeatedWrongRecord = await prisma.wrongQuestion.findUniqueOrThrow({
      where: {
        studentId_questionId: {
          studentId: student.id,
          questionId: practiceQuestion.id,
        },
      },
    });
    assert.equal(repeatedWrongRecord.id, firstWrongRecord.id);
    assert.equal(repeatedWrongRecord.wrongCount, 2);
    const masteryBeforeRollback =
      await prisma.studentKnowledgeMastery.findUniqueOrThrow({
        where: {
          studentId_knowledgePointId: {
            studentId: student.id,
            knowledgePointId: practiceKnowledgePoint.id,
          },
        },
      });
    assert.equal(masteryBeforeRollback.answeredCount, 3);
    assert.equal(masteryBeforeRollback.correctCount, 1);
    assert.equal(masteryBeforeRollback.masteryScore.toNumber(), 33.33);

    const rollbackPractice = await createStartedPractice(
      student.id,
      "验证事务失败完整回滚",
    );
    assert.equal(
      (
        await requestJson(
          `/api/recommendations/${rollbackPractice.id}/submit`,
          studentCookie,
          "POST",
          { ...wrongBody, idempotencyKey: correctIdempotencyKey },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await prisma.personalizedRecommendation.findUniqueOrThrow({
          where: { id: rollbackPractice.id },
        })
      ).status,
      RecommendationStatus.STARTED,
    );
    assert.equal(
      await prisma.recommendationPracticeAnswer.count({
        where: { recommendationId: rollbackPractice.id },
      }),
      0,
    );
    assert.equal(
      (
        await prisma.studentKnowledgeMastery.findUniqueOrThrow({
          where: {
            studentId_knowledgePointId: {
              studentId: student.id,
              knowledgePointId: practiceKnowledgePoint.id,
            },
          },
        })
      ).answeredCount,
      masteryBeforeRollback.answeredCount,
    );

    const unusedQuestion = await prisma.question.findFirstOrThrow({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        id: {
          notIn: generated.data.items.map((item) => item.questionId),
        },
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    const expired = await prisma.personalizedRecommendation.create({
      data: {
        studentId: student.id,
        questionId: unusedQuestion.id,
        cycleKey: `integration-expired-${randomUUID()}`,
        source: RecommendationSource.RULE,
        status: RecommendationStatus.PENDING,
        reason: "过期状态集成测试",
        targetDifficulty: 3,
        priority: 1,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    createdRecommendationIds.push(expired.id);
    assert.equal(
      (
        await requestJson(
          `/api/recommendations/${expired.id}/start`,
          studentCookie,
          "POST",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await prisma.personalizedRecommendation.findUniqueOrThrow({
          where: { id: expired.id },
        })
      ).status,
      RecommendationStatus.EXPIRED,
    );

    const existingMembership = await prisma.classMembership.findUnique({
      where: {
        classroomId_studentId: {
          classroomId: otherClass.id,
          studentId: outsider.id,
        },
      },
    });
    if (!existingMembership) {
      const membership = await prisma.classMembership.create({
        data: {
          classroomId: otherClass.id,
          studentId: outsider.id,
          status: MembershipStatus.ACTIVE,
        },
      });
      createdMembershipId = membership.id;
    } else if (existingMembership.status !== MembershipStatus.ACTIVE) {
      membershipToRestore = {
        id: existingMembership.id,
        status: existingMembership.status,
        endedAt: existingMembership.endedAt,
      };
      await prisma.classMembership.update({
        where: { id: existingMembership.id },
        data: { status: MembershipStatus.ACTIVE, endedAt: null },
      });
    }
    assert.equal(
      (
        await requestJson("/api/recommendations", outsiderCookie, "POST", {
          studentId: outsider.id,
          classroomId: otherClass.id,
          recommendedDifficulty: 5,
          limit: 2,
        })
      ).status,
      422,
    );

    console.info(
      "Recommendation HTTP integration checks passed: safe generation, ownership, submission validation, grading, result refresh, mastery, wrong-question deduplication, completion idempotency, and transaction rollback.",
    );
  } finally {
    if (practiceQuestionId) {
      await prisma.wrongQuestion.deleteMany({
        where: { questionId: practiceQuestionId },
      });
    }
    if (createdRecommendationIds.length > 0) {
      await prisma.personalizedRecommendation.deleteMany({
        where: { id: { in: createdRecommendationIds } },
      });
    }
    for (const generated of generatedCycles) {
      await prisma.personalizedRecommendation.deleteMany({
        where: generated,
      });
    }
    if (practiceKnowledgePointId) {
      await prisma.studentKnowledgeMastery.deleteMany({
        where: { knowledgePointId: practiceKnowledgePointId },
      });
    }
    if (practiceQuestionId) {
      await prisma.question.delete({ where: { id: practiceQuestionId } });
    }
    if (practiceKnowledgePointId) {
      await prisma.knowledgePoint.delete({
        where: { id: practiceKnowledgePointId },
      });
    }
    if (createdMembershipId) {
      await prisma.classMembership.delete({
        where: { id: createdMembershipId },
      });
    }
    if (membershipToRestore) {
      await prisma.classMembership.update({
        where: { id: membershipToRestore.id },
        data: {
          status: membershipToRestore.status,
          endedAt: membershipToRestore.endedAt,
        },
      });
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
