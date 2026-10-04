import "server-only";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
export async function listReviewChapters(studentId: string, courseId?: string) {
  if (!courseId || ["GENERAL", "LEGACY"].includes(courseId)) return [];
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: { memberships: { some: { studentId, status: "ACTIVE" } } },
      },
    },
    select: { currentPublishedKnowledgeGraphVersionId: true },
  });
  if (!course?.currentPublishedKnowledgeGraphVersionId) return [];
  const nodes = await prisma.publishedKnowledgeGraphNode.findMany({
    where: {
      graphVersionId: course.currentPublishedKnowledgeGraphVersionId,
      nodeType: "CHAPTER",
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      name: true,
      outgoingEdges: {
        where: { relationType: "CONTAINS" },
        select: { toNode: { select: { conceptId: true, nodeType: true } } },
      },
    },
  });
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    conceptIds: node.outgoingEdges
      .filter((edge) => edge.toNode.nodeType === "KNOWLEDGE_POINT")
      .map((edge) => edge.toNode.conceptId),
  }));
}
export async function reviewChapterConcepts(
  studentId: string,
  courseId: string | undefined,
  chapterId: string,
) {
  const chapter = (await listReviewChapters(studentId, courseId)).find(
    (item) => item.id === chapterId,
  );
  if (!chapter) throw new ResourceNotFoundError("章节不存在或不属于当前课程。");
  return chapter.conceptIds;
}
