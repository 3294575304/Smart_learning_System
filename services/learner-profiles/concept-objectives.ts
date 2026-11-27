import "server-only";

import { createHash } from "node:crypto";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import {
  AuditAction,
  AuditTargetType,
  LearnerProfileEvidenceState,
  Prisma,
  QuestionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";

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
export async function listCourseObjectives(
  courseId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<{
  structureId: string | null;
  versionNumber: number | null;
  objectives: CourseObjective[];
}> {
  const course = await db.course.findUnique({
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
async function loadObjectiveDerivation(
  courseId: string,
  db: Prisma.TransactionClient,
) {
  const [currentSyllabus, graph] = await Promise.all([
    listCourseObjectives(courseId, db),
    db.course.findUnique({
      where: { id: courseId },
      select: {
        currentPublishedKnowledgeGraphVersion: {
          select: {
            id: true,
            nodes: {
              where: { nodeType: "KNOWLEDGE_POINT" },
              select: { conceptId: true, code: true, name: true },
            },
          },
        },
      },
    }),
  ]);
  const version = graph?.currentPublishedKnowledgeGraphVersion;
  if (
    !version ||
    !currentSyllabus.structureId ||
    !currentSyllabus.objectives.length
  )
    return null;
  const concepts = new Map(version.nodes.map((node) => [node.conceptId, node]));
  const [mappings, bindings, existing] = await Promise.all([
    db.questionCourseObjective.findMany({
      where: {
        courseId,
        syllabusStructureId: currentSyllabus.structureId,
        question: { status: QuestionStatus.ACTIVE, deletedAt: null },
      },
      select: { questionId: true, objectiveCode: true },
    }),
    db.questionKnowledgeGraphBinding.findMany({
      where: {
        courseId,
        conceptId: { in: [...concepts.keys()] },
        question: { status: QuestionStatus.ACTIVE, deletedAt: null },
      },
      select: { questionId: true, conceptId: true },
    }),
    db.conceptObjectiveLink.findMany({
      where: { courseId },
      select: {
        id: true,
        conceptId: true,
        objectiveCode: true,
        syllabusStructureId: true,
        source: true,
        confidence: true,
        weight: true,
      },
    }),
  ]);
  const activeObjectiveCodes = new Set(
    currentSyllabus.objectives.map((objective) => objective.code),
  );
  const objectivesByQuestion = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    if (!activeObjectiveCodes.has(mapping.objectiveCode)) continue;
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
  const support = new Map<string, number>();
  const candidates: Array<{
    conceptId: string;
    objectiveCode: string;
    share: number;
    count: number;
  }> = [];
  for (const [conceptId, questionIds] of questionsByConcept) {
    const total = questionIds.size;

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
      support.set(objectiveLinkKey({ conceptId, objectiveCode }), share);
      if (
        count >= 2 &&
        share >= 0.5 &&
        activeObjectiveCodes.has(objectiveCode)
      ) {
        candidates.push({ conceptId, objectiveCode, share, count });
      }
    }
  }
  const existingByKey = new Map(
    existing.map((link) => [objectiveLinkKey(link), link]),
  );
  const candidateKeys = new Set(candidates.map(objectiveLinkKey));
  const proposals = candidates.filter(
    (item) => existingByKey.get(objectiveLinkKey(item))?.source !== "MANUAL",
  );
  const removals = existing.filter(
    (link) =>
      link.source === "DERIVED" && !candidateKeys.has(objectiveLinkKey(link)),
  );
  const manual = existing.filter((link) => link.source === "MANUAL");
  const currentManual = manual.filter(
    (link) =>
      link.syllabusStructureId === currentSyllabus.structureId &&
      concepts.has(link.conceptId) &&
      activeObjectiveCodes.has(link.objectiveCode),
  );
  const byConcept = new Map<string, number>();
  for (const link of [...proposals, ...currentManual]) {
    byConcept.set(link.conceptId, (byConcept.get(link.conceptId) ?? 0) + 1);
  }
  const names = <T extends { conceptId: string; objectiveCode: string }>(
    items: readonly T[],
  ) =>
    items.map((item) => ({
      ...item,
      name: concepts.get(item.conceptId)?.name ?? "历史知识点",
    }));
  const additions = proposals.filter(
    (item) => !existingByKey.has(objectiveLinkKey(item)),
  );
  const updates = proposals.filter((item) => {
    const old = existingByKey.get(objectiveLinkKey(item));
    return (
      old &&
      (old.syllabusStructureId !== currentSyllabus.structureId ||
        old.weight.toNumber() !== item.count ||
        old.confidence.toNumber() !== Number(item.share.toFixed(4)))
    );
  });
  const token = createHash("sha256")
    .update(
      JSON.stringify([
        courseId,
        currentSyllabus.structureId,
        version.id,
        [...concepts.keys()].sort(),
        candidates
          .map((item) =>
            JSON.stringify([objectiveLinkKey(item), item.count, item.share]),
          )
          .sort(),
        existing.map((item) => JSON.stringify(item)).sort(),
      ]),
    )
    .digest("hex");
  return {
    currentSyllabus,
    version,
    concepts,
    support,
    questionsByConcept,
    objectivesByQuestion,
    existing,
    updates,
    additions,
    removals,
    preview: {
      token,
      additions: names(additions),
      updates: names(updates),
      removals: names(removals),
      unassigned: [...concepts.values()].filter(
        (node) => !byConcept.has(node.conceptId),
      ),
      overlapping: [...concepts.values()].filter(
        (node) => (byConcept.get(node.conceptId) ?? 0) > 1,
      ),
      historicalManualCount: manual.length - currentManual.length,
    },
  };
}

function objectiveLinkKey(item: { conceptId: string; objectiveCode: string }) {
  return `${item.conceptId}:${item.objectiveCode}`;
}

export async function deriveConceptObjectiveLinks(
  teacherId: string,
  courseId: string,
  token: string,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  return runAssignmentSerializable(
    async (tx) => {
      await assertTeacherCourse(teacherId, courseId, tx);
      const plan = await loadObjectiveDerivation(courseId, tx);
      if (!plan || plan.preview.token !== token) return false;
      for (const item of [...plan.additions, ...plan.updates]) {
        const key = {
          courseId,
          conceptId: item.conceptId,
          objectiveCode: item.objectiveCode,
        };
        const data = {
          confidence: item.share,
          weight: item.count,
          syllabusStructureId: plan.currentSyllabus.structureId,
        };
        await tx.conceptObjectiveLink.upsert({
          where: { courseId_conceptId_objectiveCode: key },
          create: { ...key, ...data, source: "DERIVED" },
          update: data,
        });
      }
      if (plan.removals.length) {
        await tx.conceptObjectiveLink.deleteMany({
          where: {
            courseId,
            source: "DERIVED",
            id: { in: plan.removals.map((link) => link.id) },
          },
        });
      }
      if (
        plan.additions.length ||
        plan.updates.length ||
        plan.removals.length
      ) {
        await writeGovernanceAuditLog(tx, {
          actorId: teacherId,
          action: AuditAction.COURSE_UPDATED,
          targetType: AuditTargetType.COURSE,
          targetId: courseId,
          summary: "按当前正式图谱和大纲重新推断知识点目标",
          beforeData: null,
          afterData: {
            graphVersionId: plan.version.id,
            syllabusStructureId: plan.currentSyllabus.structureId,
            additions: plan.additions.length,
            updates: plan.updates.length,
            removals: plan.removals.length,
          },
          context,
        });
      }
      return true;
    },
    "映射已变化，请重新预览",
    30_000,
  );
}

async function assertTeacherCourse(
  teacherId: string,
  courseId: string,
  db: Prisma.TransactionClient = prisma,
) {
  const course = await db.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return course;
}

export async function getCourseObjectiveMap(
  teacherId: string,
  courseId: string,
) {
  const course = await assertTeacherCourse(teacherId, courseId);
  const [plan, syllabus] = await Promise.all([
    prisma.$transaction((tx) => loadObjectiveDerivation(courseId, tx), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    }),
    listCourseObjectives(courseId),
  ]);
  const current = plan?.currentSyllabus ?? syllabus;
  const taggedQuestions = [...(plan?.objectivesByQuestion.values() ?? [])];
  return {
    course,
    syllabusVersion: current.versionNumber,
    reviewVersion: plan ? `${current.structureId}/${plan.version.id}` : null,
    preview: plan?.preview ?? null,
    taggedQuestionCount: taggedQuestions.length,
    multiTargetQuestionCount: taggedQuestions.filter((codes) => codes.size > 1)
      .length,
    objectives: current.objectives.map((objective) => {
      const links = (plan?.existing ?? [])
        .flatMap((link) => {
          const node = plan?.concepts.get(link.conceptId);
          const currentVersion =
            link.syllabusStructureId === current.structureId;
          if (
            !node ||
            link.objectiveCode !== objective.code ||
            (!currentVersion && link.source !== "MANUAL")
          )
            return [];
          return [
            {
              id: link.id,
              conceptId: link.conceptId,
              code: node.code,
              name: node.name,
              source: link.source,
              needsReview: !currentVersion,
              support: plan?.support.get(objectiveLinkKey(link)) ?? 0,
              questionCount:
                plan?.questionsByConcept.get(link.conceptId)?.size ?? 0,
            },
          ];
        })
        .sort((a, b) => b.support - a.support || a.code.localeCompare(b.code));
      return {
        ...objective,
        taggedQuestionCount: taggedQuestions.filter((codes) =>
          codes.has(objective.code),
        ).length,
        links,
        confirmedCount: links.filter(
          (row) => row.source === "MANUAL" && !row.needsReview,
        ).length,
        derivedCount: links.filter((row) => row.source === "DERIVED").length,
      };
    }),
  };
}

export type CourseObjectiveMap = Awaited<
  ReturnType<typeof getCourseObjectiveMap>
>;

export async function reviewConceptObjectiveLink(input: {
  teacherId: string;
  courseId: string;
  linkId: string;
  action: "confirm" | "dismiss";
  reviewVersion?: string;
}) {
  return runAssignmentSerializable(async (tx) => {
    const link = await tx.conceptObjectiveLink.findFirst({
      where: {
        id: input.linkId,
        courseId: input.courseId,
        course: { teacherId: input.teacherId, status: { not: "ARCHIVED" } },
      },
      select: {
        id: true,
        courseId: true,
        objectiveCode: true,
        conceptId: true,
      },
    });
    if (!link) throw new ResourceNotFoundError("映射不存在");
    const plan = await loadObjectiveDerivation(link.courseId, tx);
    if (
      !plan ||
      (input.reviewVersion &&
        input.reviewVersion !==
          `${plan.currentSyllabus.structureId}/${plan.version.id}`)
    )
      return null;
    if (input.action === "dismiss") {
      await tx.conceptObjectiveLink.delete({ where: { id: link.id } });
      return { id: link.id, action: "dismiss" as const };
    }
    if (
      !plan?.concepts.has(link.conceptId) ||
      !plan.currentSyllabus.objectives.some(
        (item) => item.code === link.objectiveCode,
      )
    )
      throw new ResourceNotFoundError("映射已不属于当前正式大纲或图谱");
    await tx.conceptObjectiveLink.update({
      where: { id: link.id },
      data: {
        source: "MANUAL",
        createdById: input.teacherId,
        syllabusStructureId: plan.currentSyllabus.structureId,
      },
    });
    return { id: link.id, action: "confirm" as const };
  }, "映射已经更新，请刷新后重试");
}

/** 批量确认自动推断：可按目标限定，未限定时确认全课程。 */
export async function confirmDerivedConceptObjectiveLinks(input: {
  teacherId: string;
  courseId: string;
  objectiveCode?: string;
  reviewVersion?: string;
}) {
  await assertTeacherCourse(input.teacherId, input.courseId);
  return runAssignmentSerializable(
    async (tx) => {
      const plan = await loadObjectiveDerivation(input.courseId, tx);
      if (
        !plan ||
        (input.reviewVersion &&
          input.reviewVersion !==
            `${plan.currentSyllabus.structureId}/${plan.version.id}`)
      )
        return null;
      const codes = plan.currentSyllabus.objectives.map(
        (objective) => objective.code,
      );
      const result = await tx.conceptObjectiveLink.updateMany({
        where: {
          courseId: input.courseId,
          source: "DERIVED",
          syllabusStructureId: plan.currentSyllabus.structureId,
          conceptId: { in: [...plan.concepts.keys()] },
          objectiveCode: {
            in: input.objectiveCode
              ? codes.filter((code) => code === input.objectiveCode)
              : codes,
          },
        },
        data: { source: "MANUAL", createdById: input.teacherId },
      });
      return result.count;
    },
    "映射已经更新，请刷新后重试",
    30_000,
  );
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
  const graph = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      currentPublishedKnowledgeGraphVersion: {
        select: {
          nodes: {
            where: { nodeType: "KNOWLEDGE_POINT" },
            distinct: ["conceptId"],
            select: { conceptId: true },
          },
        },
      },
    },
  });
  const graphConceptIds = new Set(
    graph?.currentPublishedKnowledgeGraphVersion?.nodes.map(
      ({ conceptId }) => conceptId,
    ) ?? [],
  );
  const allLinks = await prisma.conceptObjectiveLink.findMany({
    where: { courseId, syllabusStructureId: syllabus.structureId },
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
      const rows = allLinks.filter(
        (link) =>
          link.objectiveCode === objective.code &&
          graphConceptIds.has(link.conceptId),
      );
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
        conceptCount: rows.length,
        coverageRatio: graphConceptIds.size
          ? Math.round((rows.length / graphConceptIds.size) * 100)
          : 0,
        conclusiveCount: conclusive.length,
        needsSupportCount: points.filter(
          (point) => point.status === "NEEDS_SUPPORT",
        ).length,
        noEvidenceCount: noEvidence.length + rows.length - points.length,
        masteredCount: conclusive.filter((point) => point.status === "MASTERED")
          .length,
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
