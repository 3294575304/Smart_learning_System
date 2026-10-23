import { latestEffectiveSubmissions } from "@/services/assignments/latest-submissions";
export interface DashboardAssignmentAttempt {
  id: string;
  studentId: string;
  attemptNumber: number;
  submittedAt: Date | null;
  status: string;
  judgedCount: number;
  correctCount: number;
}

export function summarizeAssignmentParticipation(
  studentIds: readonly string[],
  submissions: readonly DashboardAssignmentAttempt[],
) {
  const members = new Set(studentIds);
  const latest = latestEffectiveSubmissions(
    submissions.filter((item) => members.has(item.studentId)),
  );
  return {
    expectedCount: members.size,
    completedCount: latest.length,
    judgedCount: latest.reduce((sum, item) => sum + item.judgedCount, 0),
    correctCount: latest.reduce((sum, item) => sum + item.correctCount, 0),
  };
}

export interface DashboardAssignmentCounts {
  expectedCount: number;
  completedCount: number;
  judgedCount: number;
  correctCount: number;
}

export function assignmentRate(numerator: number, denominator: number) {
  return denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 10
    : null;
}

export function summarizeAssignmentRates(
  rows: readonly DashboardAssignmentCounts[],
) {
  const counts = rows.reduce(
    (sum, row) => ({
      expectedCount: sum.expectedCount + row.expectedCount,
      completedCount: sum.completedCount + row.completedCount,
      judgedCount: sum.judgedCount + row.judgedCount,
      correctCount: sum.correctCount + row.correctCount,
    }),
    { expectedCount: 0, completedCount: 0, judgedCount: 0, correctCount: 0 },
  );
  return {
    ...counts,
    completionRate: assignmentRate(counts.completedCount, counts.expectedCount),
    accuracyRate: assignmentRate(counts.correctCount, counts.judgedCount),
  };
}

export function summarizeAssignmentRatesByClass(
  classrooms: readonly { id: string; name: string }[],
  assignments: readonly (DashboardAssignmentCounts & { classroomId: string })[],
) {
  return classrooms.map((classroom) => {
    const rows = assignments.filter((row) => row.classroomId === classroom.id);
    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      assignmentCount: rows.length,
      ...summarizeAssignmentRates(rows),
    };
  });
}
