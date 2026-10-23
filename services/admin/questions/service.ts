import "server-only";

import { AuditAction, AuditTargetType, QuestionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { GovernanceOperationError } from "@/services/admin/governance-errors";
import {
  findAdminQuestionById,
  loadAdminQuestionPage,
  loadQuestionCreatorOptions,
  type AdminQuestionRecord,
} from "@/services/admin/questions/repository";
import type { AdminQuestionListQuery } from "@/services/admin/questions/schemas";
import type {
  AdminQuestionCreatorOption,
  AdminQuestionListResult,
  AdminQuestionView,
} from "@/services/admin/questions/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";

function toView(record: AdminQuestionRecord): AdminQuestionView {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    type: record.type,
    difficulty: record.difficulty,
    explanation: record.explanation,
    correctBoolean: record.correctBoolean,
    referenceAnswer: record.referenceAnswer,
    acceptableAnswers: record.acceptableAnswers,
    isCaseSensitive: record.isCaseSensitive,
    status: record.status,
    questionCategoryId: record.questionCategoryId,
    questionCategoryName: record.questionCategory?.name ?? null,
    archivedFromStatus: record.archivedFromStatus,
    tags: record.tags,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    creator: {
      id: record.creator.id,
      displayName: record.creator.profile?.displayName ?? record.creator.email,
      email: record.creator.email,
      role: record.creator.role,
    },
    source: record.creator.role === "ADMIN" ? "ADMIN" : "TEACHER_HISTORY",
    knowledgePoints: record.knowledgePointLinks.map(
      ({ knowledgePoint }) => knowledgePoint,
    ),
    options: record.options,
    assignmentReferenceCount: record._count.assignmentQuestions,
  };
}

export async function listAdminQuestions(
  query: AdminQuestionListQuery,
): Promise<AdminQuestionListResult> {
  const { total, records } = await loadAdminQuestionPage(query);
  return {
    items: records.map(toView),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getAdminQuestion(
  questionId: string,
): Promise<AdminQuestionView> {
  const question = await findAdminQuestionById(questionId);
  if (!question) throw new ResourceNotFoundError("题目不存在");
  return toView(question);
}

export async function listAdminQuestionCreators(): Promise<
  AdminQuestionCreatorOption[]
> {
  return (await loadQuestionCreatorOptions()).map((creator) => ({
    id: creator.id,
    displayName: creator.profile?.displayName ?? creator.email,
    email: creator.email,
    role: creator.role,
  }));
}

export async function disableAdminQuestion(
  actorId: string,
  questionId: string,
  context: AuditRequestContext,
): Promise<AdminQuestionView> {
  await prisma.$transaction(async (transaction) => {
    const before = await findAdminQuestionById(questionId, transaction);
    if (!before) throw new ResourceNotFoundError("题目不存在");
    if (before.status !== QuestionStatus.ACTIVE) {
      throw new GovernanceOperationError("只有正常状态的题目可以停用");
    }
    await transaction.question.update({
      where: { id: questionId },
      data: { status: QuestionStatus.INACTIVE },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId,
      action: AuditAction.QUESTION_DISABLED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `停用题目：${before.title}`,
      beforeData: {
        status: before.status,
        assignmentReferenceCount: before._count.assignmentQuestions,
      },
      afterData: {
        status: QuestionStatus.INACTIVE,
        assignmentReferenceCount: before._count.assignmentQuestions,
      },
      context,
    });
  });
  return getAdminQuestion(questionId);
}

export async function restoreAdminQuestion(
  actorId: string,
  questionId: string,
  context: AuditRequestContext,
): Promise<AdminQuestionView> {
  await prisma.$transaction(async (transaction) => {
    const before = await findAdminQuestionById(questionId, transaction);
    if (!before) throw new ResourceNotFoundError("题目不存在");
    if (
      before.status !== QuestionStatus.ARCHIVED ||
      !before.archivedFromStatus
    ) {
      throw new GovernanceOperationError("该题目当前不处于可恢复的归档状态");
    }
    await transaction.question.update({
      where: { id: questionId },
      data: {
        status: before.archivedFromStatus,
        archivedFromStatus: null,
        revision: { increment: 1 },
      },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId,
      action: AuditAction.QUESTION_RESTORED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `恢复共享题目：${before.title}`,
      beforeData: {
        status: before.status,
        restoredStatus: before.archivedFromStatus,
        questionCategoryId: before.questionCategoryId,
      },
      afterData: {
        status: before.archivedFromStatus,
        questionCategoryId: before.questionCategoryId,
      },
      context,
    });
  });
  return getAdminQuestion(questionId);
}
