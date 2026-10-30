import {
  assignmentParticipation,
  isReportableAssignment,
  latestEffectiveSubmissions,
} from "@/services/assignments/reporting";

export type CourseAssignmentStatus =
  "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";

export type CourseSubmissionStatus =
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "PENDING_REVIEW"
  | "GRADED"
  | "PUBLISHED"
  | "WITHDRAWN";

export interface CourseAssignmentStatisticsInput {
  assignments: Array<{
    id: string;
    classroomId: string;
    status: CourseAssignmentStatus;
    publishedAt: Date | null;
    dueAt: Date | null;
  }>;
  activeStudentIdsByClassroom: Map<string, Set<string>>;
  submissions: Array<{
    id: string;
    assignmentId: string;
    studentId: string;
    attemptNumber: number;
    status: CourseSubmissionStatus;
    submittedAt: Date | null;
    score: number | null;
    maxScore: number | null;
  }>;
}

export type AssignmentScoreBandKey =
  "0-59" | "60-69" | "70-79" | "80-89" | "90-100" | "ungraded";

export interface AssignmentScoreBand {
  key: AssignmentScoreBandKey;
  label: string;
  count: number;
  ratio: number | null;
}

export interface CourseAssignmentStatistics {
  assignmentCount: number;
  studentCount: number;
  eligibleSubmissionCount: number;
  completedSubmissionCount: number;
  unsubmittedCount: number;
  overdueCount: number;
  pendingReviewCount: number;
  historicalSubmittedCount: number;
  completionRate: number | null;
  finalizedSubmissionCount: number;
  scoreRate: number | null;
  scoredStudentCount: number;
  unscoredStudentCount: number;
  scoreDistribution: AssignmentScoreBand[];
}

export interface CourseAssignmentScoreTrendPoint {
  assignmentId: string;
  title: string;
  date: Date;
  averageScore: number;
  finalizedStudentCount: number;
  eligibleStudentCount: number;
}

const FINAL_SCORE_STATUSES = new Set<CourseSubmissionStatus>([
  "GRADED",
  "PUBLISHED",
]);

const SCORE_BANDS = [
  { key: "0-59", label: "0–59", minimum: 0, maximum: 60 },
  { key: "60-69", label: "60–69", minimum: 60, maximum: 70 },
  { key: "70-79", label: "70–79", minimum: 70, maximum: 80 },
  { key: "80-89", label: "80–89", minimum: 80, maximum: 90 },
  {
    key: "90-100",
    label: "90–100",
    minimum: 90,
    maximum: Number.POSITIVE_INFINITY,
  },
] as const;

function roundedPercent(part: number, total: number): number | null {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : null;
}

function findScoreBand(score: number) {
  return SCORE_BANDS.find(
    (band) => score >= band.minimum && score < band.maximum,
  );
}

function distributionRatios(counts: number[], total: number) {
  if (total === 0) return counts.map(() => null);

  const tenths = counts.map((count) => (count / total) * 1000);
  const roundedTenths = tenths.map(Math.floor);
  const remainingTenths =
    1000 - roundedTenths.reduce((sum, value) => sum + value, 0);
  const remainderOrder = tenths
    .map((value, index) => ({ index, remainder: value - roundedTenths[index] }))
    .sort((left, right) => right.remainder - left.remainder);

  for (const { index } of remainderOrder.slice(0, remainingTenths)) {
    roundedTenths[index] += 1;
  }

  return roundedTenths.map((value) => value / 10);
}

