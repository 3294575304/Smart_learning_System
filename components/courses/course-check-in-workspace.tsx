"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  attendanceLabels,
  requestAttendanceApi,
  sessionLabels,
  type AttendanceSessionRow,
  type AttendanceRecordRow,
  type AttendanceWorkspaceData,
} from "@/components/courses/attendance-client";
import { withClassroomQuery } from "@/lib/course-classroom";
import { correctAttendanceRecordSchema } from "@/services/attendance/schemas";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function CourseCheckInWorkspace({
  courseId,
  classroom,
}: {
  courseId: string;
  classroom: { id: string; name: string };
}) {
  const [data, setData] = useState<AttendanceWorkspaceData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    record: AttendanceRecordRow;
    status: string;
    reason: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await requestAttendanceApi<AttendanceWorkspaceData>(
        withClassroomQuery(
          `/api/teacher/courses/${courseId}/attendance`,
          classroom.id,
        ),
        { cache: "no-store" },
      );
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "签到信息加载失败。");
    }
  }, [courseId, classroom.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (editing || !data?.sessions.some((session) => session.status === "OPEN"))
      return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [data, editing, load]);

  const newestSession = data?.sessions.reduce<AttendanceSessionRow | null>(
    (latest, session) =>
      !latest || session.createdAt > latest.createdAt ? session : latest,
    null,
  );
  const currentSession =
    data?.sessions.find((session) => session.id === selectedSessionId) ??
    data?.sessions.find((session) => session.status === "OPEN") ??
    newestSession;

  async function publish(form: FormData) {
    if (busy) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const startsAt = new Date(String(form.get("startsAt")));
      const signInOpensAt = new Date(startsAt.getTime() - 10 * 60_000);
      const signInClosesAt = new Date(startsAt.getTime() + 20 * 60_000);
      const created = await requestAttendanceApi<{
        id: string;
        revision: number;
      }>(`/api/teacher/courses/${courseId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: classroom.id,
          title: String(form.get("title")),
          startsAt,
          signInOpensAt,
          lateAfter: new Date(startsAt.getTime() + 10 * 60_000),
          signInClosesAt,
        }),
      });
      setSelectedSessionId(created.id);
      const now = new Date();
      let autoOpenError: string | null = null;
      if (now >= signInOpensAt && now <= signInClosesAt) {
        try {
          await requestAttendanceApi(
            `/api/teacher/attendance-sessions/${created.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "OPEN",
                expectedRevision: created.revision,
              }),
            },
          );
          setMessage("签到已发布并开放。");
        } catch (caught) {
          setMessage("签到场次已创建，请在开放时间内点击“开放签到”。");
          autoOpenError =
            caught instanceof Error ? caught.message : "自动开放签到失败。";
        }
      } else {
        setMessage("签到场次已创建，请在开放时间内点击“开放签到”。");
      }
      await load();
      if (autoOpenError) setError(autoOpenError);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布签到失败。");
    } finally {
      setBusy(false);
    }
  }

  async function update(action: "OPEN" | "CLOSE" | "CANCEL") {
    if (!currentSession || busy) return;
    if (
      action !== "OPEN" &&
      !window.confirm(
        action === "CLOSE"
          ? "确认结束签到并结算未签到学生的缺勤记录？"
          : "确认取消本次签到场次？",
      )
    )
      return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await requestAttendanceApi(
        `/api/teacher/attendance-sessions/${currentSession.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expectedRevision: currentSession.revision,
          }),
        },
      );
      await load();
      setMessage(
        action === "CLOSE"
          ? "签到已结束，缺勤记录已结算。"
          : "签到场次状态已更新。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "签到操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSession || !editing || busy) return;
    const input = correctAttendanceRecordSchema.safeParse({
      status: editing.status,
      reason: editing.reason,
      expectedRevisionNumber: editing.record.currentRevisionNumber,
    });
    if (!input.success) {
      setError("请选择有效的出勤状态并填写修改原因。");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await requestAttendanceApi(
        `/api/teacher/attendance-sessions/${currentSession.id}/records/${editing.record.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.data),
        },
      );
      setEditing(null);
      await load();
      setMessage("出勤状态已修改，修改原因和原记录已保留。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "出勤状态修改失败。");
    } finally {
      setBusy(false);
    }
  }

  const signedCount =
    currentSession?.records.filter((record) =>
      ["PRESENT", "LATE", "EARLY_LEAVE"].includes(record.currentStatus),
    ).length ?? 0;
  const pendingCount =
    currentSession?.records.filter(
      (record) => record.currentStatus === "PENDING",
    ).length ?? 0;

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {message}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void load()}
          >
            重试加载
          </button>
        </div>
      )}
      <form
        className="rounded-xl border bg-white p-5"
        action={(form) => void publish(form)}
      >
        <h2 className="font-semibold">发布签到</h2>
        <p className="mt-1 text-sm text-slate-500">班级：{classroom.name}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            场次名称
            <input
              name="title"
              required
              maxLength={120}
              disabled={busy}
              placeholder="例如：第 3 次课签到"
              className="rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            上课时间
            <input
              name="startsAt"
              required
              type="datetime-local"
              disabled={busy}
              className="rounded-md border px-3 py-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "发布中…" : "发布签到"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          上课前 10 分钟可开放签到；上课后 10 分钟记为迟到，20 分钟后截止。
        </p>
      </form>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">本次签到</h2>
            <p className="mt-1 text-xs text-slate-500">
              显示当前班级最近创建的场次，发布后会显示新场次。
            </p>
          </div>
          <Link
            className="text-sm text-sky-700 underline"
            href={withClassroomQuery(
              `/teacher/courses/${courseId}/attendance`,
              classroom.id,
            )}
          >
            查看出勤台账
          </Link>
        </div>
        {!data ? (
          <p className="mt-4 text-sm text-slate-500">正在加载本次签到…</p>
        ) : !currentSession ? (
          <p className="mt-4 text-sm text-slate-500">
            当前班级还没有签到场次，请先发布签到。
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-medium text-slate-900">
                  {currentSession.title}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-sky-700">
                  {sessionLabels[currentSession.status] ??
                    currentSession.status}
                </span>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-500">上课时间</dt>
                  <dd>{formatDateTime(currentSession.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">签到开放</dt>
                  <dd>{formatDateTime(currentSession.signInOpensAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">迟到起点</dt>
                  <dd>{formatDateTime(currentSession.lateAfter)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">签到截止</dt>
                  <dd>{formatDateTime(currentSession.signInClosesAt)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-slate-700">
                应到 {currentSession.records.length} 人 · 已签到 {signedCount}{" "}
                人 · 待签到 {pendingCount} 人
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentSession.status === "SCHEDULED" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("OPEN")}
                  className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  开放签到
                </button>
              )}
              {currentSession.status === "OPEN" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("CLOSE")}
                  className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  结束并结算缺勤
                </button>
              )}
              {!["CLOSED", "CANCELLED"].includes(currentSession.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("CANCEL")}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                >
                  取消场次
                </button>
              )}
            </div>
            <details className="rounded-lg border">
              <summary className="cursor-pointer p-3 text-sm font-medium">
                查看本次学生签到明细（点击状态可修改）
              </summary>
              <div className="max-h-96 overflow-auto border-t">
                {currentSession.records.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">
                    发布时班级暂无在读学生。
                  </p>
                ) : (
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">
                          学号
                        </th>
                        <th scope="col" className="px-3 py-2 text-left">
                          姓名
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          状态
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {currentSession.records.map((record) => (
                        <tr key={record.id}>
                          <td className="px-3 py-2">
                            {record.student.profile?.studentNo ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {record.student.profile?.displayName ?? "未命名"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editing?.record.id === record.id ? (
                              <form
                                onSubmit={saveCorrection}
                                className="flex flex-wrap items-center justify-end gap-2"
                              >
                                <select
                                  aria-label={`修改${record.student.profile?.displayName ?? "学生"}的出勤状态`}
                                  className="rounded border px-2 py-1"
                                  value={editing.status}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setEditing({
                                      ...editing,
                                      status: event.target.value,
                                    })
                                  }
                                >
                                  {Object.entries(attendanceLabels)
                                    .filter(([status]) => status !== "PENDING")
                                    .map(([status, label]) => (
                                      <option value={status} key={status}>
                                        {label}
                                      </option>
                                    ))}
                                </select>
                                <input
                                  aria-label="修改原因"
                                  placeholder="填写修改原因"
                                  required
                                  maxLength={500}
                                  className="min-w-36 rounded border px-2 py-1"
                                  value={editing.reason}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setEditing({
                                      ...editing,
                                      reason: event.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="submit"
                                  disabled={busy}
                                  className="rounded bg-sky-600 px-2 py-1 text-white disabled:opacity-50"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setEditing(null)}
                                  className="rounded border px-2 py-1"
                                >
                                  取消
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  busy || currentSession.status === "CANCELLED"
                                }
                                onClick={() => {
                                  setError(null);
                                  setEditing({
                                    record,
                                    status:
                                      record.currentStatus === "PENDING"
                                        ? "PRESENT"
                                        : record.currentStatus,
                                    reason: "",
                                  });
                                }}
                                className="rounded px-2 py-1 text-sky-700 underline-offset-2 hover:underline disabled:text-slate-500"
                              >
                                {attendanceLabels[record.currentStatus] ??
                                  record.currentStatus}
                                （修改）
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
