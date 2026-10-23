import type { ClassroomStatus } from "@prisma/client";
export const CLASSROOM_STATUS_LABELS: Record<ClassroomStatus, string> = {
  ACTIVE: "授课中",
  COMPLETED: "已结课",
  CLOSED: "已关闭",
  ARCHIVED: "历史解散",
};

export function classroomStatusLabel(status: string): string {
  return (
    Object.entries(CLASSROOM_STATUS_LABELS).find(
      ([key]) => key === status,
    )?.[1] ?? "未知状态"
  );
}
