"use client";
import { classroomStatusLabel } from "@/services/classrooms/presentation";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  groupCourseGradebooks,
  type GradebookClassroomSummary,
  type CourseGradebookSummary,
} from "@/services/gradebook/overview";

interface Overview {
  currentScheme: { id: string; versionNumber: number } | null;
  classrooms: GradebookClassroomSummary[];
  gradebooks: CourseGradebookSummary[];
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok || !payload.success)
    throw new Error(payload.error ?? "请求失败，请重试。");
  return payload.data as T;
}
const statuses = [
  { value: "all", label: "全部" },
  { value: "missing", label: "待建立" },
  { value: "pending", label: "待发布" },
  { value: "published", label: "已发布" },
];
const secondary =
  "inline-flex items-center justify-center rounded-lg border bg-white px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600";
export function CourseGradebooksWorkspace({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const base = `/teacher/courses/${courseId}`;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await json<Overview>(
          `/api/teacher/courses/${courseId}/gradebooks?view=overview`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }, [courseId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(classroomId: string) {
    if (busy || !data?.currentScheme) return;
    setBusy(classroomId);
    setError(null);
    try {
      const created = await json<{ id: string }>(
        `/api/teacher/courses/${courseId}/gradebooks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classroomId,
            expectedSchemeId: data.currentScheme.id,
          }),
        },
      );
      router.push(`${base}/gradebook/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "建立失败，请重试。");
      setBusy(null);
    }
  }
  const rows = data
    ? groupCourseGradebooks(
        data.classrooms,
        data.gradebooks,
        data.currentScheme?.id ?? null,
      )
    : [];
  const visible = rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      row.classroom.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section className="space-y-4" aria-busy={loading}>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button onClick={() => void load()} className="ml-3 underline">
            刷新重试
          </button>
        </div>
      )}
      {loading ? (
        <div
          role="status"
          className="rounded-xl border bg-white p-8 text-center"
        >
          正在加载班级台账…
        </div>
      ) : (
        data && (
          <>
            <div className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    班级台账{" "}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {rows.length} 个班级
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {data.currentScheme
                      ? `当前考核方案 v${data.currentScheme.versionNumber} · 每个班级独立维护成绩`
                      : "尚未发布考核方案，发布后即可建立班级台账。"}
                  </p>
                </div>
                <Link className={secondary} href={`${base}/assessment-scheme`}>
                  {data.currentScheme ? "查看考核方案" : "设置考核方案"} →
                </Link>
              </div>
              <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1" aria-label="台账状态">
                  {statuses.map((item) => (
                    <button
                      key={item.value}
                      aria-pressed={status === item.value}
                      onClick={() => setStatus(item.value)}
                      className={`rounded-lg px-3 py-2 text-sm transition ${status === item.value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-sky-50"}`}
                    >
                      {item.label}{" "}
                      <span className="ml-1">
                        {item.value === "all"
                          ? rows.length
                          : rows.filter((row) => row.status === item.value)
                              .length}
                      </span>
                    </button>
                  ))}
                </div>
                <input
                  aria-label="搜索班级"
                  placeholder="搜索班级名称"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm sm:w-64"
                />
              </div>
            </div>
            {!rows.length ? (
              <div className="rounded-xl border bg-white p-10 text-center">
                <p className="mb-4 text-slate-500">
                  尚未关联教学班级，请先在课程中管理班级。
                </p>
                <Link className={secondary} href={base}>
                  返回课程管理班级 →
                </Link>
              </div>
            ) : !visible.length ? (
              <div className="rounded-xl border bg-white p-10 text-center">
                <p className="text-slate-500">没有符合条件的班级</p>
                <button
                  className={`${secondary} mt-4`}
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  重置筛选
                </button>
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-xl border bg-white">
                {visible.map((row) => (
                  <article key={row.classroom.id} className="p-5 sm:p-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold break-words">
                            {row.classroom.name}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs ${row.status === "published" ? "bg-emerald-50 text-emerald-700" : row.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                          >
                            {
                              statuses.find((item) => item.value === row.status)
                                ?.label
                            }
                          </span>
                          {!row.linked && (
                            <span className="text-xs text-slate-500">
                              已解除课程关联
                            </span>
                          )}
                          {row.classroom.status !== "ACTIVE" && (
                            <span className="text-xs text-slate-500">
                              {classroomStatusLabel(row.classroom.status)}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {row.classroom.studentCount} 名在读学生
                          {row.primary &&
                            ` · 考核方案 v${row.primary.scheme.versionNumber}`}
                          {row.primary?.currentPublication &&
                            ` · 正式成绩 v${row.primary.currentPublication.versionNumber}`}
                        </p>
                        {row.primary?.currentPublication && (
                          <p className="mt-1 text-xs text-slate-500">
                            发布于{" "}
                            {new Date(
                              row.primary.currentPublication.publishedAt,
                            ).toLocaleString("zh-CN", {
                              timeZone: "Asia/Shanghai",
                            })}
                          </p>
                        )}
                        {row.usesPreviousScheme && (
                          <p className="mt-2 text-xs text-amber-700">
                            此台账沿用历史考核方案；按新方案建立后，历史成绩仍保留。
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {row.primary?.currentPublication && (
                          <a
                            className={secondary}
                            href={`/api/teacher/gradebooks/${row.primary.id}/export`}
                          >
                            下载成绩单
                          </a>
                        )}
                        {row.primary && (
                          <Link
                            className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                            href={`${base}/gradebook/${row.primary.id}`}
                          >
                            进入台账 →
                          </Link>
                        )}
                        {row.canCreate && (
                          <button
                            disabled={!!busy}
                            onClick={() => void create(row.classroom.id)}
                            className={`${secondary} disabled:opacity-50`}
                          >
                            {busy === row.classroom.id
                              ? "正在建立…"
                              : row.primary
                                ? "按新方案建立"
                                : "建立台账"}
                          </button>
                        )}
                      </div>
                    </div>
                    {!!row.history.length && (
                      <details className="mt-4 border-t pt-3">
                        <summary className="cursor-pointer text-sm text-sky-700">
                          历史台账（{row.history.length}）
                        </summary>
                        <div className="mt-2 space-y-2">
                          {row.history.map((book) => (
                            <div
                              key={book.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"
                            >
                              <span>
                                考核方案 v{book.scheme.versionNumber} ·{" "}
                                {book.currentPublication
                                  ? `正式成绩 v${book.currentPublication.versionNumber}`
                                  : "未发布成绩"}
                              </span>
                              <Link
                                className={secondary}
                                href={`${base}/gradebook/${book.id}`}
                              >
                                查看历史台账 →
                              </Link>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
