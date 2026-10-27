import {
  groupKnowledgeChapters,
  type ChapterNode,
} from "@/services/knowledge-graph/chapter-groups";
import { CONCLUSIVE_EVIDENCE_COUNT } from "@/services/learner-profiles/constants";

export interface CourseProfileSnapshotInput {
  studentId: string;
  objectiveMasteryDimension: unknown;
}

export interface CourseMasteryEntry {
  studentId: string;
  conceptId: string;
  masteryScore: number | null;
  evidenceCount: number;
  evidenceState: string;
}

export interface CourseChapterMasterySummary {
  chapterId: string;
  code: string;
  name: string;
  conceptCount: number;
  averageMastery: number | null;
  evidenceStudentCount: number;
  assessedStudentCount: number;
  stableEntryCount: number;
  totalEntryCount: number;
}

export interface CourseAttentionConceptSummary {
  conceptId: string;
  code: string;
  name: string;
  averageMastery: number;
  studentCount: number;
  attentionStudentCount: number;
}

function percentage(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

function objectiveDimension(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    evidenceState:
      typeof record.evidenceState === "string" ? record.evidenceState : null,
    average:
      typeof record.conclusiveAverageMastery === "number" &&
      Number.isFinite(record.conclusiveAverageMastery)
        ? record.conclusiveAverageMastery
        : null,
  };
}

export function summarizeCourseProfiles(
  totalStudents: number,
  snapshots: CourseProfileSnapshotInput[],
) {
  const latestByStudent = new Map<string, CourseProfileSnapshotInput>();
  for (const snapshot of snapshots) {
    if (!latestByStudent.has(snapshot.studentId)) {
      latestByStudent.set(snapshot.studentId, snapshot);
    }
  }
  const dimensions = [...latestByStudent.values()]
    .map((snapshot) => objectiveDimension(snapshot.objectiveMasteryDimension))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const conclusive = dimensions.filter(
    (item) => item.evidenceState === "CONCLUSIVE" && item.average !== null,
  );
  const averages = conclusive.map((item) => item.average as number);
  return {
    snapshotCount: latestByStudent.size,
    coverageRate: percentage(latestByStudent.size, totalStudents),
    conclusiveCount: conclusive.length,
    evidencePendingCount: Math.max(0, totalStudents - conclusive.length),
    averageMastery: averages.length
      ? Number(
          (
            averages.reduce((sum, value) => sum + value, 0) / averages.length
          ).toFixed(1),
        )
      : null,
    attentionStudentCount: averages.filter((value) => value < 60).length,
  };
}

function indexCourseMastery(
  studentIds: readonly string[],
  entries: readonly CourseMasteryEntry[],
) {
  const students = new Set(studentIds);
  const byConcept = new Map<string, Map<string, CourseMasteryEntry>>();
  for (const entry of entries) {
    if (!students.has(entry.studentId)) continue;
    const current = byConcept.get(entry.conceptId) ?? new Map();
    current.set(entry.studentId, entry);
    byConcept.set(entry.conceptId, current);
  }
  return byConcept;
}

function hasStableMastery(
  entry: CourseMasteryEntry,
): entry is CourseMasteryEntry & { masteryScore: number } {
  return (
    entry.evidenceState === "CONCLUSIVE" &&
    entry.evidenceCount >= CONCLUSIVE_EVIDENCE_COUNT &&
    entry.masteryScore !== null &&
    Number.isFinite(entry.masteryScore) &&
    entry.masteryScore >= 0 &&
    entry.masteryScore <= 100
  );
}

export function summarizeCourseChapterMastery(
  studentIds: readonly string[],
  nodes: ChapterNode[],
  containmentEdges: Array<{ fromNodeId: string; toNodeId: string }>,
  entries: readonly CourseMasteryEntry[],
): CourseChapterMasterySummary[] {
  const students = new Set(studentIds);
  const byConcept = indexCourseMastery(studentIds, entries);
  const groups = new Map(
    groupKnowledgeChapters(nodes, containmentEdges).map((group) => [
      group.id,
      group.nodes,
    ]),
  );
  return nodes
    .filter((node) => node.nodeType === "CHAPTER")
    .map((chapter) => {
      const conceptIds = new Set(
        groups.get(chapter.id)?.map((node) => node.conceptId) ?? [],
      );
      const evidenceStudents = new Set<string>();
      const scoresByStudent = new Map<string, { sum: number; count: number }>();
      let stableEntryCount = 0;
      for (const conceptId of conceptIds) {
        for (const entry of byConcept.get(conceptId)?.values() ?? []) {
          if (entry.evidenceCount > 0) evidenceStudents.add(entry.studentId);
          if (!hasStableMastery(entry)) continue;
          const score = scoresByStudent.get(entry.studentId) ?? {
            sum: 0,
            count: 0,
          };
          score.sum += entry.masteryScore;
          score.count += 1;
          scoresByStudent.set(entry.studentId, score);
          stableEntryCount += 1;
        }
      }
      // Each student contributes equally, regardless of how many points they attempted.
      const studentAverages = [...scoresByStudent.values()].map(
        (score) => score.sum / score.count,
      );
      return {
        chapterId: chapter.id,
        code: chapter.code,
        name: chapter.name,
        conceptCount: conceptIds.size,
        averageMastery: studentAverages.length
          ? Number(
              (
                studentAverages.reduce((sum, score) => sum + score, 0) /
                studentAverages.length
              ).toFixed(1),
            )
          : null,
        evidenceStudentCount: evidenceStudents.size,
        assessedStudentCount: scoresByStudent.size,
        stableEntryCount,
        totalEntryCount: students.size * conceptIds.size,
      };
    })
    .sort((left, right) => {
      if (left.averageMastery === null && right.averageMastery !== null)
        return 1;
      if (right.averageMastery === null && left.averageMastery !== null)
        return -1;
      return (
        (left.averageMastery ?? 0) - (right.averageMastery ?? 0) ||
        left.code.localeCompare(right.code, "zh-CN", { numeric: true })
      );
    });
}

export function summarizeCourseAttentionConcepts(
  studentIds: readonly string[],
  nodes: ChapterNode[],
  entries: readonly CourseMasteryEntry[],
): CourseAttentionConceptSummary[] {
  const byConcept = indexCourseMastery(studentIds, entries);
  return nodes
    .filter((node) => node.nodeType === "KNOWLEDGE_POINT")
    .flatMap((node) => {
      const stable = [
        ...(byConcept.get(node.conceptId)?.values() ?? []),
      ].filter(hasStableMastery);
      if (!stable.length) return [];
      const averageMastery = Number(
        (
          stable.reduce((sum, entry) => sum + entry.masteryScore, 0) /
          stable.length
        ).toFixed(1),
      );
      if (averageMastery >= 60) return [];
      return [
        {
          conceptId: node.conceptId,
          code: node.code,
          name: node.name,
          averageMastery,
          studentCount: stable.length,
          attentionStudentCount: stable.filter(
            (entry) => entry.masteryScore < 60,
          ).length,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.averageMastery - right.averageMastery ||
        right.attentionStudentCount - left.attentionStudentCount ||
        left.code.localeCompare(right.code, "zh-CN", { numeric: true }),
    );
}
