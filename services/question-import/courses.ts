import "server-only";
import { prisma } from "@/lib/prisma";
import type { QuestionImportCourseOption } from "@/services/question-import/types";

export async function listQuestionImportCourses(): Promise<
  QuestionImportCourseOption[]
> {
  return prisma.questionCourseCategory.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}
