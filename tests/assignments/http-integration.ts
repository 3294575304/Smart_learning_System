import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  AuditAction,
  PrismaClient,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const port = 3103;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
let assignmentId: string | undefined;
let manualAssignmentId: string | undefined;
let changedQuestion:
  { id: string; content: string; acceptableAnswers: string[] } | undefined;

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
      /* starting */
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

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [
      teacher,
      teacherTwo,
      admin,
      student,
      outsider,
      classroom,
      multipleChoice,
      fillBlank,
      shortAnswer,
    ] = await Promise.all([
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
      prisma.classroom.findFirstOrThrow({
        where: { teacher: { email: "teacher@example.com" }, status: "ACTIVE" },
      }),
      prisma.question.findFirstOrThrow({
        where: {
          creator: { email: "teacher@example.com" },
          type: QuestionType.MULTIPLE_CHOICE,
          status: "ACTIVE",
          deletedAt: null,
        },
      }),
      prisma.question.findFirstOrThrow({
        where: {
          creator: { email: "teacher@example.com" },
          type: QuestionType.FILL_BLANK,
          status: "ACTIVE",
          deletedAt: null,
        },
      }),
      prisma.question.findFirstOrThrow({
        where: {
          creator: { email: "teacher@example.com" },
          type: QuestionType.SHORT_ANSWER,
          status: "ACTIVE",
          deletedAt: null,
        },
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

    assert.equal((await requestJson("/api/teacher/assignments")).status, 401);
    assert.equal(
      (await requestJson("/api/teacher/assignments", studentCookie, "POST", {}))
        .status,
      400,
    );

    const input = {
      title: `作业集成测试-${randomBytes(3).toString("hex")}`,
      description: "验证发布、保存、批改和隔离",
      classroomId: classroom.id,
      publishedAt: new Date(Date.now() - 60_000).toISOString(),
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      allowResubmission: true,
      questions: [
        { questionId: multipleChoice.id, sortOrder: 1, points: 10 },
        { questionId: fillBlank.id, sortOrder: 2, points: 5 },
      ],
    };
    assert.equal(
      (
        await requestJson(
          "/api/teacher/assignments",
          studentCookie,
          "POST",
          input,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson(
          "/api/teacher/assignments",
          teacherTwoCookie,
          "POST",
          input,
        )
      ).status,
      404,
    );
    const createdResponse = await requestJson(
      "/api/teacher/assignments",
      teacherCookie,
      "POST",
      input,
    );
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as ApiSuccess<{
      id: string;
    }>;
    assignmentId = created.data.id;
    assert.equal(
      (
        await requestJson(
          `/api/teacher/assignments/${assignmentId}/publish`,
          teacherCookie,
          "POST",
        )
      ).status,
      200,
    );

    changedQuestion = {
      id: fillBlank.id,
      content: fillBlank.content,
      acceptableAnswers: fillBlank.acceptableAnswers,
    };
    await prisma.question.update({
      where: { id: fillBlank.id },
      data: { content: "题库已在发布后修改", acceptableAnswers: ["999"] },
    });

    assert.equal(
      (
        await requestJson(
          `/api/student/assignments/${assignmentId}`,
          outsiderCookie,
        )
      ).status,
      404,
    );
    const detailResponse = await requestJson(
      `/api/student/assignments/${assignmentId}`,
      studentCookie,
    );
    assert.equal(detailResponse.status, 200);
    const detail = (await detailResponse.json()) as ApiSuccess<{
      questions: Array<{ type: QuestionType; content: string }>;
    }>;
    assert.equal(
      detail.data.questions.find(
        (item) => item.type === QuestionType.FILL_BLANK,
      )?.content,
      changedQuestion.content,
    );

    const attemptResponse = await requestJson(
      `/api/student/assignments/${assignmentId}/attempts`,
      studentCookie,
      "POST",
      { idempotencyKey: randomUUID() },
    );
    assert.equal(attemptResponse.status, 201);
    const attempt = (await attemptResponse.json()) as ApiSuccess<{
      id: string;
      version: number;
      questions: Array<{
        id: string;
        type: QuestionType;
        options: Array<{ id: string }>;
      }>;
    }>;
    const multiSnapshot = await prisma.assignmentQuestion.findFirstOrThrow({
      where: { assignmentId, typeSnapshot: QuestionType.MULTIPLE_CHOICE },
      include: { optionSnapshots: true },
    });
    const fillSnapshot = attempt.data.questions.find(
      (item) => item.type === QuestionType.FILL_BLANK,
    );
    assert.ok(fillSnapshot);
    const correctOptionIds = multiSnapshot.optionSnapshots
      .filter((option) => option.isCorrectSnapshot)
      .map((option) => option.id)
      .reverse();
    const omittedTimingSave = await requestJson(
      `/api/student/submissions/${attempt.data.id}/answers`,
      studentCookie,
      "PUT",
      {
        version: attempt.data.version,
        answers: [
          {
            assignmentQuestionId: multiSnapshot.id,
            kind: "CHOICE",
            optionIds: correctOptionIds,
          },
        ],
      },
    );
    assert.equal(omittedTimingSave.status, 200);
    const omittedTimingBody = (await omittedTimingSave.json()) as ApiSuccess<{
      version: number;
    }>;
    const omittedTimingAnswer = await prisma.studentAnswer.findUniqueOrThrow({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: attempt.data.id,
          assignmentQuestionId: multiSnapshot.id,
        },
      },
    });
    assert.equal(omittedTimingAnswer.responseTimeMs, null);

    for (const responseTimeMs of [-1, 86_400_001]) {
      const invalidTiming = await requestJson(
        `/api/student/submissions/${attempt.data.id}/answers`,
        studentCookie,
        "PUT",
        {
          version: omittedTimingBody.data.version,
          answers: [
            {
              assignmentQuestionId: multiSnapshot.id,
              kind: "CHOICE",
              optionIds: correctOptionIds,
              responseTimeMs,
            },
          ],
        },
      );
      assert.equal(invalidTiming.status, 400);
    }
    const unchangedTimingAnswer = await prisma.studentAnswer.findUniqueOrThrow({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: attempt.data.id,
          assignmentQuestionId: multiSnapshot.id,
        },
      },
    });
    assert.equal(unchangedTimingAnswer.responseTimeMs, null);

    const saveBody = {
      version: omittedTimingBody.data.version,
      answers: [
        {
          assignmentQuestionId: multiSnapshot.id,
          kind: "CHOICE",
          optionIds: correctOptionIds,
          responseTimeMs: 0,
        },
        {
          assignmentQuestionId: fillSnapshot.id,
          kind: "TEXT",
          value: "  4.0  ",
          responseTimeMs: 12_345,
        },
      ],
    };
    assert.equal(
      (
        await requestJson(
          `/api/student/submissions/${attempt.data.id}/answers`,
          studentCookie,
          "PUT",
          saveBody,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/submissions/${attempt.data.id}/answers`,
          studentCookie,
          "PUT",
          saveBody,
        )
      ).status,
      409,
    );
    const storedTimings = await prisma.studentAnswer.findMany({
      where: { submissionId: attempt.data.id },
      orderBy: { assignmentQuestionId: "asc" },
      select: { assignmentQuestionId: true, responseTimeMs: true },
    });
    assert.deepEqual(
      new Map(
        storedTimings.map((answer) => [
          answer.assignmentQuestionId,
          answer.responseTimeMs,
        ]),
      ),
      new Map([
        [multiSnapshot.id, 0],
        [fillSnapshot.id, 12_345],
      ]),
    );

    const [submitOne, submitTwo] = await Promise.all([
      requestJson(
        `/api/student/submissions/${attempt.data.id}/submit`,
        studentCookie,
        "POST",
      ),
      requestJson(
        `/api/student/submissions/${attempt.data.id}/submit`,
        studentCookie,
        "POST",
      ),
    ]);
    assert.equal(submitOne.status, 200);
    assert.equal(submitTwo.status, 200);
    const result = (await submitOne.json()) as ApiSuccess<{
      id: string;
      isPublished: boolean;
      score: number | null;
      maxScore: number | null;
      answers: Array<{ score: number }>;
    }>;
    assert.equal(result.data.id, attempt.data.id);
    assert.equal(result.data.isPublished, false);
    assert.equal(result.data.score, null);
    assert.equal(result.data.maxScore, null);
    assert.deepEqual(result.data.answers, []);

    const repeatResponse = await requestJson(
      `/api/student/assignments/${assignmentId}/attempts`,
      studentCookie,
      "POST",
      { idempotencyKey: randomUUID() },
    );
    assert.equal(repeatResponse.status, 201);
    const repeat = (await repeatResponse.json()) as ApiSuccess<{
      id: string;
      attemptNumber: number;
      version: number;
    }>;
    assert.equal(repeat.data.attemptNumber, 2);
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { dueAt: new Date(Date.now() - 1_000) },
    });
    assert.equal(
      (
        await requestJson(
          `/api/student/submissions/${repeat.data.id}/answers`,
          studentCookie,
          "PUT",
          {
            version: repeat.data.version,
            answers: [
              {
                assignmentQuestionId: fillSnapshot.id,
                kind: "TEXT",
                value: "4",
              },
            ],
          },
        )
      ).status,
      409,
    );

    const stored = await prisma.submission.findUniqueOrThrow({
      where: { id: attempt.data.id },
    });
    assert.equal(stored.status, SubmissionStatus.GRADED);
    assert.ok(stored.submittedAt);
    assert.equal(
      (
        await requestJson(
          `/api/teacher/assignments/${assignmentId}/results/publish`,
          teacherCookie,
          "POST",
        )
      ).status,
      200,
    );
    const publishedObjectiveResponse = await requestJson(
      `/api/student/submissions/${attempt.data.id}/result`,
      studentCookie,
    );
    assert.equal(publishedObjectiveResponse.status, 200);
    const publishedObjective =
      (await publishedObjectiveResponse.json()) as ApiSuccess<{
        isPublished: boolean;
        score: number;
        maxScore: number;
        answers: Array<{ score: number }>;
      }>;
    assert.equal(publishedObjective.data.isPublished, true);
    assert.equal(publishedObjective.data.score, 15);
    assert.equal(publishedObjective.data.maxScore, 15);
    assert.deepEqual(
      publishedObjective.data.answers.map((answer) => answer.score),
      [10, 5],
    );

    const manualInput = {
      ...input,
      title: `人工批改集成测试-${randomBytes(3).toString("hex")}`,
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      allowResubmission: false,
      questions: [
        { questionId: multipleChoice.id, sortOrder: 1, points: 10 },
        { questionId: shortAnswer.id, sortOrder: 2, points: 5 },
      ],
    };
    const manualCreatedResponse = await requestJson(
      "/api/teacher/assignments",
      teacherCookie,
      "POST",
      manualInput,
    );
    assert.equal(manualCreatedResponse.status, 201);
    const manualCreated = (await manualCreatedResponse.json()) as ApiSuccess<{
      id: string;
    }>;
    manualAssignmentId = manualCreated.data.id;
    assert.equal(
      (
        await requestJson(
          `/api/teacher/assignments/${manualAssignmentId}/publish`,
          teacherCookie,
          "POST",
        )
      ).status,
      200,
    );
    const manualAttemptResponse = await requestJson(
      `/api/student/assignments/${manualAssignmentId}/attempts`,
      studentCookie,
      "POST",
      { idempotencyKey: randomUUID() },
    );
    assert.equal(manualAttemptResponse.status, 201);
    const manualAttempt = (await manualAttemptResponse.json()) as ApiSuccess<{
      id: string;
      version: number;
    }>;
    const manualSnapshots = await prisma.assignmentQuestion.findMany({
      where: { assignmentId: manualAssignmentId },
      include: { optionSnapshots: true },
    });
    const manualObjective = manualSnapshots.find(
      (question) => question.typeSnapshot === QuestionType.MULTIPLE_CHOICE,
    );
    const manualSubjective = manualSnapshots.find(
      (question) => question.typeSnapshot === QuestionType.SHORT_ANSWER,
    );
    assert.ok(manualObjective);
    assert.ok(manualSubjective);
    const manualCorrectOptions = manualObjective.optionSnapshots
      .filter((option) => option.isCorrectSnapshot)
      .map((option) => option.id);
    assert.equal(
      (
        await requestJson(
          `/api/student/submissions/${manualAttempt.data.id}/answers`,
          studentCookie,
          "PUT",
          {
            version: manualAttempt.data.version,
            answers: [
              {
                assignmentQuestionId: manualObjective.id,
                kind: "CHOICE",
                optionIds: manualCorrectOptions,
              },
              {
                assignmentQuestionId: manualSubjective.id,
                kind: "TEXT",
                value: "这是学生的简答题作答",
              },
            ],
          },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/submissions/${manualAttempt.data.id}/submit`,
          studentCookie,
          "POST",
        )
      ).status,
      200,
    );
    const pendingResultResponse = await requestJson(
      `/api/student/submissions/${manualAttempt.data.id}/result`,
      studentCookie,
    );
    assert.equal(pendingResultResponse.status, 200);
    const pendingResult = (await pendingResultResponse.json()) as ApiSuccess<{
      isPublished: boolean;
      score: number | null;
      answers: unknown[];
    }>;
    assert.equal(pendingResult.data.isPublished, false);
    assert.equal(pendingResult.data.score, null);
    assert.deepEqual(pendingResult.data.answers, []);

    const submissionsPath = `/api/teacher/assignments/${manualAssignmentId}/submissions`;
    assert.equal((await requestJson(submissionsPath)).status, 401);
    assert.equal(
      (await requestJson(submissionsPath, studentCookie)).status,
      403,
    );
    assert.equal((await requestJson(submissionsPath, adminCookie)).status, 403);
    assert.equal(
      (await requestJson(submissionsPath, teacherTwoCookie)).status,
      404,
    );
    const submissionsResponse = await requestJson(
      `${submissionsPath}?status=PENDING_REVIEW`,
      teacherCookie,
    );
    assert.equal(submissionsResponse.status, 200);
    const submissions = (await submissionsResponse.json()) as ApiSuccess<{
      items: Array<{ id: string; objectiveScore: number }>;
    }>;
    assert.equal(submissions.data.items.length, 1);
    assert.equal(submissions.data.items[0].id, manualAttempt.data.id);
    assert.equal(submissions.data.items[0].objectiveScore, 10);

    const gradingDetailPath = `${submissionsPath}/${manualAttempt.data.id}`;
    assert.equal(
      (await requestJson(gradingDetailPath, teacherCookie)).status,
      200,
    );
    assert.equal(
      (await requestJson(gradingDetailPath, teacherTwoCookie)).status,
      404,
    );
    const subjectiveAnswer = await prisma.studentAnswer.findUniqueOrThrow({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: manualAttempt.data.id,
          assignmentQuestionId: manualSubjective.id,
        },
      },
    });
    const gradePath = `${gradingDetailPath}/answers/${subjectiveAnswer.id}`;
    assert.equal(
      (
        await requestJson(gradePath, studentCookie, "PATCH", {
          score: 4,
          feedback: "",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson(gradePath, adminCookie, "PATCH", {
          score: 4,
          feedback: "",
        })
      ).status,
      403,
    );
    const objectiveAnswer = await prisma.studentAnswer.findUniqueOrThrow({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: manualAttempt.data.id,
          assignmentQuestionId: manualObjective.id,
        },
      },
    });
    assert.equal(
      (
        await requestJson(
          `${gradingDetailPath}/answers/${objectiveAnswer.id}`,
          teacherCookie,
          "PATCH",
          { score: 0, feedback: "" },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await requestJson(gradePath, teacherCookie, "PATCH", {
          score: -1,
          feedback: "",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await requestJson(gradePath, teacherCookie, "PATCH", {
          score: 6,
          feedback: "",
        })
      ).status,
      400,
    );
    const completePath = `${gradingDetailPath}/complete`;
    assert.equal(
      (await requestJson(completePath, teacherCookie, "POST")).status,
      409,
    );
    const publishResultsPath = `/api/teacher/assignments/${manualAssignmentId}/results/publish`;
    assert.equal(
      (await requestJson(publishResultsPath, teacherCookie, "POST")).status,
      409,
    );
    assert.equal(
      (
        await requestJson(gradePath, teacherCookie, "PATCH", {
          score: 4,
          feedback: "思路正确，结论还可以更完整。",
        })
      ).status,
      200,
    );
    const completedResponse = await requestJson(
      completePath,
      teacherCookie,
      "POST",
    );
    assert.equal(completedResponse.status, 200);
    const completed = (await completedResponse.json()) as ApiSuccess<{
      status: SubmissionStatus;
      score: number;
    }>;
    assert.equal(completed.data.status, SubmissionStatus.GRADED);
    assert.equal(completed.data.score, 14);
    const repeatedComplete = await requestJson(
      completePath,
      teacherCookie,
      "POST",
    );
    assert.equal(repeatedComplete.status, 200);
    assert.equal(
      ((await repeatedComplete.json()) as ApiSuccess<{ score: number }>).data
        .score,
      14,
    );

    const publishResultsResponse = await requestJson(
      publishResultsPath,
      teacherCookie,
      "POST",
    );
    assert.equal(publishResultsResponse.status, 200);
    const publishedResult = await requestJson(
      `/api/student/submissions/${manualAttempt.data.id}/result`,
      studentCookie,
    );
    assert.equal(publishedResult.status, 200);
    const studentPublished = (await publishedResult.json()) as ApiSuccess<{
      isPublished: boolean;
      score: number;
      answers: Array<{
        score: number;
        teacherFeedback: string | null;
        correctAnswer: string;
      }>;
    }>;
    assert.equal(studentPublished.data.isPublished, true);
    assert.equal(studentPublished.data.score, 14);
    assert.equal(studentPublished.data.answers.length, 2);
    assert.equal(
      studentPublished.data.answers.find(
        (answer) => answer.teacherFeedback !== null,
      )?.teacherFeedback,
      "思路正确，结论还可以更完整。",
    );
    assert.equal(
      (await requestJson(publishResultsPath, teacherCookie, "POST")).status,
      200,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          actorId: teacher.id,
          OR: [
            {
              action: AuditAction.SUBMISSION_GRADING_COMPLETED,
              targetId: manualAttempt.data.id,
            },
            {
              action: AuditAction.ASSIGNMENT_RESULTS_PUBLISHED,
              targetId: manualAssignmentId,
            },
          ],
        },
      }),
      2,
    );
    console.info(
      "Assignment HTTP integration checks passed: auth, ownership, snapshots, autosave, objective grading, manual grading, publish visibility, idempotency, and audits.",
    );
  } finally {
    if (changedQuestion)
      await prisma.question.update({
        where: { id: changedQuestion.id },
        data: {
          content: changedQuestion.content,
          acceptableAnswers: changedQuestion.acceptableAnswers,
        },
      });
    const assignmentIds = [assignmentId, manualAssignmentId].filter(
      (value): value is string => Boolean(value),
    );
    if (assignmentIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetId: { in: assignmentIds } },
      });
      const submissionIds = (
        await prisma.submission.findMany({
          where: { assignmentId: { in: assignmentIds } },
          select: { id: true },
        })
      ).map((submission) => submission.id);
      if (submissionIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { targetId: { in: submissionIds } },
        });
      }
      await prisma.wrongQuestion.deleteMany({
        where: { assignmentQuestion: { assignmentId: { in: assignmentIds } } },
      });
      await prisma.studentAnswerOption.deleteMany({
        where: {
          studentAnswer: {
            submission: { assignmentId: { in: assignmentIds } },
          },
        },
      });
      await prisma.studentAnswer.deleteMany({
        where: { submission: { assignmentId: { in: assignmentIds } } },
      });
      await prisma.submission.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      });
      await prisma.assignmentQuestion.deleteMany({
        where: { assignmentId: { in: assignmentIds } },
      });
      await prisma.assignment.deleteMany({
        where: { id: { in: assignmentIds } },
      });
    }
    if (sessionIds.length > 0)
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
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
