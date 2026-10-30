import "server-only";
import { prisma } from "@/lib/prisma";
import { getStudentClassroomContext } from "@/services/courses/student-access";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { learningCenterChapters } from "@/services/learner-profiles/knowledge-chapters";
import { studentKnowledgeStatus } from "@/services/learner-profiles/knowledge-status";
import { getStudentKnowledgeSnapshot } from "@/services/learner-profiles/service";

export async function getStudentHomeKnowledge(
  studentId: string,
  courseId: string,
  classroomId: string,
) {
  const classroom = await getStudentClassroomContext(
    studentId,
    classroomId,
    courseId,
  );
  const [graph, snapshot, progress, course] = await Promise.all([
    getStudentPublishedKnowledgeGraph(studentId, courseId),
    getStudentKnowledgeSnapshot(studentId, courseId),
    prisma.courseTeachingProgressRevision.findFirst({
      where: { courseId, classroomId },
      orderBy: { revisionNumber: "desc" },
      select: { concepts: { select: { conceptId: true } } },
    }),
    prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        currentTeachingProgressRevision: {
          select: { concepts: { select: { conceptId: true } } },
        },
      },
    }),
  ]);
  const structure = graph.published?.structure ?? null;
  const conceptIds = new Map(
    graph.published?.concepts.map((concept) => [
      concept.stableKey,
      concept.conceptId,
    ]) ?? [],
  );
  const mastery = new Map(
    snapshot.concepts.map((concept) => [concept.conceptId, concept]),
  );
  const points =
    structure?.nodes
      .filter((node) => node.type === "KNOWLEDGE_POINT")
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.code.localeCompare(right.code, "zh-CN", { numeric: true }),
      )
      .map((node) => {
        const conceptId = conceptIds.get(node.conceptKey) ?? null;
        const concept = conceptId ? (mastery.get(conceptId) ?? null) : null;
        return {
          key: node.key,
          conceptId,
          name: node.name,
          evidenceCount: concept?.evidenceCount ?? 0,
          masteryScore: concept?.masteryScore ?? null,
          status: studentKnowledgeStatus(concept),
        };
      }) ?? [];
  const taught = new Set(
    (classroom.status === "ACTIVE"
      ? (progress?.concepts ??
        course.currentTeachingProgressRevision?.concepts ??
        [])
      : []
    ).map((concept) => concept.conceptId),
  );
  return {
    heatmap: learningCenterChapters(structure, points),
    generatedAt: snapshot.generatedAt,
    profileRevision: snapshot.revisionNumber,
    taughtCount: points.filter(
      (point) => point.conceptId && taught.has(point.conceptId),
    ).length,
    totalCount: points.length,
  };
}
