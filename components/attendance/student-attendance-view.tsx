"use client";
import { useEffect, useRef, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import { attendanceSignInState } from "@/services/student-experience/task-policy";
type RecordView = {
  id: string;
  currentStatus: string;
  signedAt: Date | null;
  session: {
    id: string;
    title: string;
    status: string;
    startsAt: Date;
    signInOpensAt: Date | string;
    signInClosesAt: Date | string;
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
  courseId,
  classroomId,
}: {
  initialRecords: RecordView[];
  rate: string | null;
  denominator: number;
  courseId?: string;
  classroomId?: string;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [summary, setSummary] = useState({ rate, denominator });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const requestInFlight = useRef(false);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setRecords(initialRecords), [initialRecords]);
  async function reload() {
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    if (classroomId) params.set("classroomId", classroomId);
    const attendanceUrl = `/api/student/attendance?${params}`;
    const result = await requestApi<{
      records: RecordView[];
      summary: { rate: string | null; denominator: number };
    }>(attendanceUrl);
    if (result.success) {
      setRecords(result.data.records);
      setSummary(result.data.summary);
      setError(null);
    } else setError("记录更新失败，请点击刷新记录重试。" + result.error);
  }
  async function sign(sessionId: string) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(sessionId);
    setError(null);
    setNotice(null);
    try {
      const response = await requestApi<{
        record: { currentStatus: string; signedAt: Date | string | null };
      }>(`/api/student/attendance/${encodeURIComponent(sessionId)}/sign`, {
        method: "POST",
      });
      if (!response.success) {
        setError(response.error);
        return;
      }
      setNotice("签到成功。");
      setRecords((current) =>
        current.map((record) =>
          record.session.id === sessionId
            ? {
                ...record,
                currentStatus: response.data.record.currentStatus,
                signedAt: response.data.record.signedAt
                  ? new Date(response.data.record.signedAt)
                  : null,
              }
            : record,
        ),
      );
      await reload();
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  }
  return (
    <div className="space-y-4">
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <button
        className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50"
        disabled={pending !== null}
        onClick={() => {
          setPending("refresh");
          void reload().finally(() => setPending(null));
        }}
        type="button"
      >
        {pending === "refresh" ? "刷新中…" : "刷新记录"}
      </button>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">出勤汇总</h2>
        <p className="mt-2 text-2xl font-semibold">
          {summary.rate === null ? "暂无已完成的有效课堂" : `${summary.rate}%`}
        </p>
        <p className="text-sm text-gray-500">
          请假和取消场次不进入分母；共 {summary.denominator} 次有效课堂。
        </p>
      </div>
      {records.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          暂无签到记录。
        </div>
      ) : (
        records.map((record) => (
          <article
            className="rounded-xl border border-slate-200 bg-white p-4"
            key={record.id}
          >
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
                {now > 0 &&
                attendanceSignInState(record.session, new Date(now)) ===
                  "AVAILABLE" &&
                record.currentStatus === "PENDING" ? (
                  <button
                    className="mt-2 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void sign(record.session.id)}
                  >
                    {pending === record.session.id ? "签到中…" : "立即签到"}
                  </button>
                ) : record.currentStatus === "PENDING" && now > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {attendanceSignInState(record.session, new Date(now)) ===
                    "UPCOMING"
                      ? "尚未到签到时间"
                      : "签到已结束"}
                  </p>
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
