export interface AssignmentLifecycle {
  activeMakeupCount?: number;
  status: string;
  publishedAt: Date | null;
  dueAt: Date | null;
  classroom: { status: string };
}

/** Shared state rules; submission-level grading checks remain independent. */
export function assignmentCapabilities(
  assignment: AssignmentLifecycle,
  now = new Date(),
) {
  const archived =
    assignment.status === "ARCHIVED" ||
    assignment.classroom.status === "ARCHIVED";
  const gradingBlockedReason = archived
    ? "已归档记录只读，不能继续批改或修改成绩"
    : !["PUBLISHED", "CLOSED"].includes(assignment.status)
      ? "当前作业尚未发布，不能批改或公布成绩"
      : null;
  const teachingEnded = ["COMPLETED", "CLOSED"].includes(
    assignment.classroom.status,
  );
  const publicationBlockedReason =
    gradingBlockedReason ??
    (!teachingEnded
      ? !assignment.publishedAt || assignment.publishedAt > now
        ? "作业尚未开放，不能公布成绩"
        : !assignment.dueAt
          ? "作业缺少截止时间，暂不能公布成绩"
          : assignment.dueAt > now
            ? "作业尚未截止，暂不能公布成绩"
            : (assignment.activeMakeupCount ?? 0) > 0
              ? "仍有可使用的补交或重做授权，暂不能公布成绩"
              : null
      : null);
  return {
    readOnly: archived,
    canEditDraft:
      assignment.status === "DRAFT" && assignment.classroom.status === "ACTIVE",
    canGrade: gradingBlockedReason === null,
    gradingBlockedReason,
    canPublishResults: publicationBlockedReason === null,
    publicationBlockedReason,
  };
}
