import "server-only";

import {
  AuditAction,
  AuditTargetType,
  BackgroundJobStatus,
  GradingStatus,
  Prisma,
  ProgrammingAttemptKind,
  ProgrammingAttemptStatus,
  ProgrammingJudgeErrorType,
  ProgrammingTestVisibility,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { backgroundJobFingerprint } from "@/services/background-jobs/fingerprint";
import {
  completeBackgroundJob,
  failBackgroundJob,
} from "@/services/background-jobs/repository";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { appendAssessmentLearningEventsAndProjectEvidence } from "@/services/learning-events/assessment";
import {
  normalizeProgramOutput,
  programmingAttemptFingerprint,
} from "@/services/programming-attempts/fingerprint";
import {
  createPublicProgrammingRunSchema,
  programmingCompleteEnvelopeSchema,
  programmingJobInputSchema,
  type ProgrammingJudgeResult,
} from "@/services/programming-attempts/schemas";

const MAX_ATTEMPTS = 3;

function judgeError(errorType: string, passed: boolean) {
  if (errorType === "NONE") {
    return passed
      ? ProgrammingJudgeErrorType.NONE
      : ProgrammingJudgeErrorType.WRONG_ANSWER;
  }
  if (errorType === "INTERNAL_ERROR") {
    return ProgrammingJudgeErrorType.SYSTEM_ERROR;
  }
  return errorType as ProgrammingJudgeErrorType;
}

function safeSummary(errorType: ProgrammingJudgeErrorType) {
  const labels: Record<ProgrammingJudgeErrorType, string> = {
    NONE: "通过",
    WRONG_ANSWER: "输出不匹配",
    SYNTAX_ERROR: "语法错误",
    RUNTIME_ERROR: "运行错误",
    TIME_LIMIT: "运行超时",
    MEMORY_LIMIT: "内存超限",
    OUTPUT_LIMIT: "输出超限",
    PROCESS_LIMIT: "进程数量超限",
    SECURITY_VIOLATION: "触发安全限制",
    SYSTEM_ERROR: "判题服务暂时不可用",
    CANCELLED: "运行已取消",
  };
  return labels[errorType];
}

function safePublicStderr(value: string) {
  return value
    .replaceAll("/workspace/main.py", "main.py")
    .replace(/File "[^"]+"/gu, 'File "main.py"')
    .slice(0, 16_384);
}

async function createAttemptAndJob(
  transaction: Prisma.TransactionClient,
  input: {
    studentAnswerId: string;
    assignmentQuestionId: string;
    studentId: string;
    createdById: string;
    sourceCode: string;
    kind: ProgrammingAttemptKind;
    courseId: string | null;
    idempotencyKey: string;
  },
) {
  const jobType =
    input.kind === ProgrammingAttemptKind.PUBLIC_RUN
      ? "PYTHON_PUBLIC_RUN"
      : "PYTHON_JUDGE";
  const snapshot =
    await transaction.assignmentProgrammingConfigSnapshot.findUnique({
      where: { assignmentQuestionId: input.assignmentQuestionId },
      include: { configRevision: { select: { totalPoints: true } } },
    });
  if (!snapshot) {
    throw new AssignmentOperationError("该 Python 题缺少已冻结判题配置");
  }
  const inputFingerprint = programmingAttemptFingerprint({
    sourceCode: input.sourceCode,
    kind: input.kind,
    configurationHash: snapshot.configurationHash,
    testCasesHash: snapshot.testCasesHash,
    ruleVersion: snapshot.executorRuleVersion,
  });
  const existingJob = await transaction.backgroundJob.findUnique({
    where: {
      type_idempotencyKey: {
        type: jobType,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { programmingAttempt: true },
  });
  if (existingJob?.programmingAttempt) {
    if (existingJob.programmingAttempt.inputFingerprint !== inputFingerprint) {
      throw new AssignmentOperationError("相同幂等键对应了不同判题输入", 409);
    }
    return existingJob.programmingAttempt;
  }
  const latest = await transaction.programmingAttempt.findFirst({
    where: { studentAnswerId: input.studentAnswerId, kind: input.kind },
    orderBy: { revisionNumber: "desc" },
    select: { id: true, revisionNumber: true },
  });
  const attempt = await transaction.programmingAttempt.create({
    data: {
      studentAnswerId: input.studentAnswerId,
      assignmentQuestionId: input.assignmentQuestionId,
      studentId: input.studentId,
      createdById: input.createdById,
      configSnapshotId: snapshot.id,
      kind: input.kind,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      sourceCode: input.sourceCode,
      inputFingerprint,
      ruleVersion: snapshot.executorRuleVersion,
      maxScore: snapshot.configRevision.totalPoints,
      supersedesAttemptId: latest?.id ?? null,
    },
  });
  const jobInput = { programmingAttemptId: attempt.id };
  const job = await transaction.backgroundJob.create({
    data: {
      type: jobType,
      requestedById: input.createdById,
      courseId: input.courseId,
      idempotencyKey: input.idempotencyKey,
      inputFingerprint: backgroundJobFingerprint({
        requestedById: input.createdById,
        courseId: input.courseId,
        maxAttempts: MAX_ATTEMPTS,
        input: jobInput,
      }),
      input: jobInput,
      maxAttempts: MAX_ATTEMPTS,
    },
  });
  return transaction.programmingAttempt.update({
    where: { id: attempt.id },
    data: { backgroundJobId: job.id },
  });
}

export async function createPublicProgrammingRun(
  studentId: string,
  submissionId: string,
  rawInput: unknown,
) {
  const input = createPublicProgrammingRunSchema.parse(rawInput);
  const attempt = await runAssignmentSerializable(async (transaction) => {
    const submission = await transaction.submission.findFirst({
      where: {
        id: submissionId,
        studentId,
        status: SubmissionStatus.IN_PROGRESS,
        assignment: {
          status: "PUBLISHED",
          classroom: {
            memberships: { some: { studentId, status: "ACTIVE" } },
          },
        },
      },
      select: {
        id: true,
        assignmentId: true,
        assignment: { select: { classroom: { select: { courseId: true } } } },
      },
    });
    if (!submission) throw new ResourceNotFoundError("作答记录不存在");
    const question = await transaction.assignmentQuestion.findFirst({
      where: {
        id: input.assignmentQuestionId,
        assignmentId: submission.assignmentId,
        typeSnapshot: QuestionType.PYTHON_PROGRAMMING,
      },
      select: { id: true, points: true },
    });
    if (!question) throw new ResourceNotFoundError("Python 作业题不存在");
    const answer = await transaction.studentAnswer.upsert({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId,
          assignmentQuestionId: question.id,
        },
      },
      update: {},
      create: {
        submissionId,
        assignmentQuestionId: question.id,
        maxScore: question.points,
      },
    });
    return createAttemptAndJob(transaction, {
      studentAnswerId: answer.id,
      assignmentQuestionId: question.id,
      studentId,
      createdById: studentId,
      sourceCode: input.sourceCode,
      kind: ProgrammingAttemptKind.PUBLIC_RUN,
      courseId: submission.assignment.classroom.courseId,
      idempotencyKey: `public:${answer.id}:${input.idempotencyKey}`,
    });
  }, "公开样例运行请求发生冲突，请重试");
  return { attemptId: attempt.id, status: attempt.status };
}

export async function createFormalProgrammingAttempt(
  transaction: Prisma.TransactionClient,
  input: {
    studentAnswerId: string;
    assignmentQuestionId: string;
    studentId: string;
    sourceCode: string;
    courseId: string | null;
  },
) {
  const latest = await transaction.programmingAttempt.findFirst({
    where: {
      studentAnswerId: input.studentAnswerId,
      kind: ProgrammingAttemptKind.FORMAL_JUDGE,
    },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });
  return createAttemptAndJob(transaction, {
    ...input,
    createdById: input.studentId,
    kind: ProgrammingAttemptKind.FORMAL_JUDGE,
    idempotencyKey: `formal:${input.studentAnswerId}:revision:${(latest?.revisionNumber ?? 0) + 1}`,
  });
}

export async function getProgrammingAttemptPayload(attemptId: string) {
  return prisma.$transaction(async (transaction) => {
    const attempt = await transaction.programmingAttempt.findUnique({
      where: { id: attemptId },
      include: {
        configSnapshot: {
          include: {
            configRevision: {
              include: { testCases: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    });
    if (!attempt) throw new ResourceNotFoundError("判题 Attempt 不存在");
    if (
      attempt.status !== ProgrammingAttemptStatus.PENDING &&
      attempt.status !== ProgrammingAttemptStatus.RUNNING
    ) {
      throw new AssignmentOperationError("判题 Attempt 已进入终态", 409);
    }
    const now = new Date();
    await transaction.programmingAttempt.update({
      where: { id: attempt.id },
      data: {
        status: ProgrammingAttemptStatus.RUNNING,
        startedAt: attempt.startedAt ?? now,
      },
    });
    const allCases = attempt.configSnapshot.configRevision.testCases;
    const selectedCases =
      attempt.kind === ProgrammingAttemptKind.PUBLIC_RUN
        ? allCases.filter(
            (testCase) =>
              testCase.visibility === ProgrammingTestVisibility.PUBLIC,
          )
        : allCases;
    return {
      attemptId: attempt.id,
      kind: attempt.kind,
      sourceCode: attempt.sourceCode,
      inputFingerprint: attempt.inputFingerprint,
      limits: {
        cpuTimeMs: attempt.configSnapshot.cpuTimeMs,
        wallTimeMs: attempt.configSnapshot.wallTimeMs,
        memoryBytes: attempt.configSnapshot.memoryBytes,
        outputBytes: attempt.configSnapshot.outputBytes,
        processCount: attempt.configSnapshot.processCount,
      },
      testCases: selectedCases.map((testCase) => ({
        id: testCase.id,
        visibility: testCase.visibility,
        stdin: testCase.stdin,
        expectedOutput: testCase.expectedOutput,
        sortOrder: testCase.sortOrder,
      })),
    };
  });
}

async function recomputeSubmission(
  transaction: Prisma.TransactionClient,
  submissionId: string,
  gradedAt: Date,
) {
  const submission = await transaction.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      assignment: { select: { totalPoints: true } },
      answers: { select: { score: true, gradingStatus: true } },
    },
  });
  const earned = submission.answers.reduce(
    (sum, answer) => sum.add(answer.score ?? 0),
    new Prisma.Decimal(0),
  );
  const unfinished = submission.answers.some(
    (answer) =>
      answer.gradingStatus === GradingStatus.UNGRADED ||
      answer.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED,
  );
  const maxScore = submission.assignment.totalPoints;
  await transaction.submission.update({
    where: { id: submissionId },
    data: {
      status: unfinished
        ? SubmissionStatus.PENDING_REVIEW
        : SubmissionStatus.GRADED,
      score: earned,
      maxScore,
      percentage: maxScore.gt(0)
        ? earned.div(maxScore).mul(100).toDecimalPlaces(2)
        : 0,
      gradedAt: unfinished ? null : gradedAt,
      publishedAt: null,
    },
  });
}

async function projectJudgeResult(
  transaction: Prisma.TransactionClient,
  job: { id: string; type: string; input: Prisma.JsonValue },
  result: ProgrammingJudgeResult,
) {
  const jobInput = programmingJobInputSchema.parse(job.input);
  if (jobInput.programmingAttemptId !== result.attemptId) {
    throw new AssignmentOperationError("判题任务结果引用不一致", 409);
  }
  const attempt = await transaction.programmingAttempt.findUnique({
    where: { id: result.attemptId },
    include: {
      studentAnswer: { select: { submissionId: true } },
      configSnapshot: {
        include: {
          configRevision: {
            include: { testCases: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  if (!attempt || attempt.backgroundJobId !== job.id) {
    throw new ResourceNotFoundError("判题 Attempt 不存在");
  }
  const allCases = attempt.configSnapshot.configRevision.testCases;
  const expectedCases =
    attempt.kind === ProgrammingAttemptKind.PUBLIC_RUN
      ? allCases.filter(
          (testCase) =>
            testCase.visibility === ProgrammingTestVisibility.PUBLIC,
        )
      : allCases;
  const resultByCase = new Map(
    result.cases.map((item) => [item.testCaseId, item]),
  );
  if (
    resultByCase.size !== expectedCases.length ||
    expectedCases.some((testCase) => !resultByCase.has(testCase.id))
  ) {
    throw new AssignmentOperationError("判题用例结果不完整", 409);
  }
  if (result.cases.some((item) => item.errorType === "INTERNAL_ERROR")) {
    throw new AssignmentOperationError("执行器系统故障不能投影为学生成绩", 409);
  }
  const now = new Date();
  let earned = new Prisma.Decimal(0);
  let overall: ProgrammingJudgeErrorType = ProgrammingJudgeErrorType.NONE;
  const rows = expectedCases.map((testCase, index) => {
    const item = resultByCase.get(testCase.id)!;
    const passed =
      item.errorType === "NONE" &&
      normalizeProgramOutput(item.stdout) ===
        normalizeProgramOutput(testCase.expectedOutput);
    const errorType = judgeError(item.errorType, passed);
    if (!passed && overall === ProgrammingJudgeErrorType.NONE) {
      overall = errorType;
    }
    const earnedPoints = passed ? testCase.points : new Prisma.Decimal(0);
    earned = earned.add(earnedPoints);
    return {
      attemptId: attempt.id,
      testCaseId: testCase.id,
      caseIndex: index + 1,
      visibility: testCase.visibility,
      passed,
      earnedPoints,
      maxPoints: testCase.points,
      errorType,
      safeErrorSummary: safeSummary(errorType),
      stdout:
        testCase.visibility === ProgrammingTestVisibility.PUBLIC
          ? item.stdout.slice(0, 16_384)
          : null,
      stderr:
        testCase.visibility === ProgrammingTestVisibility.PUBLIC
          ? safePublicStderr(item.stderr)
          : null,
      resourceUsage:
        item.resourceUsage === null
          ? Prisma.DbNull
          : (item.resourceUsage as Prisma.InputJsonObject),
    };
  });
  await transaction.programmingTestCaseResult.createMany({ data: rows });
  await transaction.programmingAttempt.update({
    where: { id: attempt.id },
    data: {
      status: ProgrammingAttemptStatus.SUCCEEDED,
      score:
        attempt.kind === ProgrammingAttemptKind.FORMAL_JUDGE ? earned : null,
      overallErrorType: overall,
      safeErrorSummary: safeSummary(overall),
      completedAt: now,
    },
  });
  if (attempt.kind === ProgrammingAttemptKind.FORMAL_JUDGE) {
    await transaction.studentAnswer.update({
      where: { id: attempt.studentAnswerId },
      data: {
        gradingStatus: GradingStatus.AUTO_GRADED,
        score: earned,
        maxScore: attempt.maxScore,
        isCorrect: earned.equals(attempt.maxScore),
        gradedAt: now,
        assessmentRevisionKey: attempt.id,
      },
    });
    await recomputeSubmission(
      transaction,
      attempt.studentAnswer.submissionId,
      now,
    );
    await appendAssessmentLearningEventsAndProjectEvidence(transaction, [
      attempt.studentAnswerId,
    ]);
  }
  return { attemptId: attempt.id, score: earned.toNumber() };
}

export async function completeProgrammingJob(jobId: string, rawInput: unknown) {
  const envelope = programmingCompleteEnvelopeSchema.parse(rawInput);
  const result = envelope.result;
  return completeBackgroundJob(
    jobId,
    { leaseId: envelope.leaseId, result, resourceUsage: {} },
    (transaction, job) => projectJudgeResult(transaction, job, result),
  );
}

export async function failProgrammingJob(jobId: string, rawInput: unknown) {
  return failBackgroundJob(
    jobId,
    rawInput,
    async (transaction, job, willRetry) => {
      const input = programmingJobInputSchema.parse(job.input);
      if (!willRetry) {
        await transaction.programmingAttempt.updateMany({
          where: {
            id: input.programmingAttemptId,
            status: {
              in: [
                ProgrammingAttemptStatus.PENDING,
                ProgrammingAttemptStatus.RUNNING,
              ],
            },
          },
          data: {
            status: ProgrammingAttemptStatus.SYSTEM_ERROR,
            overallErrorType: ProgrammingJudgeErrorType.SYSTEM_ERROR,
            safeErrorSummary: safeSummary(
              ProgrammingJudgeErrorType.SYSTEM_ERROR,
            ),
            completedAt: new Date(),
          },
        });
      }
      return { attemptId: input.programmingAttemptId };
    },
  );
}

const attemptInclude = {
  backgroundJob: { select: { status: true, progress: true, errorCode: true } },
  testResults: { orderBy: { caseIndex: "asc" as const } },
} satisfies Prisma.ProgrammingAttemptInclude;

function studentAttemptDto(
  attempt: Prisma.ProgrammingAttemptGetPayload<{
    include: typeof attemptInclude;
  }>,
) {
  return {
    id: attempt.id,
    kind: attempt.kind,
    status: attempt.status,
    jobStatus: attempt.backgroundJob?.status ?? null,
    progress: attempt.backgroundJob?.progress ?? 0,
    score: attempt.score?.toNumber() ?? null,
    maxScore: attempt.maxScore.toNumber(),
    errorType: attempt.overallErrorType,
    safeErrorSummary: attempt.safeErrorSummary,
    createdAt: attempt.createdAt,
    completedAt: attempt.completedAt,
    cases: attempt.testResults.map((item) => ({
      index: item.caseIndex,
      passed: item.passed,
      score: item.earnedPoints.toNumber(),
      maxScore: item.maxPoints.toNumber(),
      errorType: item.errorType,
      safeErrorSummary: item.safeErrorSummary,
      ...(attempt.kind === ProgrammingAttemptKind.PUBLIC_RUN
        ? { stdout: item.stdout ?? "", stderr: item.stderr ?? "" }
        : {}),
    })),
  };
}

export async function getStudentProgrammingAttempt(
  studentId: string,
  attemptId: string,
) {
  const attempt = await prisma.programmingAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: attemptInclude,
  });
  if (!attempt) throw new ResourceNotFoundError("判题记录不存在");
  return studentAttemptDto(attempt);
}

export async function rejudgeProgrammingAttempt(
  teacherId: string,
  attemptId: string,
  reason: string,
  idempotencyKey: string,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (transaction) => {
    const previous = await transaction.programmingAttempt.findFirst({
      where: {
        id: attemptId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
        assignmentQuestion: { assignment: { teacherId } },
      },
      include: {
        studentAnswer: {
          select: {
            submission: {
              select: {
                assignment: {
                  select: { classroom: { select: { courseId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!previous) throw new ResourceNotFoundError("判题记录不存在");
    const created = await createAttemptAndJob(transaction, {
      studentAnswerId: previous.studentAnswerId,
      assignmentQuestionId: previous.assignmentQuestionId,
      studentId: previous.studentId,
      createdById: teacherId,
      sourceCode: previous.sourceCode,
      kind: ProgrammingAttemptKind.FORMAL_JUDGE,
      courseId: previous.studentAnswer.submission.assignment.classroom.courseId,
      idempotencyKey: `rejudge:${previous.studentAnswerId}:${idempotencyKey}`,
    });
    await writeTeachingAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.PROGRAMMING_ATTEMPT_REJUDGED,
      targetType: AuditTargetType.ASSIGNMENT,
      targetId: previous.assignmentQuestionId,
      summary: "重新判定 Python 提交",
      beforeData: { attemptId: previous.id },
      afterData: { attemptId: created.id, reason },
      context,
    });
    return { attemptId: created.id, status: created.status };
  }, "重判请求发生冲突，请重试");
}

export async function revokeProgrammingAttempt(
  teacherId: string,
  attemptId: string,
  reason: string,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (transaction) => {
    const previous = await transaction.programmingAttempt.findFirst({
      where: {
        id: attemptId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
        status: ProgrammingAttemptStatus.SUCCEEDED,
        assignmentQuestion: { assignment: { teacherId } },
      },
      include: { studentAnswer: { select: { submissionId: true } } },
    });
    if (!previous) throw new ResourceNotFoundError("判题记录不存在");
    const latest = await transaction.programmingAttempt.findFirst({
      where: {
        studentAnswerId: previous.studentAnswerId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
      },
      orderBy: { revisionNumber: "desc" },
      select: { id: true, revisionNumber: true },
    });
    if (!latest || latest.id !== previous.id) {
      throw new AssignmentOperationError("只能撤销最新正式判题修订", 409);
    }
    const now = new Date();
    const revoked = await transaction.programmingAttempt.create({
      data: {
        studentAnswerId: previous.studentAnswerId,
        assignmentQuestionId: previous.assignmentQuestionId,
        studentId: previous.studentId,
        createdById: teacherId,
        configSnapshotId: previous.configSnapshotId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
        revisionNumber: latest.revisionNumber + 1,
        sourceCode: previous.sourceCode,
        inputFingerprint: programmingAttemptFingerprint({
          revokedAttemptId: previous.id,
          reason,
        }),
        ruleVersion: previous.ruleVersion,
        status: ProgrammingAttemptStatus.CANCELLED,
        maxScore: previous.maxScore,
        overallErrorType: ProgrammingJudgeErrorType.CANCELLED,
        safeErrorSummary: "教师已撤销本次判题结果",
        supersedesAttemptId: previous.id,
        completedAt: now,
      },
    });
    await transaction.studentAnswer.update({
      where: { id: previous.studentAnswerId },
      data: {
        gradingStatus: GradingStatus.UNGRADED,
        score: null,
        isCorrect: null,
        gradedAt: null,
        assessmentRevisionKey: `revoked:${revoked.id}`,
      },
    });
    await recomputeSubmission(
      transaction,
      previous.studentAnswer.submissionId,
      now,
    );
    await appendAssessmentLearningEventsAndProjectEvidence(transaction, [
      previous.studentAnswerId,
    ]);
    await writeTeachingAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.PROGRAMMING_ATTEMPT_REVOKED,
      targetType: AuditTargetType.ASSIGNMENT,
      targetId: previous.assignmentQuestionId,
      summary: "撤销 Python 判题结果",
      beforeData: { attemptId: previous.id },
      afterData: { attemptId: revoked.id, reason },
      context,
    });
    return { attemptId: revoked.id, status: revoked.status };
  }, "撤销请求发生冲突，请重试");
}

export async function cancelStudentProgrammingAttempt(
  studentId: string,
  attemptId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const attempt = await transaction.programmingAttempt.findFirst({
      where: {
        id: attemptId,
        studentId,
        kind: ProgrammingAttemptKind.PUBLIC_RUN,
        status: {
          in: [
            ProgrammingAttemptStatus.PENDING,
            ProgrammingAttemptStatus.RUNNING,
          ],
        },
      },
      include: { backgroundJob: true },
    });
    if (!attempt) return { cancelled: false };
    const now = new Date();
    const leaseId = attempt.backgroundJob?.currentLeaseId;
    if (attempt.backgroundJob && leaseId) {
      await transaction.backgroundJobAttempt.updateMany({
        where: {
          jobId: attempt.backgroundJob.id,
          leaseId,
          completedAt: null,
        },
        data: {
          completedAt: now,
          heartbeatAt: now,
          errorCode: "CANCELLED",
          retryable: false,
        },
      });
    }
    if (attempt.backgroundJob) {
      await transaction.backgroundJob.updateMany({
        where: {
          id: attempt.backgroundJob.id,
          status: {
            in: [BackgroundJobStatus.PENDING, BackgroundJobStatus.RUNNING],
          },
        },
        data: {
          status: BackgroundJobStatus.CANCELLED,
          currentLeaseId: null,
          cancelRequestedAt: now,
          completedAt: now,
          errorCode: "CANCELLED",
          retryable: false,
        },
      });
    }
    await transaction.programmingAttempt.update({
      where: { id: attempt.id },
      data: {
        status: ProgrammingAttemptStatus.CANCELLED,
        overallErrorType: ProgrammingJudgeErrorType.CANCELLED,
        safeErrorSummary: safeSummary(ProgrammingJudgeErrorType.CANCELLED),
        completedAt: now,
      },
    });
    return { cancelled: true };
  });
}
