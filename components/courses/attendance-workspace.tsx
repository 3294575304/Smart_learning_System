"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { correctAttendanceRecordSchema } from "@/services/attendance/schemas";
const attendanceLabels: Record<string, string> = {
  PRESENT: "正常出勤",
  LATE: "迟到",
  EARLY_LEAVE: "早退",
  LEAVE: "请假",
  ABSENT: "缺勤",
  PENDING: "待确认",
};
const sessionLabels: Record<string, string> = {
  SCHEDULED: "待开放",
  OPEN: "签到中",
  CLOSED: "已结算",
  CANCELLED: "已取消",
};
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
  const [classroomFilter, setClassroomFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    session: Session;
    record: RecordRow;
    status: string;
    reason: string;
  } | null>(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setData(null);
    try {
      setError(null);
      const result = (await json(
        `/api/teacher/courses/${courseId}/attendance${classroomFilter ? `?classroomId=${classroomFilter}` : ""}`,
      )) as Data;
      if (revision === loadRevision.current) setData(result);
    } catch (caught) {
      if (revision === loadRevision.current)
        setError(caught instanceof Error ? caught.message : "加载失败。");
    }
  }, [courseId, classroomFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(form: FormData) {
    if (busy) return;
    setError(null);
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
      setMessage("签到场次已创建。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败。");
    } finally {
      setBusy(false);
    }
  }
  async function update(session: Session, action: string) {
    if (busy) return;
    if (
      ["CLOSE", "CANCEL"].includes(action) &&
      !window.confirm(
        action === "CLOSE"
          ? "确认结束签到并结算未签到学生的缺勤记录？"
          : "确认取消本次签到场次？",
      )
    )
      return;
    setError(null);
    setBusy(true);
    try {
      await json(`/api/teacher/attendance-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedRevision: session.revision }),
      });
      await load();
      setMessage("签到场次状态已更新。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  function correct(session: Session, record: RecordRow) {
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
      await json(
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
            disabled={busy || !classrooms.length}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white"
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
                {session.title} · {session.classroom.name} ·{" "}
                {sessionLabels[session.status] ?? session.status}
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
