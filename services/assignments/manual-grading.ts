import { summarizeSubmission } from "./submission-summary";
import { countUsableGrants, usableGrantWindow } from "./work-access";
import { assignmentCapabilities } from "./capabilities";
import {
  assertGradingWritable,
  lockAssignmentLifecycle,
  touchAssignmentLifecycle,
} from "./lifecycle-lock";
import "server-only";
import { latestEffectiveSubmissions } from "./latest-submissions";

import {
  AuditAction,
  AuditTargetType,
  GradingStatus,
  Prisma,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  formatCorrectAnswer,
  formatStudentAnswer,
} from "@/services/assignments/answer-presentation";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { gradeAnswer, savedAnswerInput } from "@/services/assignments/grading";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import type {
  ManualGradeAnswerData,
  TeacherSubmissionListQuery,
} from "@/services/assignments/schemas";
import type {
  PublishAssignmentResultsResult,
  TeacherSubmissionDetail,
  TeacherSubmissionListResult,
} from "@/services/assignments/types";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { appendAssessmentLearningEventsAndProjectEvidence } from "@/services/learning-events/assessment";
import { notifyAssignmentGraded } from "@/services/notifications/events/assignment";
import { logNotificationFailure } from "@/services/notifications/logging";

const submittedStatuses: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

const gradingDetailInclude = {
  assignment: {
    include: {
      classroom: { select: { id: true, name: true, status: true } },
      questions: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          optionSnapshots: { orderBy: { sortOrder: "asc" as const } },
        },
      },
    },
  },
  student: {
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true, studentNo: true } },
    },
  },
  answers: {
    orderBy: { assignmentQuestion: { sortOrder: "asc" as const } },
    include: {
      programmingAttempts: {
        where: { kind: "FORMAL_JUDGE" as const },
        orderBy: { revisionNumber: "desc" as const },
        take: 1,
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          overallErrorType: true,
          safeErrorSummary: true,
          revisionNumber: true,
        },
      },
      selectedOptions: {
        orderBy: { assignmentQuestionOption: { sortOrder: "asc" as const } },
        select: {
          assignmentQuestionOptionId: true,
          assignmentQuestionOption: {
            select: {
              labelSnapshot: true,
              contentSnapshot: true,
            },
          },
        },
      },
      assignmentQuestion: {
        include: {
          optionSnapshots: { orderBy: { sortOrder: "asc" as const } },
        },
      },
    },
  },
} satisfies Prisma.SubmissionInclude;

type GradingSubmissionRecord = Prisma.SubmissionGetPayload<{
  include: typeof gradingDetailInclude;
}>;

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function detailFromRecord(
  submission: GradingSubmissionRecord,
): Omit<
  TeacherSubmissionDetail,
  | "canManageGrading"
  | "gradingBlockedReason"
  | "attempts"
  | "isLatestEffective"
  | "questions"
  | "snapshotAt"
