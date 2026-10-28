import type { AssignmentLifecycle } from "./capabilities";

export interface WorkGrant {
  id: string;
  kind: "MAKEUP" | "REDO";
  status: string;
  expiresAt: Date;
}
export function studentWorkWindow(
  assignment: AssignmentLifecycle,
  grants: readonly WorkGrant[],
  hasPublishedResults: boolean,
  now = new Date(),
) {
  const grant = grants.find((g) => g.status === "ACTIVE" && g.expiresAt > now);
  const reason =
    assignment.classroom.status !== "ACTIVE"
      ? "班级已结课或已关闭，不能继续作答；已保存内容仍保留"
      : assignment.status !== "PUBLISHED" ||
          !assignment.publishedAt ||
          assignment.publishedAt > now
        ? "作业尚未开放或已关闭，不能继续作答"
        : hasPublishedResults
          ? "成绩及答案已公布，不能继续作答"
          : !assignment.dueAt
            ? "作业缺少截止时间，暂不能作答"
            : !grant && assignment.dueAt <= now
              ? "作业已截止，不能继续保存或提交；请联系教师申请补交"
              : null;
  return {
    canWrite: reason === null,
    reason,
    grant: reason ? null : (grant ?? null),
    dueAt:
      grant && !reason && assignment.dueAt && grant.expiresAt > assignment.dueAt
        ? grant.expiresAt
        : assignment.dueAt,
  };
}
