import "server-only";

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
      classroom: { select: { id: true, name: true } },
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
): TeacherSubmissionDetail {
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
          : decimalNumber(answer.score),
      manualScore:
        answer.assignmentQuestion.typeSnapshot === QuestionType.SHORT_ANSWER
          ? decimalNumber(answer.score)
          : null,
      isCorrect: answer.isCorrect,
      gradingStatus: answer.gradingStatus,
      teacherFeedback: answer.teacherFeedback,
      explanation: answer.assignmentQuestion.explanationSnapshot,
    })),
  };
}

async function runSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 1
      ) {
        throw error;
      }
    }
  }
  throw new AssignmentOperationError("批改并发冲突，请稍后重试");
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
    where: { id: assignmentId, teacherId },
    select: {
      id: true,
      title: true,
      totalPoints: true,
      classroom: { select: { name: true } },
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");

  const where: Prisma.SubmissionWhereInput = {
    assignmentId,
    status: query.status ?? { in: submittedStatuses },
  };
  const [total, submissions] = await prisma.$transaction([
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
            gradingStatus: true,
            assignmentQuestion: { select: { typeSnapshot: true } },
          },
        },
      },
    }),
  ]);

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      classroomName: assignment.classroom.name,
      totalPoints: assignment.totalPoints.toNumber(),
    },
    items: submissions.map((submission) => ({
      id: submission.id,
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
      objectiveScore: submission.answers.reduce(
        (sum, answer) =>
          answer.assignmentQuestion.typeSnapshot === QuestionType.SHORT_ANSWER
            ? sum
            : sum + (answer.score?.toNumber() ?? 0),
        0,
      ),
      currentScore: decimalNumber(submission.score),
      maxScore:
        decimalNumber(submission.maxScore) ?? assignment.totalPoints.toNumber(),
      requiresManualReview: submission.answers.some(
        (answer) =>
          answer.assignmentQuestion.typeSnapshot ===
            QuestionType.SHORT_ANSWER &&
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
  return detailFromRecord(
    await loadTeacherSubmission(teacherId, assignmentId, submissionId),
  );
}

export async function saveManualAnswerGrade(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
  answerId: string,
  input: ManualGradeAnswerData,
): Promise<TeacherSubmissionDetail> {
  await runSerializable(async (transaction) => {
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
        assignmentQuestion: {
          select: { typeSnapshot: true, points: true },
        },
        submission: { select: { status: true } },
      },
    });
    if (!answer) throw new ResourceNotFoundError("待批改答案不存在");
    if (answer.assignmentQuestion.typeSnapshot !== QuestionType.SHORT_ANSWER) {
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
  });

  return getTeacherSubmissionForGrading(teacherId, assignmentId, submissionId);
}

export async function completeSubmissionGrading(
  teacherId: string,
  assignmentId: string,
  submissionId: string,
  auditContext: AuditRequestContext,
): Promise<TeacherSubmissionDetail> {
  await runSerializable(async (transaction) => {
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
      await transaction.studentAnswer.upsert({
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
      });
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
  });

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
): Promise<PublishAssignmentResultsResult> {
  const result = await runSerializable<PublishTransactionResult>(
    async (transaction) => {
      const assignment = await transaction.assignment.findFirst({
        where: { id: assignmentId, teacherId },
        select: {
          id: true,
          title: true,
          submissions: {
            where: { status: { in: submittedStatuses } },
            select: {
              id: true,
              studentId: true,
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
      if (assignment.submissions.length === 0) {
        throw new AssignmentOperationError("当前作业暂无可发布的提交");
      }
      const unfinished = assignment.submissions.filter(
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
      const invalidGraded = assignment.submissions.filter(
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

      const alreadyPublished = assignment.submissions.filter(
        (submission) => submission.status === SubmissionStatus.PUBLISHED,
      );
      const publishable = assignment.submissions.filter(
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
      await writeTeachingAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ASSIGNMENT_RESULTS_PUBLISHED,
        targetType: AuditTargetType.ASSIGNMENT,
        targetId: assignmentId,
        summary: `正式发布作业“${assignment.title}”的 ${updated.count} 份成绩`,
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
