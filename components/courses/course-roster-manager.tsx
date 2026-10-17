"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import type { listCourseRoster } from "@/services/course-rosters/service";
import type { RosterMutation } from "@/services/course-rosters/schemas";

type Data = Awaited<ReturnType<typeof listCourseRoster>>;
type Row = Data["items"][number];
type Filter = {
  classroomId: string;
  keyword: string;
  status: string;
  page: number;
};
const labels: Record<string, string> = {
  ACTIVE: "在读",
  PENDING: "待认领",
  REMOVED: "已移出",
};

export function CourseRosterManager({
  courseId,
  initialData,
}: {
  courseId: string;
  initialData: Data;
}) {
  const [data, setData] = useState(initialData),
    [filter, setFilter] = useState<Filter>({
      classroomId: "",
      keyword: "",
      status: "ACTIVE",
      page: 1,
    });
  const [keyword, setKeyword] = useState("");
  const activeRequest = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const firstQuery = useRef(true);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [form, setForm] = useState<{
    mode: "ADD" | "EDIT";
    row?: Row;
    classroomId: string;
    studentNo: string;
    name: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);
  const load = useCallback(
    async (next: Filter) => {
      const requestId = ++activeRequest.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        keyword: next.keyword.trim(),
        status: next.status,
        page: String(next.page),
      });
      if (next.classroomId) params.set("classroomId", next.classroomId);
      const response = await requestApi<Data>(
        `/api/teacher/courses/${courseId}/roster?${params}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (requestId !== activeRequest.current || controller.signal.aborted)
        return;
      if (response.success) setData(response.data);
      else setError(response.error);
      setLoading(false);
    },
    [courseId],
  );
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    void load(filter);
  }, [filter, load]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilter((current) =>
          current.keyword === keyword.trim()
            ? current
            : { ...current, keyword: keyword.trim(), page: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [keyword]);
  useEffect(
    () => () => {
      activeRequest.current += 1;
      requestController.current?.abort();
    },
    [],
  );
  async function mutate(input: RosterMutation) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/teacher/courses/${courseId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw Error(body.error ?? "保存失败");
      setForm(null);
      setConfirm(null);
      setNotice(
        input.action === "EDIT" || input.action === "EDIT_MEMBER"
          ? "名单信息已更新"
          : input.action === "ADD"
            ? "学生已加入名单；未注册学生可按学号与姓名认领"
            : input.action === "REMOVE"
              ? "已移出本班，历史记录保留"
              : "已恢复到本班名单",
      );
      await load(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }
  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.mode === "ADD")
      void mutate({
        action: "ADD",
        classroomId: form.classroomId,
        studentNo: form.studentNo,
        name: form.name,
      });
    else if (form.row?.kind === "MEMBER")
      void mutate({
        action: "EDIT_MEMBER",
        membershipId: form.row.id,
        expectedUpdatedAt: form.row.identityUpdatedAt,
        name: form.name,
      });
    else if (form.row && "identityUpdatedAt" in form.row)
      void mutate({
        action: "EDIT",
        assignmentId: form.row.id,
        expectedUpdatedAt: form.row.identityUpdatedAt,
        studentNo: form.studentNo,
        name: form.name,
      });
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["在读成员", data.counts.active],
          ["待认领", data.counts.pending],
          ["已移出", data.counts.removed],
        ].map(([label, count]) => (
          <div key={label} className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{count}</p>
          </div>
        ))}
      </div>
      <section className="bg-card rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">班级人员名单</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              未认领信息可纠正；已认领学生可纠正姓名，学号保持不变；跨教师共用信息请联系管理员。移出仅解除本班关系，保留历史作业与成绩。
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!data.classrooms.length || busy || loading}
            onClick={() => {
              setError("");
              setForm({
                mode: "ADD",
                classroomId: filter.classroomId || data.classrooms[0]?.id || "",
                studentNo: "",
                name: "",
              });
            }}
          >
            添加学生
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = { ...filter, keyword: keyword.trim(), page: 1 };
            if (next.keyword === filter.keyword && filter.page === 1)
              void load(next);
            else setFilter(next);
          }}
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <select
            aria-label="班级范围"
            className="rounded-lg border p-2 text-sm"
            value={filter.classroomId}
            disabled={busy}
            onChange={(e) =>
              setFilter({
                ...filter,
                classroomId: e.target.value,
                keyword: keyword.trim(),
                page: 1,
              })
            }
          >
            <option value="">全部关联班级</option>
            {data.classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="名单状态"
            className="rounded-lg border p-2 text-sm"
            value={filter.status}
            disabled={busy}
            onChange={(e) =>
              setFilter({
                ...filter,
                status: e.target.value,
                keyword: keyword.trim(),
                page: 1,
              })
            }
          >
            <option value="ACTIVE">当前名单（在读及待认领）</option>
            <option value="PENDING">待认领</option>
            <option value="REMOVED">已移出</option>
            <option value="ALL">全部记录</option>
          </select>
          <input
            aria-label="搜索姓名或学号"
            placeholder="搜索姓名或学号（输入后自动筛选）"
            className="min-w-0 flex-1 rounded-lg border p-2 text-sm sm:min-w-64"
            maxLength={100}
            value={keyword}
            disabled={busy}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
            disabled={
              busy ||
              (!filter.classroomId &&
                filter.status === "ACTIVE" &&
                !keyword &&
                filter.page === 1)
            }
            onClick={() => {
              setKeyword("");
              setFilter({
                classroomId: "",
                keyword: "",
                status: "ACTIVE",
                page: 1,
              });
            }}
          >
            重置筛选
          </button>
        </form>
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-xs text-slate-500"
        >
          {loading
            ? "正在加载所选范围…"
            : error
              ? "名单读取失败，请重试。"
              : `当前范围 ${data.total} 条记录 · 选择后自动切换，搜索支持回车立即筛选。`}
        </p>
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
          >
            {notice}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}{" "}
            <button
              className="underline"
              disabled={loading || busy}
              onClick={() => void load(filter)}
            >
              重新加载名单
            </button>
          </div>
        )}
        {form && (
          <form
            onSubmit={submitForm}
            className="mt-4 space-y-3 rounded-lg border bg-sky-50/70 p-4"
          >
            <h3 className="font-medium">
              {form.mode === "ADD"
                ? "添加学生到班级"
                : form.row?.kind === "MEMBER"
                  ? "纠正学生姓名"
                  : "纠正待认领信息"}
            </h3>
            {form.mode === "ADD" && (
              <label className="block text-sm">
                加入班级
                <select
                  className="mt-1 block w-full rounded-lg border bg-white p-2"
                  value={form.classroomId}
                  onChange={(e) =>
                    setForm({ ...form, classroomId: e.target.value })
                  }
                >
                  {data.classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                学号
                <input
                  required
                  maxLength={50}
                  className="mt-1 block w-full rounded-lg border bg-white p-2"
                  readOnly={form.mode === "EDIT" && form.row?.kind === "MEMBER"}
                  value={form.studentNo}
                  onChange={(e) =>
                    setForm({ ...form, studentNo: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                姓名
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  className="mt-1 block w-full rounded-lg border bg-white p-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
            </div>
            <p className="text-muted-foreground text-xs">
              {form.mode === "ADD"
                ? "已有学生需学号与姓名匹配；新学生创建待认领信息，不生成默认密码。"
                : form.row?.kind === "MEMBER"
                  ? "姓名纠正同步到该学生的账号资料；学号保持不变，历史作答与成绩保留。"
                  : "纠正信息同时更新本教师其他班级中的同一待认领身份。"}
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
              >
                {busy ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setForm(null)}
              >
                取消
              </button>
            </div>
          </form>
        )}
        {confirm && (
          <div
            role="alertdialog"
            aria-label="确认移出名单"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
          >
            <p>
              将 {confirm.name}（{confirm.studentNo}）移出{" "}
              {confirm.classroomName}？
              {confirm.kind === "PENDING"
                ? "该班级的预分配将取消，认领时不再自动加入本班。"
                : "学生将失去本班访问权限。"}
              历史记录保留，可从“已移出”恢复。
            </p>
            <div className="mt-3 flex gap-3">
              <button
                disabled={busy}
                className="rounded-lg bg-red-600 px-3 py-2 text-white"
                onClick={() =>
                  void mutate({
                    action: "REMOVE",
                    kind: confirm.kind,
                    id: confirm.id,
                    expectedUpdatedAt: confirm.updatedAt,
                  })
                }
              >
                {busy ? "处理中…" : "确认移出"}
              </button>
              <button disabled={busy} onClick={() => setConfirm(null)}>
                取消
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 overflow-x-auto" aria-busy={loading}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                {["学号", "姓名", "班级", "状态", "操作"].map((h) => (
                  <th
                    className="px-3 py-3 font-medium whitespace-nowrap"
                    key={h}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !error &&
                data.items.map((r) => (
                  <tr className="border-b" key={r.kind + r.id}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.studentNo || "—"}
                    </td>
                    <td className="px-3 py-3">{r.name}</td>
                    <td className="px-3 py-3">{r.classroomName}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {labels[r.status]}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-3 whitespace-nowrap">
                        {r.canEdit && (
                          <button
                            disabled={busy || loading}
                            className="text-sky-700"
                            onClick={() => {
                              setError("");
                              setForm({
                                mode: "EDIT",
                                row: r,
                                classroomId: r.classroomId,
                                studentNo: r.studentNo,
                                name: r.name,
                              });
                            }}
                          >
                            编辑
                          </button>
                        )}
                        {r.status === "REMOVED" ? (
                          <button
                            disabled={busy || loading}
                            className="text-sky-700"
                            onClick={() =>
                              void mutate({
                                action: "RESTORE",
                                kind: r.kind,
                                id: r.id,
                                expectedUpdatedAt: r.updatedAt,
                              })
                            }
                          >
                            恢复
                          </button>
                        ) : (
                          <button
                            disabled={busy || loading}
                            className="text-red-600"
                            onClick={() => {
                              setError("");
                              setConfirm(r);
                            }}
                          >
                            移出
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!loading && !error && !data.items.length && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {data.classrooms.length
                ? "当前条件下暂无学生，请调整筛选或添加学生。"
                : "请先在课程详情关联一个开课班级。"}
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            共 {data.total} 条班级名单记录 · 第 {data.page} / {data.pages} 页
          </span>
          <div className="flex gap-3">
            <button
              disabled={data.page <= 1 || loading || busy || Boolean(error)}
              onClick={() => setFilter({ ...filter, page: data.page - 1 })}
            >
              上一页
            </button>
            <button
              disabled={
                data.page >= data.pages || loading || busy || Boolean(error)
              }
              onClick={() => setFilter({ ...filter, page: data.page + 1 })}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
