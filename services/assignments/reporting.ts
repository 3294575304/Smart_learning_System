import type { Prisma, SubmissionStatus } from "@prisma/client";

import { assignmentSectionWhere } from "@/services/assignments/presentation";

export type AssignmentReportingSection = "ALL" | "CURRENT" | "HISTORY";

export const REPORTING_SECTION_LABELS: Record<
  AssignmentReportingSection,
  string
> = {
  ALL: "全部",
  CURRENT: "当前",
  HISTORY: "历史",
};

export const EFFECTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  "SUBMITTED",
  "PENDING_REVIEW",
  "GRADED",
  "PUBLISHED",
];

export function assignmentReportingWhere(
  section: AssignmentReportingSection,
  now: Date,
): Prisma.AssignmentWhereInput {
  return {
    AND: [
      { status: { in: ["PUBLISHED", "CLOSED", "ARCHIVED"] } },
      { publishedAt: { lte: now } },
      ...(section === "ALL" ? [] : [assignmentSectionWhere(section)]),
    ],
  };
}

export function isReportableAssignment(
  assignment: { status: string; publishedAt: Date | null },
  now: Date,
) {
  return (
    ["PUBLISHED", "CLOSED", "ARCHIVED"].includes(assignment.status) &&
    assignment.publishedAt !== null &&
    assignment.publishedAt <= now
  );
}

export function reportingClassroomMatches(
  classroom: { status: string; historicalAssignmentCount: number },
  section: AssignmentReportingSection,
) {
  if (section === "ALL") return true;
  if (section === "CURRENT") return classroom.status === "ACTIVE";
  return (
    classroom.status !== "ACTIVE" || classroom.historicalAssignmentCount > 0
  );
}

export interface EffectiveSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  attemptNumber: number;
  status: SubmissionStatus;
  submittedAt: Date | null;
}

/** Ignore new drafts and withdrawn attempts without hiding an earlier valid submission. */
export function latestEffectiveSubmissions<T extends EffectiveSubmission>(
  submissions: T[],
) {
  const result = new Map<string, Map<string, T>>();
  for (const submission of submissions) {
    if (!EFFECTIVE_SUBMISSION_STATUSES.includes(submission.status)) continue;
    let byStudent = result.get(submission.assignmentId);
    if (!byStudent) {
      byStudent = new Map();
      result.set(submission.assignmentId, byStudent);
    }
    const current = byStudent.get(submission.studentId);
    const time = submission.submittedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const currentTime =
      current?.submittedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (
      !current ||
      submission.attemptNumber > current.attemptNumber ||
      (submission.attemptNumber === current.attemptNumber &&
        (time > currentTime ||
          (time === currentTime &&
            submission.id.localeCompare(current.id) > 0)))
    ) {
      byStudent.set(submission.studentId, submission);
    }
  }
  return result;
}

export function assignmentParticipation<T extends EffectiveSubmission>(
  studentIds: Set<string>,
  latestByStudent: Map<string, T>,
  dueAt: Date | null,
  now: Date,
) {
  const submissions = [...latestByStudent.values()].filter((submission) =>
    studentIds.has(submission.studentId),
  );
  const unsubmittedCount = studentIds.size - submissions.length;
  return {
    submissions,
    unsubmittedCount,
    overdueCount: dueAt !== null && dueAt <= now ? unsubmittedCount : 0,
    pendingReviewCount: submissions.filter(
      (submission) => submission.status === "PENDING_REVIEW",
    ).length,
    historicalSubmittedCount: latestByStudent.size - submissions.length,
  };
}
