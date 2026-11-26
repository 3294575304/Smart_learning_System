import {
  AuditAction,
  AuditTargetType,
  CourseStatus,
  Prisma,
} from "@prisma/client";

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
  courseNo: true,
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
    orderBy: [{ name: "asc" }, { courseNo: "asc" }, { id: "asc" }],
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
      courseNo: true,
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

async function assertCourseNoAvailable(
  client: Prisma.TransactionClient,
  schoolId: string,
  courseNo: string,
  excludeCategoryId?: string,
) {
  const duplicate = await client.questionCourseCategory.findFirst({
    where: {
      schoolId,
      courseNo,
      ...(excludeCategoryId ? { id: { not: excludeCategoryId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new GovernanceOperationError(
      `该课程号已被其他课程分类使用：${courseNo}`,
      409,
    );
  }
}

export async function createQuestionCourseCategory(
  actorId: string,
  input: QuestionCourseCategoryInput,
  context: AuditRequestContext,
) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const schoolId = await requireUserSchoolId(actorId, transaction);
      await assertCourseNoAvailable(transaction, schoolId, input.courseNo);

      const created = await transaction.questionCourseCategory.create({
        data: {
          schoolId,
          name: input.name,
          courseNo: input.courseNo,
          normalizedName: normalizedName(input.name),
        },
        select: categorySelect,
      });
      await writeGovernanceAuditLog(transaction, {
        actorId,
        action: AuditAction.QUESTION_COURSE_CATEGORY_CREATED,
        targetType: AuditTargetType.QUESTION_COURSE_CATEGORY,
        targetId: created.id,
        summary: `创建课程分类：${created.name}（课程号 ${created.courseNo}）`,
        beforeData: null,
        afterData: {
          name: created.name,
          courseNo: created.courseNo,
          isActive: created.isActive,
        },
        context,
      });
      return created;
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      throw new GovernanceOperationError(
        target.includes("courseNo")
          ? "该课程号已被其他课程分类使用"
          : "同名课程分类已存在",
        409,
      );
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

      // 串行化「改课程号 + 级联同步」与并发建课、并发修改。
      // Postgres 对 Course 插入的外键检查会取 FOR KEY SHARE，与 FOR UPDATE 互斥。
      await transaction.$queryRaw`
        SELECT "id" FROM "QuestionCourseCategory"
        WHERE "id" = ${categoryId} AND "schoolId" = ${schoolId}
        FOR UPDATE
      `;

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

      const nextCourseNo =
        input.courseNo === undefined ? before.courseNo : input.courseNo;
      const courseNoChanged = nextCourseNo !== before.courseNo;

      if (courseNoChanged && nextCourseNo === null) {
        const activeCourseCount = await transaction.course.count({
          where: {
            questionCategoryId: categoryId,
            status: { not: CourseStatus.ARCHIVED },
          },
        });
        if (activeCourseCount > 0) {
          throw new GovernanceOperationError(
            "该分类下仍有开课课程，不能清空课程号",
            409,
          );
        }
      }

      if (courseNoChanged && nextCourseNo) {
        await assertCourseNoAvailable(
          transaction,
          schoolId,
          nextCourseNo,
          categoryId,
        );

        const targetCourseNo = nextCourseNo;
        const affected = await transaction.course.findMany({
          where: {
            questionCategoryId: categoryId,
            status: { not: CourseStatus.ARCHIVED },
          },
          select: {
            id: true,
            teacherId: true,
            term: true,
            name: true,
            courseNo: true,
          },
        });

        if (affected.length) {
          // 集合内冲突：同一教师同一学期出现多门该分类课程时，
          // 统一为一个课程号会撞 Course_active_teacherId_courseNo_term_key。
          const termGroups = new Map<string, number>();
          for (const course of affected) {
            const key = `${course.teacherId}\u0000${course.term}`;
            termGroups.set(key, (termGroups.get(key) ?? 0) + 1);
          }
          if ([...termGroups.values()].some((count) => count > 1)) {
            throw new GovernanceOperationError(
              "同一教师在同一学期下已有多门该分类课程，无法统一为一个课程号，请先归档或合并重复课程",
              409,
            );
          }

          // 集合外冲突：另一门非归档课程已占用目标课程号。
          const conflict = await transaction.course.findFirst({
            where: {
              id: { notIn: affected.map((course) => course.id) },
              status: { not: CourseStatus.ARCHIVED },
              courseNo: targetCourseNo,
              OR: affected.map((course) => ({
                teacherId: course.teacherId,
                term: course.term,
              })),
            },
            select: { name: true, term: true },
          });
          if (conflict) {
            throw new GovernanceOperationError(
              `无法同步课程号：课程「${conflict.name}」（${conflict.term}）已存在课程号 ${targetCourseNo}，请先处理该冲突。`,
              409,
            );
          }

          const synced = affected
            .filter((course) => course.courseNo !== targetCourseNo)
            .map((course) => ({
              id: course.id,
              from: course.courseNo,
              to: targetCourseNo,
            }));

          if (synced.length) {
            await transaction.course.updateMany({
              where: {
                questionCategoryId: categoryId,
                status: { not: CourseStatus.ARCHIVED },
              },
              data: { courseNo: targetCourseNo },
            });
          }
        }
      }

      const affectedCourses =
        courseNoChanged && nextCourseNo
          ? await transaction.course.findMany({
              where: {
                questionCategoryId: categoryId,
                status: { not: CourseStatus.ARCHIVED },
                courseNo: nextCourseNo,
              },
              select: { id: true },
            })
          : [];

      const after = await transaction.questionCourseCategory.update({
        where: { id: categoryId },
        data: {
          name: input.name,
          normalizedName: normalizedName(input.name),
          ...(input.courseNo === undefined ? {} : { courseNo: input.courseNo }),
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
        summary: courseNoChanged
          ? `更新课程分类：${after.name}（课程号 ${before.courseNo ?? "未设置"} → ${after.courseNo ?? "未设置"}）`
          : `更新课程分类：${after.name}`,
        beforeData: {
          name: before.name,
          courseNo: before.courseNo,
          isActive: before.isActive,
        },
        afterData: {
          name: after.name,
          courseNo: after.courseNo,
          isActive: after.isActive,
          syncedCourseCount: affectedCourses.length,
          syncedCourseIds: affectedCourses.slice(0, 50).map((item) => item.id),
        },
        context,
      });
      return after;
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      throw new GovernanceOperationError(
        target.includes("courseNo")
          ? "同步课程号失败，存在同教师同学期的同号课程，请重试"
          : "同名课程分类已存在",
        409,
      );
    }
    throw error;
  }
}

export interface BulkCategoryResult {
  created: Prisma.QuestionCourseCategoryGetPayload<{
    select: typeof categorySelect;
  }>[];
  backfilled: Array<{ id: string; name: string; courseNo: string }>;
  skipped: Array<{
    name: string;
    courseNo: string | null;
    reason:
      | "EXISTS"
      | "DUPLICATE"
      | "COURSE_NO_TAKEN"
      | "NOT_FOUND"
      | "ALREADY_HAS_COURSE_NO";
  }>;
}

type BulkCategoryRecord = {
  id: string;
  name: string;
  normalizedName: string;
  courseNo: string | null;
};

/**
 * 一键添加/补全课程分类：同一个事务内按「名称 + 课程号」去重，
 * 新分类必须有课程号；已有同名分类缺课程号时按显式 categoryId 回填。
 */
export async function createQuestionCourseCategoriesInBulk(
  actorId: string,
  input: CourseCategoryBulkInput,
  context: AuditRequestContext,
): Promise<BulkCategoryResult> {
  const unique: Array<{
    name: string;
    courseNo: string;
    categoryId?: string;
  }> = [];
  const duplicates: BulkCategoryResult["skipped"] = [];
  const seen = new Set<string>();
  for (const raw of input.items) {
    const name = raw.name.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (!name) continue;
    const key = `${normalizedName(name)}\u0000${raw.courseNo}`;
    if (seen.has(key)) {
      duplicates.push({
        name,
        courseNo: raw.courseNo,
        reason: "DUPLICATE",
      });
      continue;
    }
    seen.add(key);
    unique.push({
      name,
      courseNo: raw.courseNo,
      categoryId: raw.categoryId,
    });
  }
  if (!unique.length) {
    throw new GovernanceOperationError("没有可添加的课程分类", 400);
  }

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const schoolId = await requireUserSchoolId(actorId, transaction);
        const existing = await transaction.questionCourseCategory.findMany({
          where: { schoolId },
          select: {
            id: true,
            name: true,
            normalizedName: true,
            courseNo: true,
          },
        });
        const byId = new Map<string, BulkCategoryRecord>(
          existing.map((item) => [item.id, item]),
        );
        const byName = new Map<string, BulkCategoryRecord>(
          existing.map((item) => [item.normalizedName, item]),
        );
        const byCourseNo = new Map<string, BulkCategoryRecord>(
          existing
            .filter(
              (item): item is BulkCategoryRecord & { courseNo: string } =>
                item.courseNo !== null,
            )
            .map((item) => [item.courseNo, item]),
        );

        const created: BulkCategoryResult["created"] = [];
        const backfilled: BulkCategoryResult["backfilled"] = [];
        const skipped: BulkCategoryResult["skipped"] = [...duplicates];

        for (const item of unique) {
          const nameKey = normalizedName(item.name);

          if (item.categoryId) {
            const target = byId.get(item.categoryId);
            if (!target) {
              skipped.push({
                name: item.name,
                courseNo: item.courseNo,
                reason: "NOT_FOUND",
              });
              continue;
            }
            if (target.courseNo) {
              skipped.push({
                name: target.name,
                courseNo: target.courseNo,
                reason:
                  target.courseNo === item.courseNo
                    ? "EXISTS"
                    : "ALREADY_HAS_COURSE_NO",
              });
              continue;
            }
            const taken = byCourseNo.get(item.courseNo);
            if (taken && taken.id !== target.id) {
              skipped.push({
                name: target.name,
                courseNo: item.courseNo,
                reason: "COURSE_NO_TAKEN",
              });
              continue;
            }

            const updated = await transaction.questionCourseCategory.update({
              where: { id: target.id },
              data: { courseNo: item.courseNo },
              select: categorySelect,
            });
            byId.set(updated.id, updated);
            byName.set(updated.normalizedName, updated);
            byCourseNo.set(item.courseNo, updated);
            backfilled.push({
              id: updated.id,
              name: updated.name,
              courseNo: item.courseNo,
            });
            await writeGovernanceAuditLog(transaction, {
              actorId,
              action: AuditAction.QUESTION_COURSE_CATEGORY_UPDATED,
              targetType: AuditTargetType.QUESTION_COURSE_CATEGORY,
              targetId: updated.id,
              summary: input.sourceFileName
                ? `批量回填课程号：${updated.name}（${item.courseNo}，来源：${input.sourceFileName}）`
                : `批量回填课程号：${updated.name}（${item.courseNo}）`,
              beforeData: { courseNo: null },
              afterData: {
                courseNo: item.courseNo,
                source: "IMPORT_BACKFILL",
                sourceFileName: input.sourceFileName ?? null,
                extractor: input.extractor ?? "RULE",
              },
              context,
            });
            continue;
          }

          const sameName = byName.get(nameKey);
          if (sameName) {
            skipped.push({
              name: item.name,
              courseNo: item.courseNo,
              reason: "EXISTS",
            });
            continue;
          }
          const taken = byCourseNo.get(item.courseNo);
          if (taken) {
            skipped.push({
              name: item.name,
              courseNo: item.courseNo,
              reason: "COURSE_NO_TAKEN",
            });
            continue;
          }

          const row = await transaction.questionCourseCategory.create({
            data: {
              schoolId,
              name: item.name,
              normalizedName: nameKey,
              courseNo: item.courseNo,
            },
            select: categorySelect,
          });
          byId.set(row.id, row);
          byName.set(row.normalizedName, row);
          byCourseNo.set(item.courseNo, row);
          created.push(row);
          await writeGovernanceAuditLog(transaction, {
            actorId,
            action: AuditAction.QUESTION_COURSE_CATEGORY_CREATED,
            targetType: AuditTargetType.QUESTION_COURSE_CATEGORY,
            targetId: row.id,
            summary: input.sourceFileName
              ? `批量导入创建课程分类：${row.name}（课程号 ${row.courseNo}，来源：${input.sourceFileName}）`
              : `批量导入创建课程分类：${row.name}（课程号 ${row.courseNo}）`,
            beforeData: null,
            afterData: {
              name: row.name,
              courseNo: row.courseNo,
              isActive: row.isActive,
              sourceFileName: input.sourceFileName ?? null,
              extractor: input.extractor ?? "RULE",
            },
            context,
          });
        }

        return { created, backfilled, skipped };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GovernanceOperationError(
        "存在同名课程分类或课程号已被占用，请刷新列表后重新确认",
        409,
      );
    }
    throw error;
  }
}