> {
  return {
    id: submission.id,
    status: submission.status,
    attemptNumber: submission.attemptNumber,
    submittedAt: submission.submittedAt,
    gradedAt: submission.gradedAt,
    publishedAt: submission.publishedAt,
    score: decimalNumber(submission.score),
    maxScore:
      decimalNumber(submission.maxScore) ??
      submission.assignment.totalPoints.toNumber(),
    percentage: decimalNumber(submission.percentage),
    assignment: {
      id: submission.assignment.id,
      title: submission.assignment.title,
      category: submission.assignment.category,
      allowAttachments: submission.assignment.allowAttachments,
      classroomId: submission.assignment.classroom.id,
      classroomName: submission.assignment.classroom.name,
      totalPoints: submission.assignment.totalPoints.toNumber(),
    },
    student: {
      id: submission.student.id,
      displayName:
        submission.student.profile?.displayName ?? submission.student.email,
      email: submission.student.email,
      studentNo: submission.student.profile?.studentNo ?? null,
    },
    answers: submission.answers.map((answer) => ({
      id: answer.id,
      finalScore: decimalNumber(answer.score),
      options: answer.assignmentQuestion.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
        content: option.contentSnapshot,
      })),
      assignmentQuestionId: answer.assignmentQuestionId,
      title: answer.assignmentQuestion.titleSnapshot,
      content: answer.assignmentQuestion.contentSnapshot,
      type: answer.assignmentQuestion.typeSnapshot,
      sortOrder: answer.assignmentQuestion.sortOrder,
      maxScore: answer.assignmentQuestion.points.toNumber(),
      studentAnswer: formatStudentAnswer(
        answer,
        answer.assignmentQuestion.typeSnapshot,
      ),
      correctAnswer: formatCorrectAnswer(answer.assignmentQuestion),
      automaticScore:
        answer.assignmentQuestion.typeSnapshot === QuestionType.SHORT_ANSWER
          ? null
          : answer.assignmentQuestion.typeSnapshot ===
              QuestionType.PYTHON_PROGRAMMING
            ? decimalNumber(answer.programmingAttempts[0]?.score ?? null)
            : decimalNumber(answer.score),
      manualScore:
        answer.assignmentQuestion.typeSnapshot === QuestionType.SHORT_ANSWER ||
        (answer.assignmentQuestion.typeSnapshot ===
          QuestionType.PYTHON_PROGRAMMING &&
          answer.graderId !== null)
          ? decimalNumber(answer.score)
          : null,
      isCorrect: answer.isCorrect,
      gradingStatus: answer.gradingStatus,
      teacherFeedback: answer.teacherFeedback,
      explanation: answer.assignmentQuestion.explanationSnapshot,
      programmingAttempt: answer.programmingAttempts[0]
        ? {
            id: answer.programmingAttempts[0].id,
            status: answer.programmingAttempts[0].status,
            score: decimalNumber(answer.programmingAttempts[0].score),
            maxScore: answer.programmingAttempts[0].maxScore.toNumber(),
            errorType: answer.programmingAttempts[0].overallErrorType,
            safeErrorSummary: answer.programmingAttempts[0].safeErrorSummary,
            revisionNumber: answer.programmingAttempts[0].revisionNumber,
          }
        : null,
    })),
  };
}

async function loadTeacherSubmission(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
): Promise<GradingSubmissionRecord> {
  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      assignmentId,
      assignment: { teacherId },
      status: { in: submittedStatuses },
    },
    include: gradingDetailInclude,
  });
  if (!submission) throw new ResourceNotFoundError("提交记录不存在");
  return submission;
}