export function calculateCourseAssignmentStatistics(
  input: CourseAssignmentStatisticsInput,
  now = new Date(),
): CourseAssignmentStatistics {
  const assignments = input.assignments.filter((assignment) =>
    isReportableAssignment(assignment, now),
  );
  const activeStudentIds = new Set(
    [...input.activeStudentIdsByClassroom.values()].flatMap((studentIds) => [
      ...studentIds,
    ]),
  );
  const latestSubmissionByAssignment = latestEffectiveSubmissions(
    input.submissions,
  );

  let eligibleSubmissionCount = 0;
  let completedSubmissionCount = 0;
  let overdueCount = 0;
  let pendingReviewCount = 0;
  let historicalSubmittedCount = 0;
  let finalizedSubmissionCount = 0;
  let totalScore = 0;
  let totalMaxScore = 0;
  const scorePercentagesByStudent = new Map<string, number[]>();

  for (const assignment of assignments) {
    const assignmentStudents =
      input.activeStudentIdsByClassroom.get(assignment.classroomId) ??
      new Set<string>();
    eligibleSubmissionCount += assignmentStudents.size;
    const participation = assignmentParticipation(
      assignmentStudents,
      latestSubmissionByAssignment.get(assignment.id) ?? new Map(),
      assignment.dueAt,
      now,
    );
    overdueCount += participation.overdueCount;
    pendingReviewCount += participation.pendingReviewCount;
    historicalSubmittedCount += participation.historicalSubmittedCount;

    for (const submission of participation.submissions) {
      const studentId = submission.studentId;
      completedSubmissionCount += 1;
      if (
        !FINAL_SCORE_STATUSES.has(submission.status) ||
        submission.score === null ||
        submission.maxScore === null ||
        submission.maxScore <= 0
      ) {
        continue;
      }

      finalizedSubmissionCount += 1;
      totalScore += submission.score;
      totalMaxScore += submission.maxScore;
      const studentScores = scorePercentagesByStudent.get(studentId) ?? [];
      studentScores.push((submission.score / submission.maxScore) * 100);
      scorePercentagesByStudent.set(studentId, studentScores);
    }
  }

  const scoreCounts = new Map<AssignmentScoreBandKey, number>(
    SCORE_BANDS.map((band) => [band.key, 0]),
  );
  for (const scorePercentages of scorePercentagesByStudent.values()) {
    const averageScore =
      scorePercentages.reduce((sum, value) => sum + value, 0) /
      scorePercentages.length;
    const band = findScoreBand(Math.max(0, Math.min(100, averageScore)));
    if (band) scoreCounts.set(band.key, (scoreCounts.get(band.key) ?? 0) + 1);
  }

  const scoredStudentCount = scorePercentagesByStudent.size;
  const unscoredStudentCount = activeStudentIds.size - scoredStudentCount;
  scoreCounts.set("ungraded", unscoredStudentCount);

  const distributionCounts = [
    ...SCORE_BANDS.map((band) => scoreCounts.get(band.key) ?? 0),
    unscoredStudentCount,
  ];
  const distributionPercentages = distributionRatios(
    distributionCounts,
    activeStudentIds.size,
  );
  const scoreDistribution: AssignmentScoreBand[] = [
    ...SCORE_BANDS.map((band, index) => ({
      key: band.key,
      label: band.label,
      count: distributionCounts[index],
      ratio: distributionPercentages[index],
    })),
    {
      key: "ungraded",
      label: "未评分",
      count: unscoredStudentCount,
      ratio: distributionPercentages.at(-1) ?? null,
    },
  ];

  return {
    assignmentCount: assignments.length,
    studentCount: activeStudentIds.size,
    eligibleSubmissionCount,
    completedSubmissionCount,
    unsubmittedCount: eligibleSubmissionCount - completedSubmissionCount,
    overdueCount,
    pendingReviewCount,
    historicalSubmittedCount,
    completionRate: roundedPercent(
      completedSubmissionCount,
      eligibleSubmissionCount,
    ),
    finalizedSubmissionCount,
    scoreRate: roundedPercent(totalScore, totalMaxScore),
    scoredStudentCount,
    unscoredStudentCount,
    scoreDistribution,
  };
}

export function calculateCourseAssignmentScoreTrend(input: {
  assignments: Array<{
    id: string;
    classroomId: string;
    title: string;
    status: CourseAssignmentStatus;
    dueAt: Date | null;
    publishedAt: Date | null;
    createdAt: Date;
  }>;
  activeStudentIdsByClassroom: Map<string, Set<string>>;
  submissions: CourseAssignmentStatisticsInput["submissions"];
  limit?: number;
  now?: Date;
}): CourseAssignmentScoreTrendPoint[] {
  const assignmentsById = new Map(
    input.assignments
      .filter((assignment) =>
        isReportableAssignment(assignment, input.now ?? new Date()),
      )
      .map((assignment) => [assignment.id, assignment]),
  );
  const latestSubmissionByAssignment = latestEffectiveSubmissions(
    input.submissions,
  );

  const scoredAssignments = [...assignmentsById.values()]
    .flatMap((assignment) => {
      const latestByStudent = latestSubmissionByAssignment.get(assignment.id);
      const normalizedScores: number[] = [];
      const eligibleStudents = input.activeStudentIdsByClassroom.get(
        assignment.classroomId,
      );
      for (const submission of latestByStudent?.values() ?? []) {
        if (!eligibleStudents?.has(submission.studentId)) continue;
        if (
          !FINAL_SCORE_STATUSES.has(submission.status) ||
          submission.score === null ||
          submission.maxScore === null ||
          submission.maxScore <= 0
        ) {
          continue;
        }
        normalizedScores.push(
          Math.max(
            0,
            Math.min(100, (submission.score / submission.maxScore) * 100),
          ),
        );
      }
      if (normalizedScores.length === 0) return [];

      const eligibleStudentCount =
        input.activeStudentIdsByClassroom.get(assignment.classroomId)?.size ??
        0;
      return [
        {
          assignmentId: assignment.id,
          title: assignment.title,
          date:
            assignment.dueAt ?? assignment.publishedAt ?? assignment.createdAt,
          averageScore: Number(
            (
              normalizedScores.reduce((sum, score) => sum + score, 0) /
              normalizedScores.length
            ).toFixed(1),
          ),
          finalizedStudentCount: normalizedScores.length,
          eligibleStudentCount,
        },
      ];
    })
    .sort((left, right) => {
      const dateDifference = right.date.getTime() - left.date.getTime();
      return (
        dateDifference || right.assignmentId.localeCompare(left.assignmentId)
      );
    });

  return scoredAssignments.slice(0, input.limit ?? 6).reverse();
}
