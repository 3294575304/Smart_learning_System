import type { Prisma, PrismaClient } from "@prisma/client";

export const testQuestionCategoryRelation = {
  connectOrCreate: {
    where: { normalizedName: "automated-test-category" },
    create: {
      name: "自动化测试课程分类",
      normalizedName: "automated-test-category",
    },
  },
} satisfies Prisma.QuestionCourseCategoryCreateNestedOneWithoutCoursesInput;

export async function ensureTestQuestionCategory(client: PrismaClient) {
  return client.questionCourseCategory.upsert({
    where: { normalizedName: "automated-test-category" },
    update: { isActive: true },
    create: {
      name: "自动化测试课程分类",
      normalizedName: "automated-test-category",
    },
    select: { id: true },
  });
}
