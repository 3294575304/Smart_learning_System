export function assignmentDraftAction(
  assignment: {
    status: string;
    publishedAt: Date | null;
    classroom: { status: string };
  },
  now = new Date(),
) {
  if (
    assignment.status === "DRAFT" &&
    assignment.classroom.status !== "ARCHIVED"
  )
    return "DELETE_DRAFT";
  if (
    assignment.status === "PUBLISHED" &&
    assignment.classroom.status === "ACTIVE" &&
    assignment.publishedAt &&
    assignment.publishedAt > now
  )
    return "CANCEL_SCHEDULE";
  return null;
}

export function canRevokeAssignment(
  assignment: {
    status: string;
    publishedAt: Date | null;
    classroom: { status: string };
  },
  now = new Date(),
) {
  return (
    ["PUBLISHED", "CLOSED"].includes(assignment.status) &&
    assignment.classroom.status !== "ARCHIVED" &&
    assignment.publishedAt !== null &&
    assignment.publishedAt <= now
  );
}
