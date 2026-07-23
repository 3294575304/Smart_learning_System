import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  AssignmentStatus,
  GradingStatus,
  MembershipStatus,
  PrismaClient,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
  SubmissionStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface WrongQuestionListResponse {
  summary: { total: number; unmastered: number; mastered: number };
  items: Array<{
    id: string;
    title: string;
    type: QuestionType;
    isMastered: boolean;
    wrongCount: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface MasteryResponse {
  id: string;
  isMastered: boolean;
  masteredAt: string | null;
}

const prisma = new PrismaClient();
const port = 3108;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const wrongQuestionIds: string[] = [];
const submissionIds: string[] = [];
const assignmentIds: string[] = [];
const recommendationIds: string[] = [];
const classroomIds: string[] = [];
const membershipIds: string[] = [];
const questionIds: string[] = [];
const knowledgePointIds: string[] = [];

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
      expiresAt: new Date(Date.now() + 180_000),
    },
  });
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function requestJson(
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

async function createAssignmentFixture(input: {
  classroomId: string;
  teacherId: string;
  questionId: string;
  knowledgePointId: string;
  knowledgePointName: string;
  title: string;
  type: QuestionType;
  content: string;
  correctBoolean?: boolean;
  acceptableAnswers?: string[];
  secretExplanation?: string;
}) {
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: input.classroomId,
      teacherId: input.teacherId,
      title: `错题本测试作业-${input.title}-${randomUUID()}`,
      status: AssignmentStatus.PUBLISHED,
      totalPoints: 1,
      publishedAt: new Date(),
      questions: {
        create: {
          questionId: input.questionId,
          sortOrder: 1,
          points: 1,
          titleSnapshot: input.title,
          contentSnapshot: input.content,
          typeSnapshot: input.type,
          difficultySnapshot: 2,
          explanationSnapshot:
            input.secretExplanation ?? `${input.title} 的公开解析`,
          correctBooleanSnapshot: input.correctBoolean ?? null,
          acceptableAnswersSnapshot: input.acceptableAnswers ?? [],
          isCaseSensitiveSnapshot: false,
          knowledgePointSnapshots: {
            create: {
              knowledgePointId: input.knowledgePointId,
              codeSnapshot: `WQ-${randomUUID()}`,
              nameSnapshot: input.knowledgePointName,
              weightSnapshot: 1,
            },
          },
        },
      },
    },
    include: { questions: true },
  });
  assignmentIds.push(assignment.id);
  return assignment.questions[0];
}

