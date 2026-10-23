import { AuditAction, AuditTargetType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { GovernanceOperationError } from "@/services/admin/governance-errors";
import type {
  QuestionCourseCategoryInput,
  QuestionCourseCategoryUpdate,
} from "./schemas";

const categorySelect = {
  id: true,
  name: true,
  normalizedName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { courses: true, questions: true } },
} satisfies Prisma.QuestionCourseCategorySelect;

function normalizedName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("zh-CN");
}

export function listQuestionCourseCategories(activeOnly = true) {
  return prisma.questionCourseCategory.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: categorySelect,
  });
}

export async function requireActiveQuestionCourseCategory(
  categoryId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const category = await client.questionCourseCategory.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true, name: true },
  });
  if (!category) {
    throw new GovernanceOperationError("课程分类不存在或已停用", 400);
  }
  return category;
}

export async function createQuestionCourseCategory(
  actorId: string,
  input: QuestionCourseCategoryInput,
  context: AuditRequestContext,
) {
  try {
    const category = await prisma.$transaction(async (transaction) => {
      const created = await transaction.questionCourseCategory.create({
        data: {
          name: input.name,
          normalizedName: normalizedName(input.name),
        },
        select: categorySelect,
      });
      await writeGovernanceAuditLog(transaction, {
        actorId,
        action: AuditAction.QUESTION_COURSE_CATEGORY_CREATED,
        targetType: AuditTargetType.QUESTION_COURSE_CATEGORY,
        targetId: created.id,
        summary: `创建题库课程分类：${created.name}`,
        beforeData: null,
        afterData: { name: created.name, isActive: created.isActive },
        context,
      });
      return created;
    });
    return category;
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GovernanceOperationError("同名课程分类已存在", 409);
    }
    throw error;
  }
}

export async function updateQuestionCourseCategory(
  actorId: string,
  categoryId: string,
  input: QuestionCourseCategoryUpdate,
  context: AuditRequestContext,
) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.questionCourseCategory.findUnique({
        where: { id: categoryId },
        select: categorySelect,
      });
      if (!before) throw new ResourceNotFoundError("课程分类不存在");

      if (input.isActive === false && before.isActive) {
        const [courseCount, questionCount] = await Promise.all([
          transaction.course.count({
            where: { questionCategoryId: categoryId },
          }),
          transaction.question.count({
            where: { questionCategoryId: categoryId, deletedAt: null },
          }),
        ]);
        if (courseCount || questionCount) {
          throw new GovernanceOperationError(
            "该分类仍被开课或题目使用，请先迁移关联后再停用",
            409,
          );
        }
      }

      const after = await transaction.questionCourseCategory.update({
        where: { id: categoryId },
        data: {
          name: input.name,
          normalizedName: normalizedName(input.name),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        select: categorySelect,
      });
      await writeGovernanceAuditLog(transaction, {
        actorId,
        action:
          input.isActive === false
            ? AuditAction.QUESTION_COURSE_CATEGORY_DISABLED
            : AuditAction.QUESTION_COURSE_CATEGORY_UPDATED,
        targetType: AuditTargetType.QUESTION_COURSE_CATEGORY,
        targetId: categoryId,
        summary: `更新题库课程分类：${after.name}`,
        beforeData: { name: before.name, isActive: before.isActive },
        afterData: { name: after.name, isActive: after.isActive },
        context,
      });
      return after;
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GovernanceOperationError("同名课程分类已存在", 409);
    }
    throw error;
  }
}
