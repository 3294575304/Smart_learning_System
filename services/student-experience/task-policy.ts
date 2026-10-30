import type { StudentAssignmentListItem } from "@/services/assignments/types";
export function studentAssignmentState(
  assignment: Pick<
    StudentAssignmentListItem,
    | "dueAt"
    | "latestSubmissionId"
    | "inProgressSubmissionId"
    | "historyOnly"
    | "makeupKind"
  >,
  now: Date,
) {
  if (assignment.historyOnly)
    return assignment.latestSubmissionId ? "SUBMITTED" : "EXPIRED";
  if (assignment.inProgressSubmissionId && assignment.dueAt > now)
    return "IN_PROGRESS";
  if (assignment.makeupKind && assignment.dueAt > now) return "PENDING";
  if (assignment.latestSubmissionId) return "SUBMITTED";
  if (assignment.dueAt <= now) return "EXPIRED";
  return "PENDING";
}
export function attendanceSignInState(
  session: {
    status: string;
    signInOpensAt: Date | string;
    signInClosesAt: Date | string;
  },
  now: Date,
): "AVAILABLE" | "UPCOMING" | "ENDED" {
  if (session.status !== "OPEN") return "ENDED";
  const opens = new Date(session.signInOpensAt).getTime();
  const closes = new Date(session.signInClosesAt).getTime();
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || opens > closes)
    return "ENDED";
  if (now.getTime() < opens) return "UPCOMING";
  return now.getTime() <= closes ? "AVAILABLE" : "ENDED";
}
