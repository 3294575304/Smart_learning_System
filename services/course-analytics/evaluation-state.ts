import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { courseEvaluationNextStep } from "./evaluation-next-step";

export function listTeacherAssistantCourses(teacherId: string) {
  return prisma.course.findMany({
    where: { teacherId, status: { not: "ARCHIVED" } },
    select: { id: true, name: true, courseNo: true, term: true },
    orderBy: [{ term: "desc" }, { name: "asc" }, { id: "asc" }],
  });
}

export async function loadTeacherEvaluationScope(
  teacherId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      currentPublishedAssessmentSchemeId: true,
      questionCategory: { select: { isActive: true } },
      currentPublishedAssessmentScheme: {
        select: {
          sourcePublishedSyllabusStructureId: true,
          outcomes: { select: { _count: { select: { mappings: true } } } },
        },
      },
      classrooms: {
        where: { teacherId, status: { in: ["ACTIVE", "COMPLETED"] } },
        select: { id: true, name: true, status: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在或无权访问");
  return course;
}

export async function loadTeacherEvaluationStep(
  course: Awaited<ReturnType<typeof loadTeacherEvaluationScope>>,
  classroomId?: string,
  includeReport = true,
) {
  const classroom = classroomId
    ? (course.classrooms.find((room) => room.id === classroomId) ?? null)
    : course.classrooms.length === 1
      ? course.classrooms[0]
      : null;
  if (classroomId && !classroom)
    return { step: null, publication: null, schemeId: null };
  const schemeId = course.currentPublishedAssessmentSchemeId;
  const gradebook =
    classroom && schemeId
      ? await prisma.courseGradebook.findUnique({
          where: {
            courseId_classroomId_schemeId: {
              courseId: course.id,
              classroomId: classroom.id,
              schemeId,
            },
          },
          select: {
            id: true,
            classroomId: true,
            currentPublication: {
              select: { id: true, versionNumber: true, publishedAt: true },
            },
          },
        })
      : null;
  const publication = gradebook?.currentPublication ?? null;
  const [report, changedGradebook] =
    publication && gradebook
      ? await Promise.all([
          includeReport
            ? prisma.courseQualityReport.findFirst({
                where: {
                  courseId: course.id,
                  classroomId: gradebook.classroomId,
                  gradebookId: gradebook.id,
                  sourceType: "PLATFORM",
                  sourceSnapshotJson: {
                    path: ["sourceReference", "gradebookPublicationId"],
                    equals: publication.id,
                  },
                },
                orderBy: { versionNumber: "desc" },
                select: {
                  id: true,
                  versionNumber: true,
                  status: true,
                  reviewStatus: true,
                },
              })
            : null,
          prisma.courseGradebook.findFirst({
            where: {
              id: gradebook.id,
              OR: [
                {
                  gradeRevisions: {
                    some: { createdAt: { gt: publication.publishedAt } },
                  },
                },
                {
                  finalOverrideRevisions: {
                    some: { createdAt: { gt: publication.publishedAt } },
                  },
                },
              ],
            },
            select: { id: true },
          }),
        ])
      : [null, null];
  const scheme = course.currentPublishedAssessmentScheme;
  return {
    step: courseEvaluationNextStep({
      courseId: course.id,
      classroom,
      hasClassrooms: course.classrooms.length > 0,
      hasPublishedScheme: schemeId !== null,
      hasOutcomeMappings: !!(
        scheme?.sourcePublishedSyllabusStructureId &&
        scheme.outcomes.length &&
        scheme.outcomes.every((outcome) => outcome._count.mappings > 0)
      ),
      includeReport,
      gradebook,
      unpublishedChanges: changedGradebook !== null,
      report,
    }),
    publication,
    schemeId,
  };
}
