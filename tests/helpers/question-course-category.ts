import type { PrismaClient } from "@prisma/client";

export async function ensureTestQuestionCategory(
  client: PrismaClient,
  userId: string,
) {
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { schoolId: true },
  });
  if (!user.schoolId) {
    throw new Error("Test user must belong to a school");
  }
  return client.questionCourseCategory.upsert({
    where: {
      schoolId_normalizedName: {
        schoolId: user.schoolId,
        normalizedName: "automated-test-category",
      },
    },
    update: { isActive: true },
    create: {
      schoolId: user.schoolId,
      name: "自动化测试课程分类",
      normalizedName: "automated-test-category",
    },
    select: { id: true },
  });
}
