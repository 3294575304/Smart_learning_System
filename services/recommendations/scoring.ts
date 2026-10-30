import { distributeAssignmentPoints } from "@/services/assignments/editor-helpers";
import { hundredPointScore } from "@/services/assignments/presentation";

export const PRACTICE_SCORING_RULE = "practice-hundred-v1";

export function practicePointAllocation(count: number): number[] {
  return count === 0 ? [] : distributeAssignmentPoints(count, 100);
}

export function studentScoreLabel(
  score: number | null,
  maxScore: number | null,
): string {
  const percentage = hundredPointScore(score, maxScore);
  return percentage === null
    ? "缺少完整成绩"
    : `${percentage} 分｜原始得分 ${score}／${maxScore}`;
}

export interface PracticeScoreInput {
  status: string;
  assignedPoints?: number | null;
  score?: number | null;
  maxScore?: number | null;
  judgingStatus?: string | null;
}

/** Missing denominators remain unknown; ungraded questions never become zero marks. */
export function summarizePracticeScores(items: PracticeScoreInput[]) {
  const graded = items.filter(
    (item) =>
      item.status === "COMPLETED" &&
      item.score != null &&
      item.maxScore != null &&
      item.maxScore > 0,
  );
  const frozen =
    items.length > 0 && items.every((item) => item.assignedPoints != null);
  const complete = graded.length === items.length && items.length > 0;
  const rawScore =
    Math.round(graded.reduce((sum, item) => sum + (item.score ?? 0), 0) * 100) /
    100;
  const rawMax = complete
    ? graded.reduce((sum, item) => sum + (item.maxScore ?? 0), 0)
    : null;
  return {
    gradedScore: rawScore,
    totalPoints: frozen
      ? Math.round(
          items.reduce((sum, item) => sum + (item.assignedPoints ?? 0), 0) *
            100,
        ) / 100
      : rawMax,
    percentage: complete ? hundredPointScore(rawScore, rawMax) : null,
    completedCount: items.filter((item) => item.status === "COMPLETED").length,
    gradedCount: graded.length,
    pendingCount: items.filter(
      (item) =>
        item.status !== "COMPLETED" &&
        ["PENDING", "RUNNING"].includes(item.judgingStatus ?? ""),
    ).length,
    errorCount: items.filter(
      (item) =>
        item.status !== "COMPLETED" &&
        ["SYSTEM_ERROR", "CANCELLED"].includes(item.judgingStatus ?? ""),
    ).length,
    unansweredCount: items.filter(
      (item) => item.status !== "COMPLETED" && !item.judgingStatus,
    ).length,
    complete,
    frozen,
  };
}
