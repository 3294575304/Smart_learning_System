import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUserSchoolId } from "@/services/schools/tenant";
import type {
  QuestionImportCourseOption,
  QuestionImportObjectiveCourse,
} from "@/services/question-import/types";
import { listCourseObjectives } from "@/services/learner-profiles/concept-objectives";

export async function listTeacherImportObjectiveCourses(
  teacherId: string,
): Promise<QuestionImportObjectiveCourse[]> {
  const courses = await prisma.course.findMany({
    where: {
      teacherId,
      status: { not: "ARCHIVED" },
      currentPublishedSyllabusStructureId: { not: null },
    },
    select: { id: true, name: true, term: true, questionCategoryId: true },
    orderBy: { name: "asc" },
  });
  const objectives = await Promise.all(
    courses.map((course) => listCourseObjectives(course.id)),
  );
  return courses.flatMap((course, index) => {
    const data = objectives[index];
    return data?.structureId && data.versionNumber && data.objectives.length
      ? [
          {
            id: course.id,
            name: `${course.name} · ${course.term}`,
            categoryId: course.questionCategoryId,
            syllabusStructureId: data.structureId,
            versionNumber: data.versionNumber,
            objectives: data.objectives,
          },
        ]
      : [];
  });
}

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
