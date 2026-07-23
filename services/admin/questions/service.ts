import "server-only";

import {
  AuditAction,
  AuditTargetType,
  QuestionStatus,
  QuestionVisibility,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { GovernanceOperationError } from "@/services/admin/governance-errors";
import { assertQuestionVisibilityCanChange } from "@/services/admin/questions/policy";
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
    visibility: record.visibility,
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

export async function setAdminQuestionVisibility(
  actorId: string,
  questionId: string,
  visibility: QuestionVisibility,
  context: AuditRequestContext,
): Promise<AdminQuestionView> {
  await prisma.$transaction(async (transaction) => {
    const before = await findAdminQuestionById(questionId, transaction);
    if (!before) throw new ResourceNotFoundError("题目不存在");
    assertQuestionVisibilityCanChange({
      currentVisibility: before.visibility,
      nextVisibility: visibility,
      status: before.status,
      knowledgePointCount: before.knowledgePointLinks.length,
    });
    await transaction.question.update({
      where: { id: questionId },
      data: { visibility },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId,
      action:
        visibility === QuestionVisibility.PUBLIC
          ? AuditAction.QUESTION_MADE_PUBLIC
          : AuditAction.QUESTION_MADE_PRIVATE,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `${visibility === QuestionVisibility.PUBLIC ? "设为公共题目" : "撤销公共状态"}：${before.title}`,
      beforeData: {
        visibility: before.visibility,
        status: before.status,
        assignmentReferenceCount: before._count.assignmentQuestions,
      },
      afterData: {
        visibility,
        status: before.status,
        assignmentReferenceCount: before._count.assignmentQuestions,
      },
      context,
    });
  });
  return getAdminQuestion(questionId);
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
        visibility: before.visibility,
        status: before.status,
        assignmentReferenceCount: before._count.assignmentQuestions,
      },
      afterData: {
        visibility: before.visibility,
        status: QuestionStatus.INACTIVE,
        assignmentReferenceCount: before._count.assignmentQuestions,
      },
      context,
    });
  });
  return getAdminQuestion(questionId);
}
