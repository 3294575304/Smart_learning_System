import { CONCLUSIVE_EVIDENCE_COUNT } from "@/services/learner-profiles/constants";

export interface DashboardMasteryEntry {
  studentId: string;
  conceptId: string;
  score: number;
  evidenceCount: number;
  lastEvidenceAt: Date;
}

export function summarizeDashboardMastery(
  studentIds: readonly string[],
  conceptIds: readonly string[],
  entries: readonly DashboardMasteryEntry[],
) {
  const students = new Set(studentIds);
  const concepts = new Set(conceptIds);
  const current = new Map<string, DashboardMasteryEntry>();
  for (const entry of entries) {
    if (students.has(entry.studentId) && concepts.has(entry.conceptId))
      current.set(`${entry.studentId}:${entry.conceptId}`, entry);
  }
  const usable = [...current.values()].filter(
    (entry) =>
      Number.isFinite(entry.score) &&
      entry.score >= 0 &&
      entry.score <= 100 &&
      entry.evidenceCount > 0,
  );
  const stable = usable.filter(
    (entry) => entry.evidenceCount >= CONCLUSIVE_EVIDENCE_COUNT,
  );
  return {
    score: stable.length
      ? Math.round(
          (stable.reduce((sum, entry) => sum + entry.score, 0) /
            stable.length) *
            10,
        ) / 10
      : null,
    evidenceCount: usable.length,
    stableCount: stable.length,
    totalCount: students.size * concepts.size,
    updatedAt: usable.length
      ? new Date(
          Math.max(...usable.map((entry) => entry.lastEvidenceAt.getTime())),
        )
      : null,
  };
}

export interface DashboardSubmission {
  status: string;
  score: unknown | null;
  maxScore: unknown | null;
  gradedAt: Date | null;
  manualAnswerCount: number;
}

/** Match the existing publication gate; publishing is separate from assignment completion. */
export function summarizeDashboardAssignmentTodo(
  submissions: readonly DashboardSubmission[],
) {
  const effective = submissions.filter((item) =>
    ["SUBMITTED", "PENDING_REVIEW", "GRADED", "PUBLISHED"].includes(
      item.status,
    ),
  );
  const pendingReviewCount = effective.filter(
    (item) => item.status === "PENDING_REVIEW" || item.manualAnswerCount > 0,
  ).length;
  const blocked = effective.some(
    (item) =>
      item.status === "SUBMITTED" ||
      item.status === "PENDING_REVIEW" ||
      item.manualAnswerCount > 0 ||
      (item.status === "GRADED" &&
        (item.score === null ||
          item.maxScore === null ||
          item.gradedAt === null)),
  );
  return {
    pendingReviewCount,
    publishableCount: blocked
      ? 0
      : effective.filter((item) => item.status === "GRADED").length,
  };
}
