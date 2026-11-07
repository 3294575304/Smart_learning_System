import type { Prisma, PrismaClient } from "@prisma/client";

export const testQuestionCategoryRelation = {
  connectOrCreate: {
    where: {
      schoolId_normalizedName: {
        schoolId: null,
        normalizedName: "automated-test-category",
      },
    },
    create: {
      name: "自动化测试课程分类",
      normalizedName: "automated-test-category",
    },
  },
} satisfies Prisma.QuestionCourseCategoryCreateNestedOneWithoutCoursesInput;

export async function ensureTestQuestionCategory(client: PrismaClient) {
  const existing = await client.questionCourseCategory.findFirst({
    where: { schoolId: null, normalizedName: "automated-test-category" },
    select: { id: true },
  });
  if (existing) {
    return client.questionCourseCategory.update({
      where: { id: existing.id },
      data: { isActive: true },
      select: { id: true },
    });
  }
  return client.questionCourseCategory.create({
    data: {
      name: "自动化测试课程分类",
      normalizedName: "automated-test-category",
    },
    select: { id: true },
  });
}
