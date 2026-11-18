import "server-only";

import { LearnerProfileEvidenceState, QuestionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";

export interface CourseObjective {
  code: string;
  title: string;
  description: string;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 目标来自当前正式大纲的 objectives；同时返回大纲版本，
 * 供映射与展示判断"这条映射是不是基于当前大纲"。
 */
export async function listCourseObjectives(courseId: string): Promise<{
  structureId: string | null;
  versionNumber: number | null;
  objectives: CourseObjective[];
}> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      currentPublishedSyllabusStructure: {
        select: { id: true, versionNumber: true, structureJson: true },
      },
    },
  });
  const published = course?.currentPublishedSyllabusStructure ?? null;
  const structure = published?.structureJson;
  if (
    !published ||
    !structure ||
    typeof structure !== "object" ||
    Array.isArray(structure)
  ) {
    return { structureId: null, versionNumber: null, objectives: [] };
  }
  const raw = (structure as Record<string, unknown>).objectives;
  const objectives = Array.isArray(raw)
    ? raw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const code = text(record.code);
        if (!code) return [];
        return [
          {
            code,
            title: text(record.title) ?? code,
            description: text(record.description) ?? "",
          },
        ];
      })
    : [];
  return {
    structureId: published.id,
    versionNumber: published.versionNumber,
    objectives,
  };
}

/**
 * 冷启动不要求教师手工标注：用「题目→目标」与「题目→知识点」共现统计推断。
 * 判定：知识点下至少 2 道题服务同一目标，且该目标占该知识点题目的 50% 以上。
 * 推断结果只落 DERIVED，教师确认后才是 MANUAL。
 */
