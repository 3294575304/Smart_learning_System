"use client";
import { useCallback, useEffect, useState } from "react";
type RecordRow = {
  id: string;
  studentId: string;
  currentStatus: string;
  currentRevisionNumber: number;
  student: {
    profile: { studentNo: string | null; displayName: string | null } | null;
  };
};
type Session = {
  id: string;
  title: string;
  status: string;
  revision: number;
  startsAt: string;
  classroom: { name: string };
  records: RecordRow[];
};
type Data = {
  sessions: Session[];
  summaries: Array<{
    studentId: string;
    studentNo: string | null;
    displayName: string;
    denominator: number;
    rate: string | null;
  }>;
};
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!response.ok || !payload.success)
    throw new Error(payload.error ?? "请求失败。");
  return payload.data;
}
export function AttendanceWorkspace({
  courseId,
  classrooms,
}: {
  courseId: string;
  classrooms: Array<{ id: string; name: string }>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setError(null);
      setData(
        (await json(`/api/teacher/courses/${courseId}/attendance`)) as Data,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
    }
  }, [courseId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(form: FormData) {
    setBusy(true);
    try {
      const startsAt = new Date(String(form.get("startsAt")));
      const body = {
        classroomId: String(form.get("classroomId")),
        title: String(form.get("title")),
        startsAt,
        signInOpensAt: new Date(startsAt.getTime() - 10 * 60000),
        lateAfter: new Date(startsAt.getTime() + 10 * 60000),
        signInClosesAt: new Date(startsAt.getTime() + 20 * 60000),
      };
      await json(`/api/teacher/courses/${courseId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败。");
    } finally {
      setBusy(false);
    }
  }
  async function update(session: Session, action: string) {
    setBusy(true);
    try {
      await json(`/api/teacher/attendance-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedRevision: session.revision }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  async function correct(session: Session, record: RecordRow) {
    const status = window.prompt(
      "新状态：PRESENT/LATE/EARLY_LEAVE/LEAVE/ABSENT",
      record.currentStatus,
    );
    if (!status) return;
    const reason = window.prompt("纠正原因（必填）");
    if (!reason) return;
    setBusy(true);
    try {
      await json(
        `/api/teacher/attendance-sessions/${session.id}/records/${record.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            reason,
            expectedRevisionNumber: record.currentRevisionNumber,
          }),
        },
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "纠正失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}
      <form
        className="rounded-xl border bg-white p-5"
        action={(form) => void create(form)}
      >
        <h2 className="font-semibold">创建签到场次</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            name="classroomId"
            required
            className="rounded-md border px-3 py-2 text-sm"
          >
            {classrooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            name="title"
            required
            maxLength={120}
            placeholder="场次名称"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="startsAt"
            required
            type="datetime-local"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
          >
            创建（前10分钟开放）
          </button>
        </div>
      </form>
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
                {session.title} · {session.classroom.name} · {session.status}
              </summary>
              <div className="mt-3 flex gap-2">
                {session.status === "SCHEDULED" ? (
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => void update(session, "OPEN")}
                  >
                    开放签到
                  </button>
                ) : null}
                {session.status === "OPEN" ? (
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => void update(session, "CLOSE")}
                  >
                    结束并结算缺勤
                  </button>
                ) : null}
                {!["CLOSED", "CANCELLED"].includes(session.status) ? (
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={() => void update(session, "CANCEL")}
                  >
                    取消场次
                  </button>
                ) : null}
              </div>
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
                    {record.currentStatus}（纠正）
                  </button>
                </div>
              ))}
            </details>
          ))
        )}
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">学生出勤汇总</h2>
        {data?.summaries.map((row) => (
          <p className="mt-2 text-sm" key={row.studentId}>
            {row.studentNo ?? "—"} {row.displayName}：
            {row.rate === null ? "暂无有效分母" : `${row.rate}%`}（
            {row.denominator} 场）
          </p>
        ))}
      </section>
    </div>
  );
}
