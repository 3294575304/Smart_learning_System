import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { KnowledgeGraphOperationError } from "@/services/knowledge-graph/errors";

export async function loadTeacherCourseForKnowledgeGraph(
  teacherId: string,
  courseId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await client.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedSyllabusStructureId: true,
      currentPublishedKnowledgeGraphVersionId: true,
      currentPublishedSyllabusStructure: {
        select: {
          id: true,
          courseId: true,
          syllabusId: true,
          structureJson: true,
        },
      },
      syllabi: {
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

export function currentPublishedSyllabusOrThrow(
  course: Awaited<ReturnType<typeof loadTeacherCourseForKnowledgeGraph>>,
) {
  const source = course.currentPublishedSyllabusStructure;
  if (
    !course.currentPublishedSyllabusStructureId ||
    !source ||
    source.id !== course.currentPublishedSyllabusStructureId ||
    source.courseId !== course.id
  ) {
    throw new KnowledgeGraphOperationError(
      "请先审核并发布正式教学大纲结构。",
      409,
      "PUBLISHED_SYLLABUS_REQUIRED",
    );
  }
  if (!course.syllabi[0] || source.syllabusId !== course.syllabi[0].id) {
    throw new KnowledgeGraphOperationError(
      "当前正式教学大纲来自旧文件，请先审核并发布新大纲结构。",
      409,
      "PUBLISHED_SYLLABUS_STALE",
    );
  }
  return source;
}

export async function getCurrentPublishedSyllabusForKnowledgeGraph(
  teacherId: string,
  courseId: string,
) {
  return currentPublishedSyllabusOrThrow(
    await loadTeacherCourseForKnowledgeGraph(teacherId, courseId),
  );
}
