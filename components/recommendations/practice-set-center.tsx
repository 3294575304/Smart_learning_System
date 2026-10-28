"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import type {
  PracticeSetList,
  practiceSetQuerySchema,
} from "@/services/practice-sets/types";
import type { z } from "zod";
import { PracticeManagementActions } from "./practice-management-actions";
import { summarizePracticeScores } from "@/services/recommendations/scoring";
type Query = z.output<typeof practiceSetQuerySchema>;
export function PracticeSetCenter({
  initialResult,
  initialQuery,
}: {
  initialResult: PracticeSetList;
  initialQuery?: Query;
}) {
  const [result, setResult] = useState(initialResult),
    [query, setQuery] = useState<Query>(
      initialQuery ?? { page: 1, section: initialResult.section ?? "ACTIVE" },
    ),
    [keyword, setKeyword] = useState(initialQuery?.keyword ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null),
    requested = useRef(query);
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  async function load(next: Query = query) {
    const version = ++sequence.current;
    requested.current = next;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    setSelected([]);
    const params = new URLSearchParams({
      page: String(next.page),
      section: next.section ?? "ACTIVE",
    });
    for (const key of ["courseId", "status", "keyword"] as const)
      if (next[key]) params.set(key, next[key]);
    const response = await requestApi<PracticeSetList>(
      `/api/student/practice-sets?${params}`,
      { method: "GET", signal: controller.current.signal },
    );
    if (version !== sequence.current) return;
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    const current = {
      ...next,
      page: response.data.page ?? next.page,
      section: response.data.section ?? next.section,
    };
    setQuery(current);
    setResult(response.data);
    const url = new URL(window.location.href);
    for (const key of ["page", "section", "courseId", "status", "keyword"]) {
      url.searchParams.delete(key);
      const value = current[key as keyof Query];
      if (value !== undefined && value !== "")
        url.searchParams.set(key, String(value));
    }
    window.history.replaceState(null, "", url);
  }
  function changed() {
    setNotice("练习记录已更新。");
    void load(query);
  }
  const section = query.section ?? result.section ?? "ACTIVE";
  return (
    <section className="space-y-4" aria-label="我的练习组">
      <nav className="flex flex-wrap items-center gap-2" aria-label="练习分区">
        {(
          [
            ["ACTIVE", "进行中"],
            ["HISTORY", "历史记录"],
            ["TRASH", "回收站"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-pressed={section === value}
            onClick={() =>
              void load({
                ...query,
                section: value,
                status: undefined,
                page: 1,
              })
            }
            className={`rounded-lg border px-4 py-2 text-sm ${section === value ? "bg-sky-600 text-white" : "bg-white text-slate-600"}`}
          >
            {label}
            {result.counts ? ` ${result.counts[value]}` : ""}
          </button>
        ))}
      </nav>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void load({
            ...query,
            keyword: keyword.trim() || undefined,
            page: 1,
          });
        }}
      >
        <label className="text-sm">
          课程
          <select
            disabled={busy}
            value={query.courseId ?? ""}
            onChange={(event) =>
              void load({
                ...query,
                courseId: event.target.value || undefined,
                page: 1,
              })
            }
            className="ml-2 rounded-lg border p-2"
          >
            <option value="">全部课程</option>
            {initialResult.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
            <option value="GENERAL">通用历史练习</option>
          </select>
        </label>
        <label className="min-w-40 flex-1 text-sm">
          搜索
          <input
            className="ml-2 rounded-lg border p-2"
            placeholder="练习名称、课程或题目"
            maxLength={100}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            disabled={busy}
          />
        </label>
        <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm">
          搜索
        </button>
        {section !== "ACTIVE" ? (
          <label className="text-sm">
            状态
            <select
              className="ml-2 rounded-lg border p-2"
              disabled={busy}
              value={query.status ?? ""}
              onChange={(event) =>
                void load({
                  ...query,
                  status: (event.target.value || undefined) as Query["status"],
                  page: 1,
                })
              }
            >
              <option value="">全部状态</option>
              <option value="COMPLETED">已完成</option>
              <option value="EXPIRED">已结束</option>
            </select>
          </label>
        ) : null}
      </form>
      {section === "TRASH" ? (
        <p className="text-sm text-slate-600">
          回收站保留学习记录。恢复后进入历史记录，只能回看。
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void load(requested.current)}
          >
            重试
          </button>
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="text-sm text-slate-500">
          正在加载练习组…
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm">
          <input
            type="checkbox"
            disabled={busy || !result.items.length}
            checked={
              Boolean(result.items.length) &&
              selected.length === result.items.length
            }
            onChange={(event) =>
              setSelected(
                event.target.checked ? result.items.map((item) => item.id) : [],
              )
            }
          />{" "}
          选择本页 · 共 {result.total} 组
        </label>
        <PracticeManagementActions
          id="batch"
          title="所选练习"
          active={false}
          onChange={changed}
          batch={{
            action: section === "TRASH" ? "RESTORE" : "TRASH",
            items: result.items
              .filter((item) => selected.includes(item.id))
              .map((item) => ({
                id: item.id,
                expectedRevision: item.management?.revision ?? 0,
              })),
          }}
        />
      </div>
      {!result.items.length && !busy ? (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          {section === "TRASH"
            ? "回收站为空。"
            : "暂无符合条件的练习，可调整筛选或前往生成练习。"}
        </p>
      ) : null}
      <div className="divide-y rounded-xl border bg-white">
        {result.items.map((item) => {
          const score = summarizePracticeScores(item.questions);
          return (
            <article
              key={item.id}
              className="flex flex-wrap items-center gap-3 p-4 sm:p-5"
            >
              <input
                type="checkbox"
                aria-label={`选择${item.title}`}
                disabled={busy}
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, item.id]
                      : previous.filter((id) => id !== item.id),
                  )
                }
              />
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <p className="text-xs text-slate-500">
                  {item.courseName} ·{" "}
                  {new Date(item.generatedAt).toLocaleString("zh-CN")}
                </p>
                <h2 className="mt-1 font-semibold [overflow-wrap:anywhere] break-words">
                  {item.title} · {item.total} 道题
                </h2>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                  {item.knowledgePoints.join(" · ") || "按近期学习情况推荐"}
                </p>
              </div>
              <div className="text-sm text-slate-600">
                <p>
                  {item.management?.trashedAt
                    ? "已移入回收站"
                    : item.status === "COMPLETED"
                      ? "已完成"
                      : item.status === "ACTIVE"
                        ? "进行中"
                        : "已结束"}{" "}
                  · 已完成 {item.completed}/{item.total}
                </p>
                <p className="mt-1 text-xs">
                  {score.complete
                    ? `${score.percentage} 分`
                    : score.gradedCount
                      ? `已评 ${score.gradedScore} 分 · 待判 ${score.pendingCount}`
                      : "暂无成绩"}
                </p>
              </div>
              <Link
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
                href={`/student/recommendations/${item.entryId}/practice`}
              >
                {item.status === "ACTIVE"
                  ? item.completed
                    ? "继续练习"
                    : "开始练习"
                  : "查看记录"}
              </Link>
              <PracticeManagementActions
                id={item.id}
                title={item.title}
                management={item.management}
                primaryRestore={Boolean(item.management?.trashedAt)}
                active={item.status === "ACTIVE"}
                onChange={changed}
              />
              <details className="basis-full text-xs text-slate-500">
                <summary className="cursor-pointer">查看本组题目</summary>
                <ol className="mt-2 space-y-2">
                  {item.questions.map((question, index) => (
                    <li key={question.id} className="flex gap-2">
                      <span>{index + 1}.</span>
                      <Link
                        className="min-w-0 flex-1 break-words hover:text-sky-700"
                        href={`/student/recommendations/${question.id}/practice`}
                      >
                        {question.title}
                      </Link>
                      <span>
                        {question.status === "COMPLETED"
                          ? "已完成"
                          : question.readOnly
                            ? "只读"
                            : "待完成"}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          );
        })}
      </div>
      <nav
        className="flex items-center justify-between text-sm"
        aria-label="练习组分页"
      >
        <button
          type="button"
          className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40"
          disabled={busy || query.page <= 1}
          onClick={() => void load({ ...query, page: query.page - 1 })}
        >
          上一页
        </button>
        <span>第 {query.page} 页</span>
        <button
          type="button"
          className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40"
          disabled={busy || !result.nextPage}
          onClick={() =>
            void load({ ...query, page: result.nextPage ?? query.page })
          }
        >
          下一页
        </button>
      </nav>
    </section>
  );
}
