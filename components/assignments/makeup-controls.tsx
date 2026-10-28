"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorDialog } from "./editor-dialog";
import { requestAssignmentApi } from "./request-api";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";

type Profile = { displayName: string; studentNo: string | null } | null;
interface Grant {
  id: string;
  studentId: string;
  kind: string;
  status: string;
  expiresAt: Date;
  reason: string;
  student: { profile: Profile };
}
interface Data {
  id: string;
  status: string;
  dueAt: Date | null;
  publishedAt: Date | null;
  classroom: {
    status: string;
    memberships: Array<{ studentId: string; student: { profile: Profile } }>;
  };
  _count: { submissions: number };
  makeupGrants: Grant[];
}
function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function AssignmentMakeupControls({ data }: { data: Data }) {
  const router = useRouter();
  const [mode, setMode] = useState<"extend" | "grant" | "revoke" | null>(null);
  const [target, setTarget] = useState<Grant | null>(null);
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const now = Date.now();
  useEffect(() => {
    if (mode !== null) return;
    const deadlines = [
      data.dueAt,
      ...data.makeupGrants
        .filter((g) => g.status === "ACTIVE")
        .map((g) => g.expiresAt),
    ].filter(
      (d): d is Date => d !== null && new Date(d).getTime() > Date.now(),
    );
    if (!deadlines.length) return;
    const timer = window.setTimeout(
      () => router.refresh(),
      Math.min(
        2147483647,
        Math.max(
          100,
          Math.min(...deadlines.map((d) => new Date(d).getTime())) -
            Date.now() +
            100,
        ),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [data.dueAt, data.makeupGrants, mode, router]);
  const blocked =
    data.status !== "PUBLISHED" || data.classroom.status !== "ACTIVE"
      ? "仅授课中班级的已发布作业可调整期限或开放补交"
      : data._count.submissions
        ? "成绩及答案已公布，不能延期或开放补交"
        : !data.publishedAt ||
            new Date(data.publishedAt).getTime() > now ||
            !data.dueAt
          ? "作业尚未开放或未设置截止时间"
          : null;
  const memberIds = new Set(data.classroom.memberships.map((m) => m.studentId));
  const active = (g: Grant) =>
    g.status === "ACTIVE" &&
    new Date(g.expiresAt).getTime() > now &&
    !blocked &&
    memberIds.has(g.studentId);
  const grantedIds = new Set(
    data.makeupGrants.filter(active).map((g) => g.studentId),
  );
  const members = data.classroom.memberships
    .filter((m) =>
      `${m.student.profile?.displayName ?? ""} ${m.student.profile?.studentNo ?? ""}`.includes(
        keyword.trim(),
      ),
    )
    .sort((a, b) =>
      (a.student.profile?.studentNo ?? a.studentId).localeCompare(
        b.student.profile?.studentNo ?? b.studentId,
        "zh-CN",
      ),
    );
  function open(next: "extend" | "grant" | "revoke", grant?: Grant) {
    setMode(next);
    setTarget(grant ?? null);
    setDeadline(
      localDate(
        new Date(
          Math.max(
            Date.now(),
            data.dueAt ? new Date(data.dueAt).getTime() : 0,
          ) + 86400000,
        ),
      ),
    );
    setReason("");
    setSelected([]);
    setKeyword("");
    setError(null);
    request.current = null;
  }
  async function submit() {
    if (inFlight.current) return;
    if (reason.trim().length < 2) {
      setError("请填写至少2字的原因");
      return;
    }
    const expires = new Date(deadline);
    if (
      mode !== "revoke" &&
      (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now())
    ) {
      setError("截止时间必须晚于当前时间");
      return;
    }
    if (mode === "extend" && data.dueAt && expires <= new Date(data.dueAt)) {
      setError("新截止时间必须晚于原截止时间");
      return;
    }
    if (mode === "grant" && !selected.length) {
      setError("请选择至少一名学生");
      return;
    }
    const body =
      mode === "revoke"
        ? { reason: reason.trim() }
        : mode === "extend"
          ? { dueAt: expires.toISOString(), reason: reason.trim() }
          : {
              expiresAt: expires.toISOString(),
              reason: reason.trim(),
              studentIds: [...selected].sort(),
            };
    const signature = JSON.stringify({ mode, body });
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const suffix =
        mode === "extend"
          ? "deadline"
          : mode === "grant"
            ? "makeup-grants"
            : `makeup-grants/${target?.id}`;
      const result = await requestAssignmentApi(
        `/api/teacher/assignments/${data.id}/${suffix}`,
        {
          method:
            mode === "extend" ? "PATCH" : mode === "grant" ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            mode === "revoke"
              ? body
              : { ...body, requestId: request.current.id },
          ),
        },
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage(
        mode === "extend"
          ? "本班截止时间已延长，有效个人授权同步延长。"
          : mode === "grant"
            ? "一次性补交／重做授权已开放，学生已收到站内通知。"
            : "授权已撤销，原草稿和历史提交保留。",
      );
      setMode(null);
      markTeacherWorkspaceDirty();
      router.refresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  const title =
    mode === "extend"
      ? "延长本班截止时间"
      : mode === "grant"
        ? "开放一次补交／重做"
        : "撤销补交／重做授权";
  return (
    <section
      className="space-y-3 rounded-xl border bg-white p-4 sm:p-5"
      aria-label="延期与补交管理"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">延期与补交</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            仅调整当前班级；原题目和评分标准保留，不自动扣分。有效补交窗口结束前不能公布成绩。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-10 rounded-lg border px-3 text-sm text-sky-700 disabled:opacity-50"
            disabled={Boolean(blocked)}
            title={blocked ?? undefined}
            onClick={() => open("extend")}
          >
            延长截止
          </button>
          <button
            type="button"
            className="h-10 rounded-lg border px-3 text-sm text-sky-700 disabled:opacity-50"
            disabled={
              Boolean(blocked) ||
              Boolean(data.dueAt && new Date(data.dueAt).getTime() > now)
            }
            title={blocked ?? "截止后可开放一次补交或重做"}
            onClick={() => open("grant")}
          >
            补交／重做
          </button>
        </div>
      </div>
      {blocked ? (
        <p className="text-xs text-slate-500">{blocked}</p>
      ) : data.dueAt && new Date(data.dueAt).getTime() > now ? (
        <p className="text-xs text-slate-500">
          个人授权在统一截止后开放；截止前沿用原重复提交设置。
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {data.makeupGrants.length ? (
        <details>
          <summary className="cursor-pointer text-sm text-sky-700">
            授权记录（{data.makeupGrants.length}条，有效
            {data.makeupGrants.filter(active).length}条）
          </summary>
          <div className="mt-3 max-h-80 overflow-auto rounded-lg border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-sky-50">
                <tr>
                  {["学生", "类型／原因", "实际截止", "状态", "操作"].map(
                    (v) => (
                      <th key={v} className="p-3 font-medium">
                        {v}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.makeupGrants.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="p-3">
                      {g.student.profile?.displayName ?? "学生"}
                      <div className="text-xs text-slate-500">
                        {g.student.profile?.studentNo ?? "—"}
                      </div>
                    </td>
                    <td className="p-3">
                      {g.kind === "REDO" ? "重做" : "补交"}
                      <details className="mt-1 text-xs text-slate-500">
                        <summary className="cursor-pointer">查看原因</summary>
                        <p className="max-w-xs break-words">{g.reason}</p>
                      </details>
                    </td>
                    <td className="p-3 text-xs">
                      {new Date(g.expiresAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="p-3">
                      {g.status === "USED"
                        ? g.kind === "REDO"
                          ? "重做已提交"
                          : "补交已提交"
                        : g.status === "REVOKED"
                          ? "已撤销"
                          : active(g)
                            ? "有效"
                            : "已失效"}
                    </td>
                    <td className="p-3">
                      {active(g) ? (
                        <button
                          type="button"
                          className="text-sky-700 underline"
                          onClick={() => open("revoke", g)}
                        >
                          撤销
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      <EditorDialog
        open={mode !== null}
        title={title}
        busy={pending}
        onClose={() => {
          if (!pending) setMode(null);
        }}
      >
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "grant" ? (
            <>
              <p className="text-xs leading-6 text-slate-600">
                缺交学生获得一次补交；已提交学生获得一次额外重做。每次授权只允许一次正式提交，新草稿不会覆盖原有效提交。
              </p>
              <input
                aria-label="搜索授权学生"
                className="h-10 w-full rounded-lg border px-3 text-sm"
                placeholder="搜索姓名或学号"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>已选{selected.length}人（最多200人）</span>
                <button
                  type="button"
                  className="text-sky-700"
                  onClick={() =>
                    setSelected(
                      members
                        .filter((m) => !grantedIds.has(m.studentId))
                        .slice(0, 200)
                        .map((m) => m.studentId),
                    )
                  }
                >
                  选择当前可授权学生
                </button>
              </div>
              <fieldset
                disabled={pending}
                className="max-h-56 space-y-2 overflow-auto rounded-lg border p-3"
              >
                {members.length ? (
                  members.map((m) => (
                    <label
                      key={m.studentId}
                      className="flex items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(m.studentId)}
                        disabled={grantedIds.has(m.studentId)}
                        onChange={(e) =>
                          setSelected((items) =>
                            e.target.checked
                              ? [...items, m.studentId]
                              : items.filter((id) => id !== m.studentId),
                          )
                        }
                      />
                      <span className="break-words">
                        {m.student.profile?.displayName ?? "学生"} ·{" "}
                        {m.student.profile?.studentNo ?? "无学号"}
                        {grantedIds.has(m.studentId) ? "（已有有效授权）" : ""}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">没有匹配的有效学生。</p>
                )}
              </fieldset>
            </>
          ) : null}
          {mode === "revoke" ? (
            <p className="text-sm">
              撤销{target?.student.profile?.displayName ?? "该学生"}
              的尚未使用授权。草稿、旧提交及授权历史保留。
            </p>
          ) : (
            <label className="block space-y-1 text-sm">
              <span>
                {mode === "extend" ? "新的统一截止时间" : "补交／重做截止时间"}
              </span>
              <input
                aria-label="新的截止时间"
                type="datetime-local"
                required
                className="h-10 w-full min-w-0 rounded-lg border px-3"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={pending}
              />
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span>原因（必填）</span>
            <textarea
              aria-label="调整原因"
              required
              minLength={2}
              maxLength={500}
              className="min-h-20 w-full rounded-lg border p-3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="h-10 rounded-lg border px-4 text-sm"
              disabled={pending}
              onClick={() => setMode(null)}
            >
              取消
            </button>
            <button
              type="submit"
              className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "处理中…" : "确认调整"}
            </button>
          </div>
        </form>
      </EditorDialog>
    </section>
  );
}
