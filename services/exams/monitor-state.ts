export const examAttendanceLabels = {
  NOT_STARTED: "未开考",
  NOT_ENTERED: "未进入",
  ABSENT: "未参加",
  IN_PROGRESS: "作答中",
  COLLECTING: "待收卷",
  SUBMITTED: "已交卷",
  AUTO_SUBMITTED: "自动收卷",
  CLOSED: "作答已关闭",
  CANCELLED: "考试已取消",
} as const;

export function examAttendanceState(input: {
  cancelled: boolean;
  started: boolean;
  ended: boolean;
  classroomActive: boolean;
  submission?: { status: string; reason: string | null };
}): keyof typeof examAttendanceLabels {
  if (input.cancelled) return "CANCELLED";
  if (input.submission && input.submission.status !== "IN_PROGRESS") {
    return input.submission.reason === "TIME_UP" ||
      input.submission.reason === "SWITCH_LIMIT"
      ? "AUTO_SUBMITTED"
      : "SUBMITTED";
  }
  if (!input.started) return "NOT_STARTED";
  if (input.submission && input.ended) return "COLLECTING";
  if (!input.classroomActive) return "CLOSED";
  if (input.submission) return "IN_PROGRESS";
  return input.ended ? "ABSENT" : "NOT_ENTERED";
}
