import { AuditAction, AuditTargetType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { GovernanceOperationError } from "@/services/admin/governance-errors";
import { requireUserSchoolId } from "@/services/schools/tenant";
import type {
  QuestionCourseCategoryInput,
  QuestionCourseCategoryUpdate,
} from "./schemas";
import type { CourseCategoryBulkInput } from "./catalog-schemas";

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

export async function listQuestionCourseCategories(
  userId: string,
  activeOnly = true,
) {
  const schoolId = await requireUserSchoolId(userId);
  return prisma.questionCourseCategory.findMany({
    where: { schoolId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: categorySelect,
  });
}

export async function requireActiveQuestionCourseCategory(
  categoryId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const schoolId = await requireUserSchoolId(userId, client);
  const category = await client.questionCourseCategory.findFirst({
    where: { id: categoryId },
    select: {
      id: true,
      schoolId: true,
      name: true,
      normalizedName: true,
      isActive: true,
    },
  });
  if (!category || !category.isActive) {
    throw new GovernanceOperationError("课程分类不存在或已停用", 400);
  }
  if (category.schoolId !== schoolId) {
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
      const schoolId = await requireUserSchoolId(actorId, transaction);
      const created = await transaction.questionCourseCategory.create({
        data: {
          schoolId,
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
        summary: `创建课程分类：${created.name}`,
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
      const schoolId = await requireUserSchoolId(actorId, transaction);
      const before = await transaction.questionCourseCategory.findFirst({
        where: { id: categoryId, schoolId },
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
        summary: `更新课程分类：${after.name}`,
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

export interface BulkCategoryResult {
  created: Prisma.QuestionCourseCategoryGetPayload<{
    select: typeof categorySelect;
  }>[];
  skipped: Array<{ name: string; reason: "EXISTS" | "DUPLICATE" }>;
}

/**
 * 一键添加课程分类：同一事务内按 normalizedName 去重并跳过已有分类，
 * 每一门新建分类都写一条可追溯的治理审计记录。
 */
export async function createQuestionCourseCategoriesInBulk(
  actorId: string,
  input: CourseCategoryBulkInput,
  context: AuditRequestContext,
): Promise<BulkCategoryResult> {
  const unique: Array<{ name: string; key: string }> = [];
  const duplicates: BulkCategoryResult["skipped"] = [];
  const seen = new Set<string>();
  for (const raw of input.names) {
    const name = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (!name) continue;
    const key = normalizedName(name);
    if (seen.has(key)) {
      duplicates.push({ name, reason: "DUPLICATE" });
      continue;
    }
    seen.add(key);
    unique.push({ name, key });
  }
  if (!unique.length) {
    throw new GovernanceOperationError("没有可添加的课程分类", 400);
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const schoolId = await requireUserSchoolId(actorId, transaction);
      const existing = await transaction.questionCourseCategory.findMany({
        where: {
          schoolId,
          normalizedName: { in: unique.map((item) => item.key) },
        },
        select: { normalizedName: true },
      });
      const existingKeys = new Set(existing.map((item) => item.normalizedName));
      const created: BulkCategoryResult["created"] = [];
      const skipped: BulkCategoryResult["skipped"] = [...duplicates];
      for (const item of unique) {
        if (existingKeys.has(item.key)) {
          skipped.push({ name: item.name, reason: "EXISTS" });
          continue;
        }
        const row = await transaction.questionCourseCategory.create({
          data: { schoolId, name: item.name, normalizedName: item.key },
          select: categorySelect,
        });
        await writeGovernanceAuditLog(transaction, {
          actorId,
          action: AuditAction.QUESTION_COURSE_CATEGORY_CREATED,
          targetType: AuditTargetType.QUESTION_COURSE_CATEGORY,
          targetId: row.id,
          summary: input.sourceFileName
            ? `批量导入创建课程分类：${row.name}（来源：${input.sourceFileName}）`
            : `批量导入创建课程分类：${row.name}`,
          beforeData: null,
          afterData: {
            name: row.name,
            isActive: row.isActive,
            sourceFileName: input.sourceFileName ?? null,
            extractor: input.extractor ?? "RULE",
          },
          context,
        });
        created.push(row);
      }
      return { created, skipped };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GovernanceOperationError(
        "存在同名课程分类，请刷新列表后重新确认",
        409,
      );
    }
    throw error;
  }
}
