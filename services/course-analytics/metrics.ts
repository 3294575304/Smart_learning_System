export interface CourseProfileSnapshotInput {
  studentId: string;
  objectiveMasteryDimension: unknown;
}

export interface CourseConceptScoreInput {
  conceptId: string;
  code: string;
  name: string;
  masteryScore: number;
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

export function summarizeWeakCourseConcepts(
  entries: CourseConceptScoreInput[],
) {
  const byConcept = new Map<
    string,
    {
      conceptId: string;
      code: string;
      name: string;
      scoreTotal: number;
      studentCount: number;
      attentionStudentCount: number;
    }
  >();
  for (const entry of entries) {
    const current = byConcept.get(entry.conceptId) ?? {
      conceptId: entry.conceptId,
      code: entry.code,
      name: entry.name,
      scoreTotal: 0,
      studentCount: 0,
      attentionStudentCount: 0,
    };
    current.scoreTotal += entry.masteryScore;
    current.studentCount += 1;
    if (entry.masteryScore < 60) current.attentionStudentCount += 1;
    byConcept.set(entry.conceptId, current);
  }
  return [...byConcept.values()]
    .map((item) => ({
      conceptId: item.conceptId,
      code: item.code,
      name: item.name,
      averageMastery: Number((item.scoreTotal / item.studentCount).toFixed(1)),
      studentCount: item.studentCount,
      attentionStudentCount: item.attentionStudentCount,
    }))
    .sort(
      (left, right) =>
        left.averageMastery - right.averageMastery ||
        right.attentionStudentCount - left.attentionStudentCount ||
        left.code.localeCompare(right.code, "zh-CN", { numeric: true }),
    )
    .slice(0, 6);
}
