import "server-only";
import { prisma } from "@/lib/prisma";
import type { QuestionImportCourseOption } from "@/services/question-import/types";

export async function listQuestionImportCourses(
  teacherId?: string,
): Promise<QuestionImportCourseOption[]> {
  return prisma.course.findMany({
    where: { status: { not: "ARCHIVED" }, ...(teacherId ? { teacherId } : {}) },
    orderBy: [{ name: "asc" }, { term: "desc" }, { id: "asc" }],
    select: { id: true, name: true, courseNo: true, term: true },
  });
}
