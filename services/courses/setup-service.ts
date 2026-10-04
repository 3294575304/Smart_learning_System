import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { buildCourseSetupProgress } from "@/services/courses/setup-progress";

export async function getTeacherCourseSetupProgress(
  teacherId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      status: true,
      template: { select: { name: true } },
      classrooms: {
        where: { status: "ACTIVE" },
        select: {
          memberships: {
            where: { status: "ACTIVE" },
            select: { studentId: true },
          },
          studentIdentityAssignments: {
            where: { studentIdentity: { status: "PENDING" } },
            select: { studentIdentityId: true },
          },
        },
      },
      studentImportBatches: {
        where: { classroom: { status: "ACTIVE", courseId } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { status: true },
      },
      syllabi: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          parseDrafts: {
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { status: true },
          },
        },
      },
      currentPublishedSyllabusStructure: {
        select: {
          id: true,
          syllabusId: true,
          versionNumber: true,
          knowledgeGraphDrafts: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { status: true },
          },
        },
      },
      currentPublishedKnowledgeGraphVersion: {
        select: {
          id: true,
          versionNumber: true,
          sourceSyllabusStructureId: true,
        },
      },
      currentPublishedAssessmentScheme: {
        select: {
          versionNumber: true,
          sourcePublishedSyllabusStructureId: true,
        },
      },
      currentTeachingProgressRevision: {
        select: {
          graphVersionId: true,
          _count: { select: { concepts: true } },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");

  const syllabus = course.syllabi[0];
  const publishedSyllabus = course.currentPublishedSyllabusStructure;
  const teachingProgress = course.currentTeachingProgressRevision;
  return buildCourseSetupProgress({
    courseId: course.id,
    status: course.status,
    templateName: course.template.name,
    activeClassroomCount: course.classrooms.length,
    activeStudentCount: new Set(
      course.classrooms.flatMap((item) =>
        item.memberships.map((member) => member.studentId),
      ),
    ).size,
    pendingIdentityCount: new Set(
      course.classrooms.flatMap((item) =>
        item.studentIdentityAssignments.map(
          (assignment) => assignment.studentIdentityId,
        ),
      ),
    ).size,
    latestImportStatus: course.studentImportBatches[0]?.status ?? null,
    syllabus: syllabus
      ? { ...syllabus, parseStatus: syllabus.parseDrafts[0]?.status ?? null }
      : null,
    publishedSyllabus: publishedSyllabus
      ? {
          ...publishedSyllabus,
          graphDraftStatus:
            publishedSyllabus.knowledgeGraphDrafts[0]?.status ?? null,
        }
      : null,
    graph: course.currentPublishedKnowledgeGraphVersion,
    assessment: course.currentPublishedAssessmentScheme,
    teachingProgress: teachingProgress
      ? {
          graphVersionId: teachingProgress.graphVersionId,
          conceptCount: teachingProgress._count.concepts,
        }
      : null,
  });
}
