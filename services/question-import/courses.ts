import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUserSchoolId } from "@/services/schools/tenant";
import type { QuestionImportCourseOption } from "@/services/question-import/types";

export async function listQuestionImportCourses(
  actorId: string,
): Promise<QuestionImportCourseOption[]> {
  const schoolId = await requireUserSchoolId(actorId);
  return prisma.questionCourseCategory.findMany({
    where: { schoolId, isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}
