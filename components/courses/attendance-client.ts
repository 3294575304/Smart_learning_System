export const attendanceLabels: Record<string, string> = {
  PRESENT: "正常出勤",
  LATE: "迟到",
  EARLY_LEAVE: "早退",
  LEAVE: "请假",
  ABSENT: "缺勤",
  PENDING: "待确认",
};

export const sessionLabels: Record<string, string> = {
  SCHEDULED: "待开放",
  OPEN: "签到中",
  CLOSED: "已结算",
  CANCELLED: "已取消",
};

export interface AttendanceRecordRow {
  id: string;
  studentId: string;
  currentStatus: string;
  currentRevisionNumber: number;
  student: {
    profile: { studentNo: string | null; displayName: string | null } | null;
  };
}

export interface AttendanceSessionRow {
  id: string;
  title: string;
  status: string;
  revision: number;
  startsAt: string;
  signInOpensAt: string;
  signInClosesAt: string;
  lateAfter: string;
  createdAt: string;
  classroom: { name: string };
  records: AttendanceRecordRow[];
}

export interface AttendanceWorkspaceData {
  sessions: AttendanceSessionRow[];
  summaries: Array<{
    studentId: string;
    studentNo: string | null;
    displayName: string;
    denominator: number;
    rate: string | null;
  }>;
}

export async function requestAttendanceApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as {
    success: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || !payload.success || payload.data === undefined)
    throw new Error(payload.error ?? "请求失败。");
  return payload.data;
}
