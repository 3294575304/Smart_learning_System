import "server-only";

import { KnowledgeGraphNodeType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { coverageQuestionWhere } from "@/services/question-graph-bindings/question-scope";
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
      questionCategoryId: true,
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

  const [bindings, latestRevisions] = await Promise.all([
    prisma.questionKnowledgeGraphBinding.findMany({
      where: {
        courseId,
        conceptId: { in: conceptIds },
        // 与绑定写入路径（accessibleQuestion）和知识图谱题库统计共用同一口径：
        // 启用 + 未删除 + 属于本课程题库分类。此前这里只过滤状态、不过滤分类，
        // 会把其它课程分类的题目算进本课程覆盖。
        question: coverageQuestionWhere(course.questionCategoryId),
      },
      select: { conceptId: true, questionId: true },
    }),
    /*
     * 「有证据」必须以每个学生的最新掌握度修订为准。
     * 早期实现按任意历史修订统计，撤销评分后旧修订仍会留下证据，
     * 覆盖卡会虚高。
     * 这里直接按 stateId 去重取 revisionNumber 最大的一条：一次查询拿到
     * 「每生最新修订」，不再按父记录逐条取子记录。
     */
    prisma.studentCourseConceptMasteryRevision.findMany({
      where: { state: { courseId } },
      orderBy: [{ stateId: "asc" }, { revisionNumber: "desc" }],
      distinct: ["stateId"],
      select: { id: true },
    }),
  ]);
  const latestRevisionIds = latestRevisions.map((revision) => revision.id);
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
  /*
   * 缺口顺序必须沿用图谱 sortOrder（rows 由 nodes 按 sortOrder/code 排序而来）。
   * 早期实现按章节名 localeCompare('zh-CN') 重排，中文下会排成
   * 「第二章 → 第三章 → 第十章 → 第一章」，与教学顺序无关，
   * 而页面对外只展示前 8 条，等于"优先补哪几个"是随机的。
   */
  const gaps = rows.filter((row) => row.questionCount === 0);
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
          id: true,
          nodes: {
            where: {
              conceptId,
              nodeType: KnowledgeGraphNodeType.KNOWLEDGE_POINT,
            },
            take: 1,
            select: { id: true, code: true, name: true },
          },
        },
      },
    },
  });
  const version = course?.currentPublishedKnowledgeGraphVersion;
  const node = version?.nodes[0];
  return course && version && node
    ? {
        courseName: course.name,
        categoryId: course.questionCategoryId,
        graphVersionId: version.id,
        publishedNodeId: node.id,
        node,
      }
    : null;
}
