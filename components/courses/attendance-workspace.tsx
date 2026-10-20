"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { correctAttendanceRecordSchema } from "@/services/attendance/schemas";
import {
  attendanceLabels,
  requestAttendanceApi,
  sessionLabels,
  type AttendanceRecordRow,
  type AttendanceSessionRow,
  type AttendanceWorkspaceData,
} from "@/components/courses/attendance-client";
export function AttendanceWorkspace({
  courseId,
  classrooms,
  initialClassroomId,
}: {
  courseId: string;
  classrooms: Array<{ id: string; name: string }>;
  initialClassroomId?: string;
}) {
  const [data, setData] = useState<AttendanceWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [classroomFilter, setClassroomFilter] = useState(
    initialClassroomId ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    session: AttendanceSessionRow;
    record: AttendanceRecordRow;
    status: string;
    reason: string;
  } | null>(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setData(null);
    try {
      setError(null);
      const result = await requestAttendanceApi<AttendanceWorkspaceData>(
        `/api/teacher/courses/${courseId}/attendance${classroomFilter ? `?classroomId=${classroomFilter}` : ""}`,
      );
      if (revision === loadRevision.current) setData(result);
    } catch (caught) {
      if (revision === loadRevision.current)
        setError(caught instanceof Error ? caught.message : "加载失败。");
    }
  }, [courseId, classroomFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  function correct(session: AttendanceSessionRow, record: AttendanceRecordRow) {
    setEditing({
      session,
      record,
      status:
        record.currentStatus === "PENDING" ? "PRESENT" : record.currentStatus,
      reason: "",
    });
    setError(null);
  }
  async function saveCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const { session, record } = editing;
    const input = correctAttendanceRecordSchema.safeParse({
      status: editing.status,
      reason: editing.reason,
      expectedRevisionNumber: record.currentRevisionNumber,
    });
    if (!input.success) {
      setError("请选择有效出勤状态并填写纠正原因。");
      return;
    }
    setBusy(true);
    try {
      await requestAttendanceApi(
        `/api/teacher/attendance-sessions/${session.id}/records/${record.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.data),
        },
      );
      await load();
      setEditing(null);
      setMessage("出勤记录已纠正，原记录与修正原因保留。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "纠正失败。");
    } finally {
      setBusy(false);
    }
  }
  const closedSessionCount =
    data?.sessions.filter((session) => session.status === "CLOSED").length ?? 0;
  return (
    <div className="space-y-6">
      <label className="block rounded-xl border bg-white p-4 text-sm">
        查看班级
        <select
          aria-label="查看出勤班级"
          value={classroomFilter}
          onChange={(e) => {
            setClassroomFilter(e.target.value);
            setEditing(null);
          }}
          className="ml-3 rounded-md border p-2"
        >
          <option value="">全部班级</option>
          {classrooms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {message && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {message}
        </p>
      )}
      {editing && (
        <form
          onSubmit={saveCorrection}
          className="space-y-3 rounded-xl border border-sky-200 bg-white p-5"
        >
          <h2 className="font-semibold">
            纠正出勤 · {editing.record.student.profile?.displayName ?? "学生"}
          </h2>
          <label className="block text-sm">
            出勤状态
            <select
              value={editing.status}
              disabled={busy}
              onChange={(e) =>
                setEditing({ ...editing, status: e.target.value })
              }
              className="ml-3 rounded-md border p-2"
            >
              {Object.entries(attendanceLabels)
                .filter(([value]) => value !== "PENDING")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            纠正原因
            <input
              required
              maxLength={500}
              disabled={busy}
              value={editing.reason}
              onChange={(e) =>
                setEditing({ ...editing, reason: e.target.value })
              }
              className="mt-1 block w-full rounded-md border p-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={busy}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white"
            >
              保存纠正
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </form>
      )}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">签到场次与明细</h2>
        {!data ? (
          <p className="mt-3 text-sm text-gray-500">正在加载…</p>
        ) : data.sessions.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">暂无签到场次。</p>
        ) : (
          data.sessions.map((session) => (
            <details className="mt-3 rounded-lg border p-3" key={session.id}>
              <summary className="cursor-pointer font-medium">
                {session.title} · {session.classroom.name} ·{" "}
                {sessionLabels[session.status] ?? session.status}
              </summary>
              {session.records.map((record) => (
                <div
                  className="mt-2 flex items-center justify-between border-t pt-2 text-sm"
                  key={record.id}
                >
                  <span>
                    {record.student.profile?.studentNo ?? "—"}{" "}
                    {record.student.profile?.displayName ?? "未命名"}
                  </span>
                  <button
                    disabled={busy}
                    className="rounded border px-2 py-1"
                    onClick={() => void correct(session, record)}
                  >
                    {attendanceLabels[record.currentStatus] ??
                      record.currentStatus}
                    （纠正）
                  </button>
                </div>
              ))}
            </details>
          ))
        )}
      </section>
      <details className="group rounded-xl border bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">学生出勤汇总</span>
          <span className="text-sm text-slate-500">
            {data
              ? `${data.summaries.length} 人 · 已结束签到 ${closedSessionCount} 场`
              : "加载中…"}
          </span>
          <span className="ml-auto rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 group-open:hidden">
            展开
          </span>
          <span className="ml-auto hidden rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 group-open:inline">
            收起
          </span>
        </summary>
        <div className="border-t p-5">
          <p className="mb-4 text-xs leading-5 text-slate-500">
            “计入出勤率场次”是每位学生计算出勤率时的分母。请假、待确认不计入；场次创建时尚未入班的学生也没有该场记录，因此同一班级的学生可能有不同的计入场次。
          </p>
          {!data ? (
            <p className="text-sm text-slate-500">正在加载出勤汇总…</p>
          ) : data.summaries.length === 0 ? (
            <p className="text-sm text-slate-500">暂无学生出勤记录。</p>
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-lg border">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      学号
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      姓名
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium"
                    >
                      出勤率
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium"
                    >
                      计入出勤率场次
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.summaries.map((row) => (
                    <tr key={row.studentId} className="hover:bg-sky-50/50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {row.studentNo ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {row.displayName}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {row.rate === null ? "暂无有效分母" : `${row.rate}%`}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-slate-600 tabular-nums">
                        {row.denominator} 场
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
