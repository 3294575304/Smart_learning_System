"use client";
import { useState } from "react";
type RecordView = {
  id: string;
  currentStatus: string;
  signedAt: Date | null;
  session: {
    id: string;
    title: string;
    status: string;
    startsAt: Date;
    course: { name: string };
    classroom: { name: string };
  };
  revisions: Array<{
    id: string;
    previousStatus: string;
    newStatus: string;
    reason: string | null;
  }>;
};
const labels: Record<string, string> = {
  PENDING: "未签到/待确认",
  PRESENT: "已签到",
  LATE: "迟到",
  EARLY_LEAVE: "早退",
  LEAVE: "请假",
  ABSENT: "缺勤",
};
export function StudentAttendanceView({
  initialRecords,
  rate,
  denominator,
}: {
  initialRecords: RecordView[];
  rate: string | null;
  denominator: number;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [error, setError] = useState<string | null>(null);
  async function sign(sessionId: string) {
    setError(null);
    const response = await fetch(`/api/student/attendance/${sessionId}/sign`, {
      method: "POST",
    });
    const payload = (await response.json()) as {
      success: boolean;
      error?: string;
    };
    if (!response.ok || !payload.success) {
      setError(payload.error ?? "签到失败。");
      return;
    }
    const list = await fetch("/api/student/attendance");
    const data = (await list.json()) as { data?: { records: RecordView[] } };
    if (data.data) setRecords(data.data.records);
  }
  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">出勤汇总</h2>
        <p className="mt-2 text-2xl font-semibold">
          {rate === null ? "暂无有效分母" : `${rate}%`}
        </p>
        <p className="text-sm text-gray-500">
          请假和取消场次不进入分母；共 {denominator} 个有效场次。
        </p>
      </div>
      {records.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          暂无签到记录。
        </div>
      ) : (
        records.map((record) => (
          <article className="rounded-xl border bg-white p-5" key={record.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-medium">{record.session.title}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {record.session.course.name} · {record.session.classroom.name}{" "}
                  · {new Date(record.session.startsAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">
                  {labels[record.currentStatus] ?? record.currentStatus}
                </p>
                {record.session.status === "OPEN" &&
                record.currentStatus === "PENDING" ? (
                  <button
                    className="mt-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white"
                    onClick={() => void sign(record.session.id)}
                  >
                    立即签到
                  </button>
                ) : null}
              </div>
            </div>
            {record.revisions.length ? (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer">查看变更历史</summary>
                {record.revisions.map((revision) => (
                  <p className="mt-1 text-gray-600" key={revision.id}>
                    {labels[revision.previousStatus]} →{" "}
                    {labels[revision.newStatus]}
                    {revision.reason ? `：${revision.reason}` : ""}
                  </p>
                ))}
              </details>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
