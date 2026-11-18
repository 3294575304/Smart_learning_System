import "server-only";

import { KnowledgeGraphNodeType, QuestionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { teacherCourseManagementWhere } from "./repository";

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export interface ContentCoveragePoint {
  conceptId: string;
  code: string;
  name: string;
  chapterName: string | null;
  questionCount: number;
  hasEvidence: boolean;
}

/**
 * 内容覆盖自检：知识点有多少、多少有题、多少已经产生评分证据。
 * 只作为备课提示，不做教师考核指标；缺口允许忽略。
 */
export async function getTeacherCourseContentCoverage(
  teacherId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedKnowledgeGraphVersion: {
        select: {
          versionNumber: true,
          nodes: {
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            select: {
              id: true,
              conceptId: true,
              nodeType: true,
              code: true,
              name: true,
            },
          },
          edges: {
            where: { relationType: "CONTAINS" },
            select: { fromNodeId: true, toNodeId: true },
          },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  const graph = course.currentPublishedKnowledgeGraphVersion;
  const empty = {
    course: { id: course.id, name: course.name },
    graphVersion: null as number | null,
    totals: {
      conceptCount: 0,
      boundConceptCount: 0,
      evidencedConceptCount: 0,
      bindingRate: null as number | null,
      evidenceRate: null as number | null,
    },
    chapters: [],
    gaps: [] as ContentCoveragePoint[],
    pointsWithoutEvidence: [] as ContentCoveragePoint[],
    canRemediate: 0,
  };
  if (!graph) return empty;

  const points = graph.nodes.filter(
    (node) => node.nodeType === KnowledgeGraphNodeType.KNOWLEDGE_POINT,
  );
  if (points.length === 0)
    return { ...empty, graphVersion: graph.versionNumber };

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const chapterByConceptId = new Map<string, string>();
  for (const edge of graph.edges) {
    const chapter = nodeById.get(edge.fromNodeId);
    const point = nodeById.get(edge.toNodeId);
    if (
      chapter?.nodeType === KnowledgeGraphNodeType.CHAPTER &&
      point?.nodeType === KnowledgeGraphNodeType.KNOWLEDGE_POINT
    ) {
      chapterByConceptId.set(point.conceptId, chapter.name);
    }
  }
  const conceptIds = points.map((point) => point.conceptId);

  const [bindings, masteryStates] = await Promise.all([
    prisma.questionKnowledgeGraphBinding.findMany({
      where: {
        courseId,
        conceptId: { in: conceptIds },
        question: { status: QuestionStatus.ACTIVE, deletedAt: null },
      },
      select: { conceptId: true, questionId: true },
    }),
    /*
     * 「有证据」必须以每个学生的最新掌握度修订为准。
     * 早期实现按任意历史修订统计，撤销评分后旧修订仍会留下证据，
     * 覆盖卡会虚高。
     */
    prisma.studentCourseConceptMasteryState.findMany({
      where: { courseId },
      select: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
  ]);
  const latestRevisionIds = masteryStates.flatMap((state) =>
    state.revisions.map((revision) => revision.id),
  );
  const evidenced = latestRevisionIds.length
    ? await prisma.studentCourseConceptMasteryEntry.findMany({
        where: {
          masteryRevisionId: { in: latestRevisionIds },
          conceptId: { in: conceptIds },
          evidenceCount: { gt: 0 },
        },
        distinct: ["conceptId"],
        select: { conceptId: true },
      })
    : [];
  const questionCountByConcept = new Map<string, number>();
  for (const binding of bindings) {
    questionCountByConcept.set(
      binding.conceptId,
      (questionCountByConcept.get(binding.conceptId) ?? 0) + 1,
    );
  }
  const evidencedConceptIds = new Set(evidenced.map((row) => row.conceptId));

  const rows = points.map((point) => ({
    conceptId: point.conceptId,
    code: point.code,
    name: point.name,
    chapterName: chapterByConceptId.get(point.conceptId) ?? null,
    questionCount: questionCountByConcept.get(point.conceptId) ?? 0,
    hasEvidence: evidencedConceptIds.has(point.conceptId),
  }));
  const boundConceptCount = rows.filter((row) => row.questionCount > 0).length;
  const evidencedConceptCount = rows.filter((row) => row.hasEvidence).length;
  const chapterMap = new Map<
    string,
    {
      key: string;
      name: string;
      conceptCount: number;
      boundConceptCount: number;
      evidencedConceptCount: number;
    }
  >();
  for (const row of rows) {
    const key = row.chapterName ?? "未归章";
    const chapter = chapterMap.get(key) ?? {
      key,
      name: key,
      conceptCount: 0,
      boundConceptCount: 0,
      evidencedConceptCount: 0,
    };
    chapter.conceptCount += 1;
    if (row.questionCount > 0) chapter.boundConceptCount += 1;
    if (row.hasEvidence) chapter.evidencedConceptCount += 1;
    chapterMap.set(key, chapter);
  }
  const gaps = rows
    .filter((row) => row.questionCount === 0)
    .sort((left, right) =>
      (left.chapterName ?? "").localeCompare(right.chapterName ?? "", "zh-CN"),
    );
  return {
    course: { id: course.id, name: course.name },
    graphVersion: graph.versionNumber,
    totals: {
      conceptCount: rows.length,
      boundConceptCount,
      evidencedConceptCount,
      bindingRate: percent(boundConceptCount, rows.length),
      evidenceRate: percent(evidencedConceptCount, rows.length),
    },
    chapters: [...chapterMap.values()],
    gaps,
    pointsWithoutEvidence: rows.filter(
      (row) => row.questionCount > 0 && !row.hasEvidence,
    ),
    canRemediate: gaps.length,
  };
}

export type CourseContentCoverage = Awaited<
  ReturnType<typeof getTeacherCourseContentCoverage>
>;

export async function getCoverageQuestionContext(
  teacherId: string,
  courseId: string,
  conceptId: string,
) {
  const course = await prisma.course.findFirst({
    where: { ...teacherCourseManagementWhere(teacherId), id: courseId },
    select: {
      name: true,
      questionCategoryId: true,
      currentPublishedKnowledgeGraphVersion: {
        select: {
          nodes: {
            where: {
              conceptId,
              nodeType: KnowledgeGraphNodeType.KNOWLEDGE_POINT,
            },
            take: 1,
            select: { code: true, name: true },
          },
        },
      },
    },
  });
  const node = course?.currentPublishedKnowledgeGraphVersion?.nodes[0];
  return course && node
    ? { courseName: course.name, categoryId: course.questionCategoryId, node }
    : null;
}