export async function listTeacherAssignmentSubmissions(
  teacherId: string,
  assignmentId: string,
  query: TeacherSubmissionListQuery,
): Promise<TeacherSubmissionListResult> {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId, deletedAt: null },
    select: {
      id: true,
      title: true,
      totalPoints: true,
      questions: { select: { id: true, typeSnapshot: true, points: true } },
      status: true,
      publishedAt: true,
      dueAt: true,
      classroom: {
        select: {
          name: true,
          status: true,
          memberships: {
            where: { status: "ACTIVE" },
            select: { studentId: true },
          },
        },
      },
      _count: {
        select: {
          submissions: { where: { status: { in: submittedStatuses } } },
        },
      },
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");

  const where: Prisma.SubmissionWhereInput = {
    assignmentId,
    status:
      query.status === SubmissionStatus.GRADED ||
      query.status === SubmissionStatus.PUBLISHED
        ? { in: [SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED] }
        : (query.status ?? { in: submittedStatuses }),
  };
  const [total, submissions, latestSubmissions] = await prisma.$transaction([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        submittedAt: true,
        gradedAt: true,
        publishedAt: true,
        score: true,
        maxScore: true,
        student: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, studentNo: true } },
          },
        },
        answers: {
          select: {
            score: true,
            isCorrect: true,
            assignmentQuestionId: true,
            programmingAttempts: {
              where: { kind: "FORMAL_JUDGE" },
              orderBy: { revisionNumber: "desc" },
              take: 1,
              select: { status: true },
            },
            gradingStatus: true,
            assignmentQuestion: { select: { typeSnapshot: true } },
          },
        },
      },
    }),
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT ON ("studentId") id FROM "Submission"
      WHERE "assignmentId" = ${assignmentId}
      AND status::text IN ('SUBMITTED', 'PENDING_REVIEW', 'GRADED', 'PUBLISHED')
      ORDER BY "studentId", "attemptNumber" DESC, "submittedAt" DESC NULLS LAST, id DESC
    `,
  ]);

  return {
    totalSubmitted: assignment._count.submissions,
    assignment: {
      id: assignment.id,
      title: assignment.title,
      classroomName: assignment.classroom.name,
      totalPoints: assignment.totalPoints.toNumber(),
    },
    items: submissions.map((submission) => ({
      id: submission.id,
      gradingBlockedReason:
        assignmentCapabilities(assignment).gradingBlockedReason ??
        (assignment.classroom.memberships.some(
          (member) => member.studentId === submission.student.id,
        )
          ? null
          : "历史成员的作答仅供查看，不能修改成绩") ??
        (latestSubmissions.some((latest) => latest.id === submission.id)
          ? null
          : "历史提交只读，请切换到最新有效提交处理"),
      student: {
        id: submission.student.id,
        displayName:
          submission.student.profile?.displayName ?? submission.student.email,
        email: submission.student.email,
        studentNo: submission.student.profile?.studentNo ?? null,
      },
      attemptNumber: submission.attemptNumber,
      status: submission.status,
      submittedAt: submission.submittedAt,
      gradedAt: submission.gradedAt,
      publishedAt: submission.publishedAt,
      ...summarizeSubmission(
        assignment.questions.map((question) => ({
          id: question.id,
          type: question.typeSnapshot,
          points: question.points.toNumber(),
        })),
        submission.answers.map((answer) => ({
          questionId: answer.assignmentQuestionId,
          score: decimalNumber(answer.score),
          isCorrect: answer.isCorrect,
          gradingStatus: answer.gradingStatus,
          judgeStatus: answer.programmingAttempts[0]?.status ?? null,
        })),
        submission.status,
      ),
      currentScore: decimalNumber(submission.score),
      maxScore:
        decimalNumber(submission.maxScore) ?? assignment.totalPoints.toNumber(),
      requiresManualReview: submission.answers.some(
        (answer) =>
          (answer.assignmentQuestion.typeSnapshot ===
            QuestionType.SHORT_ANSWER ||
            answer.assignmentQuestion.typeSnapshot ===
              QuestionType.PYTHON_PROGRAMMING) &&
          answer.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED,
      ),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getTeacherSubmissionForGrading(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
): Promise<TeacherSubmissionDetail> {
  const snapshotAt = Date.now();
  const record = await loadTeacherSubmission(
    teacherId,
    assignmentId,
    submissionId,
  );
  const membership = await prisma.classMembership.findUnique({
    where: {
      classroomId_studentId: {
        classroomId: record.assignment.classroomId,
        studentId: record.studentId,
      },
    },
    select: { status: true },
  });
  const attempts = await prisma.submission.findMany({
    where: {
      assignmentId,
      studentId: record.studentId,
      status: { in: submittedStatuses },
    },
    orderBy: [
      { attemptNumber: "desc" },
      { submittedAt: "desc" },
      { id: "desc" },
    ],
    select: { id: true, attemptNumber: true, submittedAt: true, status: true },
  });
  const isLatestEffective = attempts[0]?.id === record.id;
  const blockedReason =
    assignmentCapabilities(record.assignment).gradingBlockedReason ??
    (membership?.status === "ACTIVE"
      ? null
      : "历史成员的作答仅供查看，不能修改成绩") ??
    (isLatestEffective ? null : "历史提交只读，请切换到最新有效提交处理");
  const detail = detailFromRecord(record);
  return {
    ...detail,
    snapshotAt,
    attempts,
    isLatestEffective,
    questions: record.assignment.questions.map((q) => ({
      id: q.id,
      title: q.titleSnapshot,
      content: q.contentSnapshot,
      type: q.typeSnapshot,
      sortOrder: q.sortOrder,
      maxScore: q.points.toNumber(),
      correctAnswer: formatCorrectAnswer(q),
      explanation: q.explanationSnapshot,
      options: q.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
        content: option.contentSnapshot,
      })),
      answer:
        detail.answers.find((answer) => answer.assignmentQuestionId === q.id) ??
        null,
    })),
    canManageGrading: blockedReason === null,
    gradingBlockedReason: blockedReason,
  };
}

export async function saveManualAnswerGrade(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
  answerId: string,
  input: ManualGradeAnswerData,
  auditContext: AuditRequestContext = { ipAddress: null, userAgent: null },
): Promise<TeacherSubmissionDetail> {
  await runAssignmentSerializable(async (transaction) => {
    const answer = await transaction.studentAnswer.findFirst({
      where: {
        id: answerId,
        submissionId,
        submission: {
          assignmentId,
          assignment: { teacherId },
        },
      },
      select: {
        id: true,
        gradingStatus: true,
        score: true,
        teacherFeedback: true,
        programmingAttempts: {
          where: { kind: "FORMAL_JUDGE" },
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { id: true, status: true, score: true },
        },
        assignmentQuestion: {
          select: { typeSnapshot: true, points: true },
        },
        submission: { select: { status: true, studentId: true } },
      },
    });
    if (!answer) throw new ResourceNotFoundError("待批改答案不存在");
    await assertGradingWritable(
      transaction,
      teacherId,
      assignmentId,
      answer.submission.studentId,
      submissionId,
    );
    const isProgramming =
      answer.assignmentQuestion.typeSnapshot ===
      QuestionType.PYTHON_PROGRAMMING;
    if (
      isProgramming &&
      (answer.programmingAttempts[0]?.status !== "SUCCEEDED" ||
        !input.feedback?.trim())
    ) {
      throw new AssignmentOperationError(
        "编程题须先完成判题，复核给分必须填写评分依据",
        400,
      );
    }
    if (
      answer.assignmentQuestion.typeSnapshot !== QuestionType.SHORT_ANSWER &&
      !isProgramming
    ) {
      throw new AssignmentOperationError(
        "客观题自动得分不能通过人工批改接口修改",
      );
    }
    if (answer.submission.status !== SubmissionStatus.PENDING_REVIEW) {
      throw new AssignmentOperationError("当前提交状态不能继续修改人工评分");
    }
    if (new Prisma.Decimal(input.score).gt(answer.assignmentQuestion.points)) {
      throw new AssignmentOperationError("人工得分不能超过当前题目分值", 400);
    }

    if (
      answer.gradingStatus === GradingStatus.GRADED &&
      answer.score?.equals(input.score) &&
      (answer.teacherFeedback ?? "") === (input.feedback || "")
    )
      return;
    const now = new Date();
    const updated = await transaction.studentAnswer.updateMany({
      where: {
        id: answer.id,
        submissionId,
        gradingStatus: {
          in: [GradingStatus.MANUAL_REVIEW_REQUIRED, GradingStatus.GRADED],
        },
        submission: { status: SubmissionStatus.PENDING_REVIEW },
      },
      data: {
        graderId: teacherId,
        gradingStatus: GradingStatus.GRADED,
        score: new Prisma.Decimal(input.score),
        maxScore: answer.assignmentQuestion.points,
        isCorrect: new Prisma.Decimal(input.score).equals(
          answer.assignmentQuestion.points,
        ),
        teacherFeedback: input.feedback || null,
        gradedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new AssignmentOperationError("评分状态已发生变化，请刷新后重试");
    }
    if (isProgramming) {
      await writeTeachingAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.SUBMISSION_GRADING_COMPLETED,
        targetType: AuditTargetType.SUBMISSION,
        targetId: submissionId,
        summary: "编程题部分给分复核（保留自动判题原分）",
        beforeData: {
          answerId: answer.id,
          score: decimalNumber(answer.score),
          attemptId: answer.programmingAttempts[0]?.id ?? null,
          automaticScore: decimalNumber(
            answer.programmingAttempts[0]?.score ?? null,
          ),
        },
        afterData: {
          answerId: answer.id,
          score: input.score,
          reason: input.feedback,
        },
        context: auditContext,
      });
    }
    await appendAssessmentLearningEventsAndProjectEvidence(transaction, [
      answer.id,
    ]);
  }, "评分状态已发生变化，请刷新后重试");

  return getTeacherSubmissionForGrading(teacherId, assignmentId, submissionId);
}

export async function completeSubmissionGrading(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
  auditContext: AuditRequestContext,
): Promise<TeacherSubmissionDetail> {
  await runAssignmentSerializable(async (transaction) => {
    const submission = await transaction.submission.findFirst({
      where: {
        id: submissionId,
        assignmentId,
        assignment: { teacherId },
        status: { in: submittedStatuses },
      },
      include: gradingDetailInclude,
    });
    if (!submission) throw new ResourceNotFoundError("提交记录不存在");
    await assertGradingWritable(
      transaction,
      teacherId,
      assignmentId,
      submission.studentId,
      submissionId,
    );
    if (
      submission.status === SubmissionStatus.GRADED ||
      submission.status === SubmissionStatus.PUBLISHED
    ) {
      return;
    }
    if (submission.status !== SubmissionStatus.PENDING_REVIEW) {
      throw new AssignmentOperationError("当前提交尚未进入人工批改状态");
    }

    const answers = new Map(
      submission.answers.map((answer) => [answer.assignmentQuestionId, answer]),
    );
    let totalScore = new Prisma.Decimal(0);
    const now = new Date();
    const answerIds: string[] = [];

    for (const question of submission.assignment.questions) {
      const answer = answers.get(question.id);
      if (question.typeSnapshot === QuestionType.SHORT_ANSWER) {
        if (
          !answer ||
          answer.gradingStatus !== GradingStatus.GRADED ||
          answer.score === null ||
          answer.score.lt(0) ||
          answer.score.gt(question.points)
        ) {
          throw new AssignmentOperationError(
            `第 ${question.sortOrder} 题尚未完成有效人工评分`,
          );
        }
        totalScore = totalScore.add(answer.score);
        if (answer.score.lt(question.points)) {
          await transaction.wrongQuestion.upsert({
            where: { studentAnswerId: answer.id },
            update: { isResolved: false, resolvedAt: null },
            create: {
              studentId: submission.studentId,
              studentAnswerId: answer.id,
              assignmentQuestionId: question.id,
            },
          });
        } else {
          await transaction.wrongQuestion.deleteMany({
            where: { studentAnswerId: answer.id },
          });
        }
        answerIds.push(answer.id);
        continue;
      }

      if (question.typeSnapshot === QuestionType.PYTHON_PROGRAMMING) {
        const latestAttempt = answer?.programmingAttempts[0];
        if (
          !answer ||
          !latestAttempt ||
          latestAttempt.status !== "SUCCEEDED" ||
          (answer.gradingStatus !== GradingStatus.AUTO_GRADED &&
            answer.gradingStatus !== GradingStatus.GRADED) ||
          answer.score === null ||
          answer.score.lt(0) ||
          answer.score.gt(question.points)
        ) {
          throw new AssignmentOperationError(
            `第 ${question.sortOrder} 题尚未完成有效的 Python 判题`,
          );
        }
        totalScore = totalScore.add(answer.score);
        if (answer.score.lt(question.points)) {
          await transaction.wrongQuestion.upsert({
            where: { studentAnswerId: answer.id },
            update: { isResolved: false, resolvedAt: null },
            create: {
              studentId: submission.studentId,
              studentAnswerId: answer.id,
              assignmentQuestionId: question.id,
            },
          });
        } else {
          await transaction.wrongQuestion.deleteMany({
            where: { studentAnswerId: answer.id },
          });
        }
        answerIds.push(answer.id);
        continue;
      }

      const result = gradeAnswer(
        {
          type: question.typeSnapshot,
          points: question.points.toNumber(),
          correctBoolean: question.correctBooleanSnapshot,
          acceptableAnswers: question.acceptableAnswersSnapshot,
          isCaseSensitive: question.isCaseSensitiveSnapshot,
          options: question.optionSnapshots.map((option) => ({
            id: option.id,
            isCorrect: option.isCorrectSnapshot,
          })),
        },
        savedAnswerInput(
          { id: question.id, type: question.typeSnapshot },
          answer,
        ),
      );
      const score = new Prisma.Decimal(result.score ?? 0);
      totalScore = totalScore.add(score);
      const persisted = await transaction.studentAnswer.upsert({
        where: {
          submissionId_assignmentQuestionId: {
            submissionId,
            assignmentQuestionId: question.id,
          },
        },
        update: {
          graderId: null,
          gradingStatus: GradingStatus.AUTO_GRADED,
          score,
          maxScore: question.points,
          isCorrect: result.isCorrect,
          teacherFeedback: null,
          gradedAt: now,
        },
        create: {
          submissionId,
          assignmentQuestionId: question.id,
          gradingStatus: GradingStatus.AUTO_GRADED,
          score,
          maxScore: question.points,
          isCorrect: result.isCorrect,
          gradedAt: now,
        },
        select: { id: true },
      });
      answerIds.push(persisted.id);
    }

    if (totalScore.gt(submission.assignment.totalPoints)) {
      throw new AssignmentOperationError("提交总分不能超过作业总分");
    }
    const percentage = submission.assignment.totalPoints.gt(0)
      ? totalScore
          .div(submission.assignment.totalPoints)
          .mul(100)
          .toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const updated = await transaction.submission.updateMany({
      where: {
        id: submissionId,
        assignmentId,
        status: SubmissionStatus.PENDING_REVIEW,
      },
      data: {
        status: SubmissionStatus.GRADED,
        score: totalScore,
        maxScore: submission.assignment.totalPoints,
        percentage,
        gradedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new AssignmentOperationError(
        "提交批改状态已发生变化，请刷新后重试",
      );
    }
    await appendAssessmentLearningEventsAndProjectEvidence(
      transaction,
      answerIds,
    );
    await writeTeachingAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.SUBMISSION_GRADING_COMPLETED,
      targetType: AuditTargetType.SUBMISSION,
      targetId: submissionId,
      summary: `完成“${submission.assignment.title}”第 ${submission.attemptNumber} 次提交的人工批改`,
      beforeData: {
        status: submission.status,
        score: decimalNumber(submission.score),
      },
      afterData: {
        status: SubmissionStatus.GRADED,
        score: totalScore.toNumber(),
        maxScore: submission.assignment.totalPoints.toNumber(),
        percentage: percentage.toNumber(),
      },
      context: auditContext,
    });
  }, "批改并发冲突，请稍后重试");

  return getTeacherSubmissionForGrading(teacherId, assignmentId, submissionId);
}

interface PublishTransactionResult extends PublishAssignmentResultsResult {
  notifications: Array<{
    recipientId: string;
    submissionId: string;
    assignmentTitle: string;
  }>;
}

export async function publishAssignmentResults(
  teacherId: string,
  assignmentId: string,
  auditContext: AuditRequestContext,
  automaticExamRevision?: string,
): Promise<PublishAssignmentResultsResult> {
  const result = await runAssignmentSerializable<PublishTransactionResult>(
    async (transaction) => {
      const lifecycle = await lockAssignmentLifecycle(
        transaction,
        assignmentId,
        teacherId,
      );
      if (lifecycle.examSessionId) {
        const exam = await transaction.examSession.findUnique({
          where: { id: lifecycle.examSessionId },
          select: {
            endsAt: true,
            cancelledAt: true,
            teacher: { select: { status: true } },
          },
        });
        const policy = await transaction.examResultPublication.findUnique({
          where: { assignmentId },
        });
        const now = new Date();
        if (!exam || exam.cancelledAt || exam.endsAt > now)
          throw new AssignmentOperationError("考试结束后才能公布成绩", 409);
        if (automaticExamRevision) {
          if (
            !policy ||
            exam.teacher.status !== "ACTIVE" ||
            policy.completedAt ||
            policy.revision !== automaticExamRevision ||
            (policy.scheduledAt && policy.scheduledAt > now)
          )
            throw new AssignmentOperationError(
              "考试公布计划已变化或未到公布时间",
              409,
            );
        } else if (policy && !policy.completedAt) {
          throw new AssignmentOperationError(
            "当前班级已启用自动公布，请先在考试监考页切换为手动公布",
            409,
          );
        }
        const collecting = await transaction.submission.findFirst({
          where: {
            assignmentId,
            status: "IN_PROGRESS",
            student: {
              classMemberships: {
                some: { classroomId: lifecycle.classroom.id, status: "ACTIVE" },
              },
            },
          },
          select: { id: true },
        });
        if (collecting)
          throw new AssignmentOperationError(
            "仍有考试答卷待收卷，请稍后再公布",
            409,
          );
      } else if (automaticExamRevision) {
        throw new ResourceNotFoundError("考试不存在");
      }
      const capability = assignmentCapabilities({
        ...lifecycle,
        activeMakeupCount: await countUsableGrants(transaction, assignmentId),
      });
      if (!capability.canPublishResults)
        throw new AssignmentOperationError(
          capability.publicationBlockedReason ?? "当前状态不能公布成绩",
          409,
        );
      await touchAssignmentLifecycle(transaction, assignmentId);
      const assignment = await transaction.assignment.findFirst({
        where: { id: assignmentId, teacherId, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          classroom: {
            select: {
              memberships: {
                where: { status: "ACTIVE" },
                select: { studentId: true },
              },
            },
          },
          submissions: {
            where: { status: { in: submittedStatuses } },
            select: {
              id: true,
              studentId: true,
              attemptNumber: true,
              submittedAt: true,
              status: true,
              score: true,
              maxScore: true,
              gradedAt: true,
              publishedAt: true,
              answers: {
                where: {
                  gradingStatus: GradingStatus.MANUAL_REVIEW_REQUIRED,
                },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!assignment) throw new ResourceNotFoundError("作业不存在");
      if (!["PUBLISHED", "CLOSED"].includes(assignment.status))
        throw new AssignmentOperationError("仅已发布作业可以公布成绩", 409);
      const members = new Set(
        assignment.classroom.memberships.map((member) => member.studentId),
      );
      const latest = latestEffectiveSubmissions(
        assignment.submissions.filter((item) => members.has(item.studentId)),
      );
      if (latest.length === 0) {
        throw new AssignmentOperationError("当前作业暂无可发布的提交");
      }
      const unfinished = latest.filter(
        (submission) =>
          submission.status === SubmissionStatus.SUBMITTED ||
          submission.status === SubmissionStatus.PENDING_REVIEW ||
          submission.answers.length > 0,
      );
      if (unfinished.length > 0) {
        throw new AssignmentOperationError(
          `仍有 ${unfinished.length} 份提交未完成全部人工批改`,
        );
      }
      const invalidGraded = latest.filter(
        (submission) =>
          submission.status === SubmissionStatus.GRADED &&
          (submission.score === null ||
            submission.maxScore === null ||
            submission.gradedAt === null),
      );
      if (invalidGraded.length > 0) {
        throw new AssignmentOperationError(
          "部分提交缺少完整批改结果，不能发布",
        );
      }

      const alreadyPublished = latest.filter(
        (submission) => submission.status === SubmissionStatus.PUBLISHED,
      );
      const publishable = latest.filter(
        (submission) => submission.status === SubmissionStatus.GRADED,
      );
      if (publishable.length === 0) {
        return {
          assignmentId,
          status: "PUBLISHED",
          publishedCount: 0,
          alreadyPublishedCount: alreadyPublished.length,
          publishedAt:
            alreadyPublished
              .map((submission) => submission.publishedAt)
              .filter((value): value is Date => value !== null)
              .sort((left, right) => right.getTime() - left.getTime())[0] ??
            null,
          notifications: [],
        };
      }

      const now = new Date();
      const updated = await transaction.submission.updateMany({
        where: {
          assignmentId,
          id: { in: publishable.map((submission) => submission.id) },
          status: SubmissionStatus.GRADED,
        },
        data: {
          status: SubmissionStatus.PUBLISHED,
          publishedAt: now,
        },
      });
      if (updated.count !== publishable.length) {
        throw new AssignmentOperationError(
          "成绩发布状态已发生变化，请刷新后重试",
        );
      }
      if (automaticExamRevision) {
        await transaction.examResultPublication.update({
          where: { assignmentId, revision: automaticExamRevision },
          data: { completedAt: now },
        });
      }
      await writeTeachingAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ASSIGNMENT_RESULTS_PUBLISHED,
        targetType: AuditTargetType.ASSIGNMENT,
        targetId: assignmentId,
        summary: `正式公布${lifecycle.examSessionId ? "考试" : "作业"}“${assignment.title}”的 ${updated.count} 份成绩`,
        beforeData: {
          gradedCount: publishable.length,
          publishedCount: alreadyPublished.length,
        },
        afterData: {
          newlyPublishedCount: updated.count,
          publishedCount: alreadyPublished.length + updated.count,
          publishedAt: now.toISOString(),
        },
        context: auditContext,
      });

      return {
        assignmentId,
        status: "PUBLISHED",
        publishedCount: updated.count,
        alreadyPublishedCount: alreadyPublished.length,
        publishedAt: now,
        notifications: publishable.map((submission) => ({
          recipientId: submission.studentId,
          submissionId: submission.id,
          assignmentTitle: assignment.title,
        })),
      };
    },
    "成绩发布状态已发生变化，请刷新后重试",
  );

  for (const notification of result.notifications) {
    try {
      await notifyAssignmentGraded(notification);
    } catch {
      logNotificationFailure("assignment_graded", notification.submissionId);
    }
  }
  return {
    assignmentId: result.assignmentId,
    status: result.status,
    publishedCount: result.publishedCount,
    alreadyPublishedCount: result.alreadyPublishedCount,
    publishedAt: result.publishedAt,
  };
}

export async function getAssignmentPublicationState(
  teacherId: string,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId, deletedAt: null },
    select: {
      status: true,
      publishedAt: true,
      dueAt: true,
      examSession: { select: { endsAt: true, cancelledAt: true } },
      examPublication: { select: { completedAt: true } },
      classroom: {
        select: {
          status: true,
          memberships: {
            where: { status: "ACTIVE" },
            select: { studentId: true },
          },
        },
      },
      submissions: {
        where: { status: { in: submittedStatuses } },
        select: {
          id: true,
          studentId: true,
          attemptNumber: true,
          submittedAt: true,
          status: true,
          score: true,
          maxScore: true,
          gradedAt: true,
          _count: {
            select: {
              answers: { where: { gradingStatus: "MANUAL_REVIEW_REQUIRED" } },
            },
          },
        },
      },
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  const members = new Set(
    assignment.classroom.memberships.map((item) => item.studentId),
  );
  const exam = assignment.examSession;
  const examWaiting = exam && !exam.cancelledAt && exam.endsAt > new Date();
  const examCollecting =
    exam &&
    !examWaiting &&
    !exam.cancelledAt &&
    (await prisma.submission.count({
      where: {
        assignmentId,
        status: "IN_PROGRESS",
        studentId: { in: [...members] },
      },
    }));
  const examBlock = exam?.cancelledAt
    ? "已取消的考试不能公布成绩"
    : examWaiting
      ? "考试结束后才能公布成绩"
      : examCollecting
        ? "仍有考试答卷待收卷"
        : assignment.examPublication && !assignment.examPublication.completedAt
          ? "该班已启用自动公布，可在考试监考页调整"
          : null;
  const latest = latestEffectiveSubmissions(
    assignment.submissions.filter((item) => members.has(item.studentId)),
  );
  const pendingCount = latest.filter(
    (item) =>
      item.status === "SUBMITTED" ||
      item.status === "PENDING_REVIEW" ||
      item._count.answers > 0 ||
      (item.status === "GRADED" &&
        (item.score === null ||
          item.maxScore === null ||
          item.gradedAt === null)),
  ).length;
  const grantWindow = await usableGrantWindow(prisma, assignmentId);
  const capability = assignmentCapabilities({
    ...assignment,
    activeMakeupCount: grantWindow.count,
  });
  const deadlines = examWaiting
    ? [exam.endsAt]
    : assignment.classroom.status === "ACTIVE"
      ? [assignment.dueAt, grantWindow.nextAt].filter(
          (date): date is Date => date !== null && date > new Date(),
        )
      : [];
  const refreshAt = deadlines.length
    ? new Date(Math.min(...deadlines.map((date) => date.getTime())))
    : null;
  const availableAt =
    assignment.classroom.status === "ACTIVE" &&
    !capability.gradingBlockedReason &&
    refreshAt
      ? new Date(
          Math.max(
            assignment.dueAt?.getTime() ?? 0,
            grantWindow.lastAt?.getTime() ?? 0,
          ),
        )
      : null;
  const gradedCount = latest.filter((item) => item.status === "GRADED").length;
  const blockedReason =
    examBlock ??
    capability.publicationBlockedReason ??
    (pendingCount
      ? `还有 ${pendingCount} 份最新提交未完成批改`
      : !gradedCount
        ? latest.length
          ? "成绩已全部公布"
          : "暂无可公布成绩"
        : null);
  return {
    ...(refreshAt ? { refreshAt } : {}),
    ...(availableAt ? { availableAt } : {}),
    blockedReason,
    pendingCount,
    gradedCount: latest.filter((item) => item.status === "GRADED").length,
    publishedCount: latest.filter((item) => item.status === "PUBLISHED").length,
    canPublish:
      !examBlock &&
      capability.canPublishResults &&
      pendingCount === 0 &&
      latest.some((item) => item.status === "GRADED"),
  };
}