export async function deriveConceptObjectiveLinks(courseId: string) {
  const [mappings, bindings, existing] = await Promise.all([
    prisma.questionCourseObjective.findMany({
      where: { courseId },
      select: { questionId: true, objectiveCode: true },
    }),
    prisma.questionKnowledgeGraphBinding.findMany({
      where: { courseId },
      select: { questionId: true, conceptId: true },
    }),
    prisma.conceptObjectiveLink.findMany({
      where: { courseId },
      select: {
        id: true,
        conceptId: true,
        objectiveCode: true,
        syllabusStructureId: true,
        source: true,
      },
    }),
  ]);
  if (!mappings.length || !bindings.length) {
    return { derived: 0, skippedManual: 0 };
  }
  const currentSyllabus = await listCourseObjectives(courseId);
  if (!currentSyllabus.structureId) {
    return { derived: 0, skippedManual: 0 };
  }
  const activeObjectiveCodes = new Set(
    currentSyllabus.objectives.map((objective) => objective.code),
  );
  const objectivesByQuestion = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const set = objectivesByQuestion.get(mapping.questionId) ?? new Set();
    set.add(mapping.objectiveCode);
    objectivesByQuestion.set(mapping.questionId, set);
  }
  const questionsByConcept = new Map<string, Set<string>>();
  for (const binding of bindings) {
    const set = questionsByConcept.get(binding.conceptId) ?? new Set();
    set.add(binding.questionId);
    questionsByConcept.set(binding.conceptId, set);
  }
  const candidates: Array<{
    conceptId: string;
    objectiveCode: string;
    share: number;
    count: number;
  }> = [];
  for (const [conceptId, questionIds] of questionsByConcept) {
    const total = questionIds.size;
    if (total < 2) continue;
    const countByObjective = new Map<string, number>();
    for (const questionId of questionIds) {
      for (const objectiveCode of objectivesByQuestion.get(questionId) ?? []) {
        countByObjective.set(
          objectiveCode,
          (countByObjective.get(objectiveCode) ?? 0) + 1,
        );
      }
    }
    for (const [objectiveCode, count] of countByObjective) {
      const share = count / total;
      if (
        count >= 2 &&
        share >= 0.5 &&
        activeObjectiveCodes.has(objectiveCode)
      ) {
        candidates.push({ conceptId, objectiveCode, share, count });
      }
    }
  }
  /*
   * 独占度上限：一个目标最多认领 40% 的知识点（至少 3 个）。
   * 否则「知识目标」会把 80–90% 的知识点全收走，目标视图就退化成课程均分。
   * 被裁掉的只是自动推断；教师确认过的 MANUAL 行不受影响。
   */
  const graph = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      currentPublishedKnowledgeGraphVersion: {
        select: {
          nodes: {
            where: { nodeType: "KNOWLEDGE_POINT" },
            select: { id: true },
          },
        },
      },
    },
  });
  const totalConcepts =
    graph?.currentPublishedKnowledgeGraphVersion?.nodes.length ??
    questionsByConcept.size;
  const maxLinksPerObjective = Math.max(3, Math.ceil(totalConcepts * 0.4));
  const candidatesByObjective = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const list = candidatesByObjective.get(candidate.objectiveCode) ?? [];
    list.push(candidate);
    candidatesByObjective.set(candidate.objectiveCode, list);
  }
  const cappedCandidates = [...candidatesByObjective.values()].flatMap((list) =>
    [...list]
      .sort(
        (left, right) => right.share - left.share || right.count - left.count,
      )
      .slice(0, maxLinksPerObjective),
  );

  const existingKey = new Map(
    existing.map((link) => [
      `${link.conceptId}\u0000${link.objectiveCode}`,
      link,
    ]),
  );
  const candidateKeys = new Set(
    cappedCandidates.map(
      (item) => `${item.conceptId}\u0000${item.objectiveCode}`,
    ),
  );
  let derived = 0;
  let skippedManual = 0;
  await prisma.$transaction(async (transaction) => {
    for (const candidate of cappedCandidates) {
      const key = `${candidate.conceptId}\u0000${candidate.objectiveCode}`;
      const current = existingKey.get(key);
      if (current?.source === "MANUAL") {
        skippedManual += 1;
        continue;
      }
      if (current) {
        await transaction.conceptObjectiveLink.update({
          where: { id: current.id },
          data: {
            confidence: candidate.share,
            weight: candidate.count,
            source: "DERIVED",
            syllabusStructureId: currentSyllabus.structureId,
          },
        });
      } else {
        await transaction.conceptObjectiveLink.create({
          data: {
            courseId,
            conceptId: candidate.conceptId,
            objectiveCode: candidate.objectiveCode,
            confidence: candidate.share,
            weight: candidate.count,
            source: "DERIVED",
            syllabusStructureId: currentSyllabus.structureId,
          },
        });
      }
      derived += 1;
    }
    /*
     * 只回收「这次不再成立」的推断行。注意不能按 syllabusStructureId 是否等于
     * 当前版本来删：上面刚把旧版候选原地更新成当前版本，若再按版本删一次，
     * 会把刚更新的行一起删掉（曾经真的全部删空过）。
     */
    const stale = existing.filter(
      (link) =>
        link.source === "DERIVED" &&
        !candidateKeys.has(`${link.conceptId}\u0000${link.objectiveCode}`),
    );
    if (stale.length) {
      await transaction.conceptObjectiveLink.deleteMany({
        where: { id: { in: stale.map((link) => link.id) } },
      });
    }
  });
  return { derived, skippedManual };
}