async function createWrongAnswer(input: {
  assignmentQuestionId: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  type: QuestionType;
  lastWrongAt: Date;
  wrongCount?: number;
  isResolved?: boolean;
  textAnswer?: string;
  booleanAnswer?: boolean;
}) {
  const published = input.status === SubmissionStatus.PUBLISHED;
  const completedAt = new Date();
  const submission = await prisma.submission.create({
    data: {
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      attemptNumber: 1,
      idempotencyKey: randomUUID(),
      status: input.status,
      startedAt: new Date(completedAt.getTime() - 1_000),
      submittedAt: completedAt,
      gradedAt: completedAt,
      publishedAt: published ? completedAt : null,
      score: 0,
      maxScore: 1,
      percentage: 0,
      answers: {
        create: {
          assignmentQuestionId: input.assignmentQuestionId,
          textAnswer:
            input.type === QuestionType.FILL_BLANK
              ? (input.textAnswer ?? "错误答案")
              : null,
          booleanAnswer:
            input.type === QuestionType.TRUE_FALSE
              ? (input.booleanAnswer ?? false)
              : null,
          gradingStatus: GradingStatus.AUTO_GRADED,
          score: 0,
          maxScore: 1,
          isCorrect: false,
          gradedAt: completedAt,
        },
      },
    },
    include: { answers: true },
  });
  submissionIds.push(submission.id);
  const wrongQuestion = await prisma.wrongQuestion.create({
    data: {
      studentId: input.studentId,
      studentAnswerId: submission.answers[0].id,
      assignmentQuestionId: input.assignmentQuestionId,
      wrongCount: input.wrongCount ?? 1,
      isResolved: input.isResolved ?? false,
      resolvedAt: input.isResolved ? new Date() : null,
      firstWrongAt: input.lastWrongAt,
      lastWrongAt: input.lastWrongAt,
    },
  });
  wrongQuestionIds.push(wrongQuestion.id);
  return wrongQuestion;
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [teacher, admin, student, otherStudent] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
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
    const [studentCookie, otherStudentCookie, teacherCookie, adminCookie] =
      await Promise.all([
        sessionCookie(student.id),
        sessionCookie(otherStudent.id),
        sessionCookie(teacher.id),
        sessionCookie(admin.id),
      ]);

    const marker = randomUUID();
    const [algebra, geometry] = await Promise.all([
      prisma.knowledgePoint.create({
        data: {
          createdById: teacher.id,
          code: `WQ-ALG-${marker}`,
          name: `代数知识点-${marker}`,
        },
      }),
      prisma.knowledgePoint.create({
        data: {
          createdById: teacher.id,
          code: `WQ-GEO-${marker}`,
          name: `几何知识点-${marker}`,
        },
      }),
    ]);
    knowledgePointIds.push(algebra.id, geometry.id);

    const [classA, classB] = await Promise.all([
      prisma.classroom.create({
        data: {
          teacherId: teacher.id,
          name: `错题测试甲班-${marker}`,
          joinCode: `WA${marker.replaceAll("-", "").slice(0, 10)}`,
        },
      }),
      prisma.classroom.create({
        data: {
          teacherId: teacher.id,
          name: `错题测试乙班-${marker}`,
          joinCode: `WB${marker.replaceAll("-", "").slice(0, 10)}`,
        },
      }),
    ]);
    classroomIds.push(classA.id, classB.id);
    const memberships = await Promise.all([
      prisma.classMembership.create({
        data: {
          classroomId: classA.id,
          studentId: student.id,
          status: MembershipStatus.ACTIVE,
        },
      }),
      prisma.classMembership.create({
        data: {
          classroomId: classB.id,
          studentId: student.id,
          status: MembershipStatus.ACTIVE,
        },
      }),
      prisma.classMembership.create({
        data: {
          classroomId: classA.id,
          studentId: otherStudent.id,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ]);
    membershipIds.push(...memberships.map((membership) => membership.id));

    const [
      fillQuestion,
      booleanQuestion,
      secretQuestion,
      recommendationQuestion,
    ] = await Promise.all([
      prisma.question.create({
        data: {
          creatorId: teacher.id,
          title: `关键词 Alpha-${marker}`,
          content: `Alpha 题目内容 ${marker}`,
          type: QuestionType.FILL_BLANK,
          difficulty: 2,
          visibility: QuestionVisibility.PRIVATE,
          status: QuestionStatus.ACTIVE,
          explanation: "Alpha 原题解析",
          acceptableAnswers: ["4"],
        },
      }),
      prisma.question.create({
        data: {
          creatorId: teacher.id,
          title: `关键词 Beta-${marker}`,
          content: `Beta 题目内容 ${marker}`,
          type: QuestionType.TRUE_FALSE,
          difficulty: 2,
          visibility: QuestionVisibility.PRIVATE,
          status: QuestionStatus.ACTIVE,
          explanation: "Beta 原题解析",
          correctBoolean: true,
        },
      }),
      prisma.question.create({
        data: {
          creatorId: teacher.id,
          title: `未发布秘密题-${marker}`,
          content: `SECRET-CONTENT-${marker}`,
          type: QuestionType.FILL_BLANK,
          difficulty: 2,
          visibility: QuestionVisibility.PRIVATE,
          status: QuestionStatus.ACTIVE,
          explanation: `SECRET-EXPLANATION-${marker}`,
          acceptableAnswers: [`SECRET-CORRECT-${marker}`],
        },
      }),
      prisma.question.create({
        data: {
          creatorId: teacher.id,
          title: `推荐错题 Gamma-${marker}`,
          content: `Gamma 推荐题内容 ${marker}`,
          type: QuestionType.FILL_BLANK,
          difficulty: 2,
          visibility: QuestionVisibility.PUBLIC,
          status: QuestionStatus.ACTIVE,
          explanation: "Gamma 推荐题解析",
          acceptableAnswers: ["gamma"],
          knowledgePointLinks: {
            create: {
              knowledgePointId: geometry.id,
              weight: 1,
            },
          },
        },
      }),
    ]);
    questionIds.push(
      fillQuestion.id,
      booleanQuestion.id,
      secretQuestion.id,
      recommendationQuestion.id,
    );

    const [fillSnapshot, booleanSnapshot, secretSnapshot] = await Promise.all([
      createAssignmentFixture({
        classroomId: classA.id,
        teacherId: teacher.id,
        questionId: fillQuestion.id,
        knowledgePointId: algebra.id,
        knowledgePointName: algebra.name,
        title: fillQuestion.title,
        type: fillQuestion.type,
        content: fillQuestion.content,
        acceptableAnswers: ["4"],
      }),
      createAssignmentFixture({
        classroomId: classB.id,
        teacherId: teacher.id,
        questionId: booleanQuestion.id,
        knowledgePointId: geometry.id,
        knowledgePointName: geometry.name,
        title: booleanQuestion.title,
        type: booleanQuestion.type,
        content: booleanQuestion.content,
        correctBoolean: true,
      }),
      createAssignmentFixture({
        classroomId: classA.id,
        teacherId: teacher.id,
        questionId: secretQuestion.id,
        knowledgePointId: algebra.id,
        knowledgePointName: algebra.name,
        title: secretQuestion.title,
        type: secretQuestion.type,
        content: secretQuestion.content,
        acceptableAnswers: [`SECRET-CORRECT-${marker}`],
        secretExplanation: `SECRET-EXPLANATION-${marker}`,
      }),
    ]);

    const recentWrong = await createWrongAnswer({
      assignmentQuestionId: fillSnapshot.id,
      assignmentId: fillSnapshot.assignmentId,
      studentId: student.id,
      status: SubmissionStatus.PUBLISHED,
      type: QuestionType.FILL_BLANK,
      lastWrongAt: new Date(Date.now() - 5 * 86_400_000),
      wrongCount: 3,
      textAnswer: "3",
    });
    const oldMasteredWrong = await createWrongAnswer({
      assignmentQuestionId: booleanSnapshot.id,
      assignmentId: booleanSnapshot.assignmentId,
      studentId: student.id,
      status: SubmissionStatus.PUBLISHED,
      type: QuestionType.TRUE_FALSE,
      lastWrongAt: new Date(Date.now() - 50 * 86_400_000),
      isResolved: true,
      booleanAnswer: false,
    });
    const otherStudentWrong = await createWrongAnswer({
      assignmentQuestionId: fillSnapshot.id,
      assignmentId: fillSnapshot.assignmentId,
      studentId: otherStudent.id,
      status: SubmissionStatus.PUBLISHED,
      type: QuestionType.FILL_BLANK,
      lastWrongAt: new Date(),
    });
    const unpublishedWrong = await createWrongAnswer({
      assignmentQuestionId: secretSnapshot.id,
      assignmentId: secretSnapshot.assignmentId,
      studentId: student.id,
      status: SubmissionStatus.GRADED,
      type: QuestionType.FILL_BLANK,
      lastWrongAt: new Date(),
      textAnswer: "secret wrong",
    });
    const recommendation = await prisma.personalizedRecommendation.create({
      data: {
        studentId: student.id,
        questionId: recommendationQuestion.id,
        knowledgePointId: geometry.id,
        cycleKey: `wrong-question-test-${marker}`,
        source: RecommendationSource.RULE,
        status: RecommendationStatus.COMPLETED,
        reason: "错题本推荐来源测试",
        targetDifficulty: 2,
        completedAt: new Date(),
        wasCorrect: false,
        score: 0,
        maxScore: 1,
      },
    });
    recommendationIds.push(recommendation.id);
    const recommendationAnswer =
      await prisma.recommendationPracticeAnswer.create({
        data: {
          recommendationId: recommendation.id,
          questionId: recommendationQuestion.id,
          idempotencyKey: randomUUID(),
          textAnswer: "wrong gamma",
          score: 0,
          maxScore: 1,
          isCorrect: false,
        },
      });
    const recommendationWrong = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        recommendationAnswerId: recommendationAnswer.id,
        questionId: recommendationQuestion.id,
        wrongCount: 2,
        firstWrongAt: new Date(Date.now() - 20 * 86_400_000),
        lastWrongAt: new Date(Date.now() - 20 * 86_400_000),
      },
    });
    wrongQuestionIds.push(recommendationWrong.id);

    const listResponse = await requestJson(
      "/api/student/wrong-questions?page=1&pageSize=20",
      studentCookie,
    );
    assert.equal(listResponse.status, 200);
    const list =
      (await listResponse.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(list.data.summary.total, 3);
    assert.equal(list.data.pagination.total, 3);
    assert.deepEqual(
      new Set(list.data.items.map((item) => item.id)),
      new Set([recentWrong.id, oldMasteredWrong.id, recommendationWrong.id]),
    );
    assert.equal(
      JSON.stringify(list).includes(`SECRET-CORRECT-${marker}`),
      false,
    );
    assert.equal(JSON.stringify(list).includes(unpublishedWrong.id), false);
    assert.equal(JSON.stringify(list).includes(otherStudentWrong.id), false);

    const keyword = await requestJson(
      `/api/student/wrong-questions?keyword=${encodeURIComponent("Alpha")}`,
      studentCookie,
    );
    const keywordBody =
      (await keyword.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(keywordBody.data.pagination.total, 1);
    assert.equal(keywordBody.data.items[0].id, recentWrong.id);

    const recommendationFilter = await requestJson(
      `/api/student/wrong-questions?keyword=${encodeURIComponent("Gamma")}`,
      studentCookie,
    );
    const recommendationBody =
      (await recommendationFilter.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(recommendationBody.data.pagination.total, 1);
    assert.equal(recommendationBody.data.items[0].id, recommendationWrong.id);

    const classFilter = await requestJson(
      `/api/student/wrong-questions?classroomId=${classB.id}`,
      studentCookie,
    );
    const classBody =
      (await classFilter.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(classBody.data.pagination.total, 1);
    assert.equal(classBody.data.items[0].id, oldMasteredWrong.id);

    const knowledgeFilter = await requestJson(
      `/api/student/wrong-questions?knowledgePointId=${algebra.id}`,
      studentCookie,
    );
    const knowledgeBody =
      (await knowledgeFilter.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(knowledgeBody.data.pagination.total, 1);
    assert.equal(knowledgeBody.data.items[0].id, recentWrong.id);

    const typeFilter = await requestJson(
      `/api/student/wrong-questions?type=${QuestionType.TRUE_FALSE}`,
      studentCookie,
    );
    const typeBody =
      (await typeFilter.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(typeBody.data.pagination.total, 1);
    assert.equal(typeBody.data.items[0].id, oldMasteredWrong.id);

    const masteredFilter = await requestJson(
      "/api/student/wrong-questions?isMastered=true",
      studentCookie,
    );
    const masteredBody =
      (await masteredFilter.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(masteredBody.data.pagination.total, 1);
    assert.equal(masteredBody.data.items[0].id, oldMasteredWrong.id);

    const recentFilter = await requestJson(
      "/api/student/wrong-questions?recentDays=7",
      studentCookie,
    );
    const recentBody =
      (await recentFilter.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(recentBody.data.pagination.total, 1);
    assert.equal(recentBody.data.items[0].id, recentWrong.id);

    const firstPage = await requestJson(
      "/api/student/wrong-questions?page=1&pageSize=1",
      studentCookie,
    );
    const secondPage = await requestJson(
      "/api/student/wrong-questions?page=2&pageSize=1",
      studentCookie,
    );
    const firstPageBody =
      (await firstPage.json()) as ApiSuccess<WrongQuestionListResponse>;
    const secondPageBody =
      (await secondPage.json()) as ApiSuccess<WrongQuestionListResponse>;
    assert.equal(firstPageBody.data.pagination.totalPages, 3);
    assert.notEqual(
      firstPageBody.data.items[0].id,
      secondPageBody.data.items[0].id,
    );

    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions?studentId=${otherStudent.id}`,
          studentCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions/${otherStudentWrong.id}`,
          studentCookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions/${unpublishedWrong.id}`,
          studentCookie,
        )
      ).status,
      404,
    );
    const secretDetail = await requestJson(
      `/api/student/wrong-questions/${unpublishedWrong.id}`,
      studentCookie,
    );
    assert.equal(
      (await secretDetail.text()).includes(`SECRET-CORRECT-${marker}`),
      false,
    );

    const detailResponse = await requestJson(
      `/api/student/wrong-questions/${recentWrong.id}`,
      studentCookie,
    );
    assert.equal(detailResponse.status, 200);
    const detailText = await detailResponse.text();
    assert.match(detailText, /"correctAnswer":"4"/u);
    assert.match(detailText, /Alpha/u);

    const markTime = new Date();
    const markedResponse = await requestJson(
      `/api/student/wrong-questions/${recentWrong.id}`,
      studentCookie,
      "PATCH",
      { isMastered: true },
    );
    assert.equal(markedResponse.status, 200);
    const marked = (await markedResponse.json()) as ApiSuccess<MasteryResponse>;
    assert.equal(marked.data.isMastered, true);
    assert.ok(marked.data.masteredAt);
    assert.ok(new Date(marked.data.masteredAt).getTime() >= markTime.getTime());

    const repeatedMarkResponse = await requestJson(
      `/api/student/wrong-questions/${recentWrong.id}`,
      studentCookie,
      "PATCH",
      { isMastered: true },
    );
    const repeatedMark =
      (await repeatedMarkResponse.json()) as ApiSuccess<MasteryResponse>;
    assert.equal(repeatedMark.data.masteredAt, marked.data.masteredAt);

    const unmarkResponse = await requestJson(
      `/api/student/wrong-questions/${recentWrong.id}`,
      studentCookie,
      "PATCH",
      { isMastered: false },
    );
    const unmarked =
      (await unmarkResponse.json()) as ApiSuccess<MasteryResponse>;
    assert.equal(unmarked.data.isMastered, false);
    assert.equal(unmarked.data.masteredAt, null);
    const repeatedUnmarkResponse = await requestJson(
      `/api/student/wrong-questions/${recentWrong.id}`,
      studentCookie,
      "PATCH",
      { isMastered: false },
    );
    assert.equal(repeatedUnmarkResponse.status, 200);

    assert.equal(
      (
        await requestJson(
          "/api/student/wrong-questions/cnotfoundwrongquestion000001",
          studentCookie,
          "PATCH",
          { isMastered: true },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions/${recentWrong.id}`,
          teacherCookie,
          "PATCH",
          { isMastered: true },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions/${recentWrong.id}`,
          adminCookie,
          "PATCH",
          { isMastered: true },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions/${recentWrong.id}`,
          otherStudentCookie,
          "PATCH",
          { isMastered: true },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/wrong-questions/${recentWrong.id}`,
          studentCookie,
          "PATCH",
          { isMastered: true, wrongCount: 999 },
        )
      ).status,
      400,
    );

    const practiceResponse = await requestJson(
      `/api/student/wrong-questions/${recentWrong.id}/practice`,
      studentCookie,
      "POST",
      { answer: { kind: "TEXT", value: "4" } },
    );
    assert.equal(practiceResponse.status, 200);
    const practiceText = await practiceResponse.text();
    assert.match(practiceText, /"isCorrect":true/u);
    assert.match(practiceText, /"canMarkMastered":true/u);

    const recommendationPracticeResponse = await requestJson(
      `/api/student/wrong-questions/${recommendationWrong.id}/practice`,
      studentCookie,
      "POST",
      { answer: { kind: "TEXT", value: "gamma" } },
    );
    assert.equal(recommendationPracticeResponse.status, 200);
    assert.match(
      await recommendationPracticeResponse.text(),
      /"isCorrect":true/u,
    );

    console.info(
      "Wrong-question HTTP integration checks passed: ownership, filtering, pagination, mastery idempotency, role isolation, publication gating, safe detail, and server grading.",
    );
  } finally {
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    if (wrongQuestionIds.length > 0) {
      await prisma.wrongQuestion.deleteMany({
        where: { id: { in: wrongQuestionIds } },
      });
    }
    if (submissionIds.length > 0) {
      await prisma.studentAnswer.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await prisma.submission.deleteMany({
        where: { id: { in: submissionIds } },
      });
    }
    if (assignmentIds.length > 0) {
      await prisma.assignment.deleteMany({
        where: { id: { in: assignmentIds } },
      });
    }
    if (recommendationIds.length > 0) {
      await prisma.personalizedRecommendation.deleteMany({
        where: { id: { in: recommendationIds } },
      });
    }
    if (membershipIds.length > 0) {
      await prisma.classMembership.deleteMany({
        where: { id: { in: membershipIds } },
      });
    }
    if (classroomIds.length > 0) {
      await prisma.classroom.deleteMany({
        where: { id: { in: classroomIds } },
      });
    }
    if (questionIds.length > 0) {
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    }
    if (knowledgePointIds.length > 0) {
      await prisma.knowledgePoint.deleteMany({
        where: { id: { in: knowledgePointIds } },
      });
    }
    server.kill();
    if (server.exitCode === null) {
      await Promise.race([
        once(server, "exit"),
        new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
      ]);
    }
    await prisma.$disconnect();
  }
}

void main();
