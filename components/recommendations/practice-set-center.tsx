"use client";
import Link from "next/link";
import { useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import type { PracticeSetList } from "@/services/practice-sets/types";
export function PracticeSetCenter({
  initialResult,
}: {
  initialResult: PracticeSetList;
}) {
  const [result, setResult] = useState(initialResult);
  const [course, setCourse] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(courseId: string, state: string, page = 1) {
    setBusy(true);
    setError("");
    const query = new URLSearchParams({ page: String(page) });
    if (courseId) query.set("courseId", courseId);
    if (state) query.set("status", state);
    const response = await requestApi<PracticeSetList>(
      `/api/student/practice-sets?${query}`,
      { method: "GET" },
    );
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setCourse(courseId);
    setStatus(state);
    setResult(
      page === 1
        ? response.data
        : {
            ...response.data,
            items: [...result.items, ...response.data.items],
          },
    );
  }
  return (
    <section className="space-y-4" aria-label="我的练习组">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <nav className="flex gap-2 overflow-x-auto" aria-label="按课程查看练习">
          {[{ id: "", name: "全部课程" }, ...initialResult.courses].map(
            (item) => (
              <button
                key={item.id}
                disabled={busy}
                aria-pressed={course === item.id}
                onClick={() => void load(item.id, status)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm ${course === item.id ? "bg-sky-600 text-white" : "bg-slate-50 text-slate-600"}`}
              >
                {item.name}
              </button>
            ),
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-sm text-slate-500"
            htmlFor="practice-set-status"
          >
            练习状态
          </label>
          <select
            id="practice-set-status"
            className="rounded-md border px-3 py-1.5 text-sm"
            disabled={busy}
            value={status}
            onChange={(e) => void load(course, e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">待完成</option>
            <option value="COMPLETED">已完成</option>
            <option value="EXPIRED">已结束</option>
          </select>
          <span className="ml-auto text-xs text-slate-500">
            共 {result.total} 组 · 每次推荐整组练习
          </span>
        </div>
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button
            onClick={() => void load(course, status)}
            className="underline"
          >
            重试
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          正在加载练习组…
        </p>
      )}
      {!result.items.length && !busy && (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          暂无符合条件的练习组，可调整筛选或前往“生成练习”。
        </div>
      )}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {result.items.map((item) => (
          <article
            key={item.id}
            className="px-4 py-4 transition-colors hover:bg-slate-50/60 sm:px-5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <p className="text-xs text-slate-500">
                  {item.courseId ? item.courseName : "历史练习（未关联课程）"} ·{" "}
                  {new Date(item.generatedAt).toLocaleString("zh-CN")}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : item.status === "ACTIVE" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {item.status === "COMPLETED"
                    ? "已完成"
                    : item.status === "ACTIVE"
                      ? "待完成"
                      : "已结束"}
                </span>
                <h2 className="mt-1 text-sm font-semibold break-words text-slate-900 sm:text-base">
                  {item.title}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    · {item.total} 道题
                  </span>
                </h2>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                  {item.knowledgePoints.join(" · ") || "按近期学习情况推荐"}
                </p>
              </div>
              <div className="w-28 text-xs text-slate-500">
                <p>
                  已完成 {item.completed}/{item.total}
                </p>
                <progress
                  aria-label="练习完成进度"
                  className="mt-2 h-1.5 w-full accent-sky-600"
                  value={item.completed}
                  max={item.total}
                />
              </div>
              <Link
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                href={`/student/recommendations/${item.entryId}/practice`}
              >
                {item.status === "COMPLETED"
                  ? "查看结果"
                  : item.status === "EXPIRED"
                    ? "查看记录"
                    : item.completed
                      ? "继续练习"
                      : "开始练习"}
              </Link>
            </div>
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">查看本组题目</summary>
              <ol className="mt-2 space-y-1">
                {item.questions.map((q, index) => (
                  <li key={q.id} className="flex gap-2 py-1">
                    <span>{index + 1}.</span>
                    <Link
                      className="min-w-0 flex-1 truncate hover:text-sky-700"
                      href={`/student/recommendations/${q.id}/practice`}
                    >
                      {q.title}
                    </Link>
                    <span>
                      {q.status === "COMPLETED"
                        ? "已完成"
                        : q.status === "STARTED"
                          ? "进行中"
                          : q.status === "PENDING"
                            ? "待练习"
                            : "已结束"}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </div>
      {result.nextPage && (
        <button
          disabled={busy}
          onClick={() => void load(course, status, result.nextPage ?? 1)}
          className="w-full rounded-lg border bg-white py-2 text-sm text-slate-600"
        >
          加载更多练习组
        </button>
      )}
    </section>
  );
}