async function assertTeacherCourse(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: { id: true, name: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return course;
}

export async function assertTeacherOwnsCourse(
  teacherId: string,
  courseId: string,
) {
  return assertTeacherCourse(teacherId, courseId);
}

/** 教师审核视图：目标 → 关联知识点 + 推断置信度。 */
export async function getCourseObjectiveMap(
  teacherId: string,
  courseId: string,
  options: { deriveIfEmpty?: boolean } = {},
) {
  const course = await assertTeacherCourse(teacherId, courseId);
  const currentSyllabus = await listCourseObjectives(courseId);
  if (options.deriveIfEmpty && currentSyllabus.structureId) {
    /*
     * 只在「当前大纲没有任何映射」时自动推断。
     * 旧大纲留下的 DERIVED 由 derive 自己回收，不会挡住新版本的首次生成。
     */
    const existing = await prisma.conceptObjectiveLink.count({
      where: {
        courseId,
        OR: [
          { syllabusStructureId: currentSyllabus.structureId },
          { source: "MANUAL" },
        ],
      },
    });
    if (existing === 0) await deriveConceptObjectiveLinks(courseId);
  }
  const [links, questionCounts] = await Promise.all([
    prisma.conceptObjectiveLink.findMany({
      where: {
        courseId,
        OR: [
          { syllabusStructureId: currentSyllabus.structureId },
          { source: "MANUAL" },
        ],
      },
      orderBy: [{ objectiveCode: "asc" }, { confidence: "desc" }],
      select: {
        id: true,
        conceptId: true,
        objectiveCode: true,
        source: true,
        confidence: true,
        weight: true,
        concept: {
          select: {
            stableKey: true,
            nodes: {
              orderBy: { sortOrder: "desc" },
              take: 1,
              select: { code: true, name: true },
            },
          },
        },
      },
    }),
    prisma.questionKnowledgeGraphBinding.groupBy({
      by: ["conceptId"],
      where: {
        courseId,
        question: { status: QuestionStatus.ACTIVE, deletedAt: null },
      },
      _count: { _all: true },
    }),
  ]);
  const questionCountByConcept = new Map(
    questionCounts.map((row) => [row.conceptId, row._count._all]),
  );
  return {
    course,
    syllabusVersion: currentSyllabus.versionNumber,
    objectives: currentSyllabus.objectives.map((objective) => {
      const rows = links
        .filter((link) => link.objectiveCode === objective.code)
        .map((link) => ({
          id: link.id,
          conceptId: link.conceptId,
          code: link.concept.nodes[0]?.code ?? link.concept.stableKey,
          name: link.concept.nodes[0]?.name ?? "知识点",
          source: link.source,
          confidence: link.confidence.toNumber(),
          questionCount: questionCountByConcept.get(link.conceptId) ?? 0,
        }));
      return {
        ...objective,
        links: rows,
        confirmedCount: rows.filter((row) => row.source === "MANUAL").length,
        derivedCount: rows.filter((row) => row.source === "DERIVED").length,
      };
    }),
    totalLinks: links.length,
  };
}

export type CourseObjectiveMap = Awaited<
  ReturnType<typeof getCourseObjectiveMap>
>;

export async function reviewConceptObjectiveLink(input: {
  teacherId: string;
  linkId: string;
  action: "confirm" | "dismiss";
}) {
  const link = await prisma.conceptObjectiveLink.findUnique({
    where: { id: input.linkId },
    select: { id: true, courseId: true },
  });
  if (!link) throw new ResourceNotFoundError("映射不存在");
  await assertTeacherCourse(input.teacherId, link.courseId);
  const course = await prisma.course.findUnique({
    where: { id: link.courseId },
    select: { currentPublishedSyllabusStructureId: true },
  });
  if (input.action === "dismiss") {
    await prisma.conceptObjectiveLink.delete({ where: { id: link.id } });
    return { id: link.id, action: "dismiss" as const };
  }
  await prisma.conceptObjectiveLink.update({
    where: { id: link.id },
    data: {
      source: "MANUAL",
      createdById: input.teacherId,
      confidence: 1,
      syllabusStructureId:
        course?.currentPublishedSyllabusStructureId ?? undefined,
    },
  });
  return { id: link.id, action: "confirm" as const };
}

/** 批量确认自动推断：可按目标限定，未限定时确认全课程。 */
export async function confirmDerivedConceptObjectiveLinks(input: {
  teacherId: string;
  courseId: string;
  objectiveCode?: string;
}) {
  await assertTeacherCourse(input.teacherId, input.courseId);
  const result = await prisma.conceptObjectiveLink.updateMany({
    where: {
      courseId: input.courseId,
      source: "DERIVED",
      ...(input.objectiveCode ? { objectiveCode: input.objectiveCode } : {}),
    },
    data: {
      source: "MANUAL",
      confidence: 1,
      createdById: input.teacherId,
    },
  });
  return result.count;
}

export interface ObjectiveMasteryConcept {
  conceptId: string | null;
  name: string;
  code: string;
  evidenceState: LearnerProfileEvidenceState;
  masteryScore: number | null;
  status: string;
}

/** 学生端「按目标」聚合：同一份掌握度换一个聚合维度，不改变口径。 */
export async function getObjectiveMastery(
  courseId: string,
  concepts: ObjectiveMasteryConcept[],
) {
  const syllabus = await listCourseObjectives(courseId);
  /*
   * 优先使用「当前大纲 + 人工确认」的映射；刚重发大纲、教师还没重建时，
   * 回退到同目标代码的历史映射，避免学生端目标视图突然整块消失。
   */
  const allLinks = await prisma.conceptObjectiveLink.findMany({
    where: { courseId },
    select: {
      conceptId: true,
      objectiveCode: true,
      source: true,
      confidence: true,
      syllabusStructureId: true,
    },
  });
  const byConcept = new Map(
    concepts.flatMap((concept) =>
      concept.conceptId ? [[concept.conceptId, concept] as const] : [],
    ),
  );
  const statusPriority: Record<string, number> = {
    NEEDS_SUPPORT: 0,
    DEVELOPING: 1,
    INSUFFICIENT: 2,
    NO_EVIDENCE: 3,
    MASTERED: 4,
  };
  return syllabus.objectives
    .map((objective) => {
      const scoped = allLinks.filter(
        (link) => link.objectiveCode === objective.code,
      );
      const preferred = scoped.filter(
        (link) =>
          link.syllabusStructureId === syllabus.structureId ||
          link.source === "MANUAL",
      );
      const rows = preferred.length ? preferred : scoped;
      const points = rows.flatMap((row) => {
        const point = byConcept.get(row.conceptId);
        return point ? [point] : [];
      });
      const conclusive = points.filter(
        (point) =>
          point.evidenceState === LearnerProfileEvidenceState.CONCLUSIVE,
      );
      const noEvidence = points.filter(
        (point) =>
          point.evidenceState === LearnerProfileEvidenceState.NO_EVIDENCE,
      );
      const confirmedRows = rows.filter((row) => row.source === "MANUAL");
      return {
        code: objective.code,
        title: objective.title,
        description: objective.description,
        conceptCount: points.length,
        coverageRatio: concepts.length
          ? Math.round((points.length / concepts.length) * 100)
          : 0,
        conclusiveCount: conclusive.length,
        needsSupportCount: points.filter(
          (point) => point.status === "NEEDS_SUPPORT",
        ).length,
        noEvidenceCount: noEvidence.length,
        masteryAverage: conclusive.length
          ? Number(
              (
                conclusive.reduce(
                  (sum, point) => sum + (point.masteryScore ?? 0),
                  0,
                ) / conclusive.length
              ).toFixed(1),
            )
          : null,
        confirmedRatio: rows.length
          ? Math.round((confirmedRows.length / rows.length) * 100)
          : 0,
        /**
         * 「最需要补」只从尚未掌握的点里选：已掌握的不该再占这个位置，
         * 否则全目标都达标时仍会推荐三个已掌握的知识点。
         */
        focusConcepts: [...points]
          .filter((point) => point.status !== "MASTERED")
          .sort(
            (left, right) =>
              (statusPriority[left.status] ?? 9) -
                (statusPriority[right.status] ?? 9) ||
              (left.masteryScore ?? Number.POSITIVE_INFINITY) -
                (right.masteryScore ?? Number.POSITIVE_INFINITY),
          )
          .slice(0, 3)
          .map((point) => ({
            conceptId: point.conceptId,
            name: point.name,
            code: point.code,
            status: point.status,
          })),
      };
    })
    .filter((objective) => objective.conceptCount > 0);
}
