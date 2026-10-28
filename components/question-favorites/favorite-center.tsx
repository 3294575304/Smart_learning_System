"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import { QuestionType } from "@prisma/client";
import { questionTypeLabel } from "@/components/recommendations/recommendation-presenters";
import type {
  FavoriteList,
  FavoriteView,
} from "@/services/question-favorites/schemas";
import { announceFavoriteChange } from "./favorite-button";
import { FavoritePracticeButton } from "./favorite-practice-button";
function FavoriteRow({
  item,
  onChange,
  returnTo,
}: {
  item: FavoriteView;
  onChange: () => void;
  returnTo: string;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    const response = await requestApi<unknown>(
      `/api/student/question-favorites/${encodeURIComponent(item.questionId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, expectedRevision: item.revision }),
      },
    );
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setEditing(false);
    announceFavoriteChange(item.questionId, true);
    onChange();
  }
  async function remove() {
    if (
      item.note &&
      !window.confirm("取消收藏会删除这条个人备注，确定继续吗？")
    )
      return;
    setBusy(true);
    const response = await requestApi<unknown>(
      `/api/student/question-favorites/${encodeURIComponent(item.questionId)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    announceFavoriteChange(item.questionId, false);
    onChange();
  }
  return (
    <article className="space-y-2 px-4 py-4 transition-colors hover:bg-slate-50/60 sm:px-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="text-xs text-slate-500">
            {item.courseName} · {questionTypeLabel(item.type)}
          </p>
          <Link
            className="mt-1 block text-sm font-medium break-words hover:text-sky-700 sm:text-base"
            href={`/student/question-favorites/${item.questionId}?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {item.title}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            {item.knowledgePoints.map((point) => point.name).join(" · ") ||
              "暂未关联知识点"}{" "}
            · 收藏于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}
          </p>
          {item.wrongQuestion && (
            <Link
              className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
              href={`/student/wrong-questions/${item.wrongQuestion.id}`}
            >
              错题 · {item.wrongQuestion.isMastered ? "已掌握" : "待巩固"} →
            </Link>
          )}
          {!item.available && (
            <p className="mt-2 text-xs text-amber-700">
              暂不可练习：{item.unavailableReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FavoritePracticeButton
            questionId={item.questionId}
            disabled={!item.available || busy}
          />
          <button
            disabled={busy}
            type="button"
            className="rounded-lg border px-3 py-2 text-xs text-slate-600"
            onClick={() => {
              setEditing(!editing);
              setNote(item.note);
              setError("");
            }}
          >
            {editing ? "取消编辑" : "备注"}
          </button>
          <button
            disabled={busy}
            type="button"
            className="text-xs text-slate-500"
            onClick={() => void remove()}
          >
            取消收藏
          </button>
        </div>
      </div>
      {!editing && item.note && (
        <p className="rounded-lg bg-amber-50/70 px-3 py-2 text-xs leading-6 whitespace-pre-wrap text-slate-600">
          我的备注：{item.note}
        </p>
      )}
      {editing && (
        <div className="space-y-2">
          <textarea
            aria-label={`题目“${item.title}”的个人备注`}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
            className="min-h-24 w-full rounded-lg border p-3 text-sm"
            placeholder="例如：列表切片边界容易混淆，下次再练一次。"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {note.length}/1000 · 仅自己可见
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-sky-600 px-3 py-2 text-xs text-white"
            >
              {busy ? "保存中…" : "保存备注"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
export function FavoriteCenter({ enabled }: { enabled: boolean }) {
  const params = useSearchParams();
  const initialUrl = useRef(true);
  const [page, setPage] = useState(() =>
    Math.max(1, Number(params.get("page")) || 1),
  );
  const [chapter, setChapter] = useState(params.get("chapterId") ?? "");
  const [result, setResult] = useState<FavoriteList | null>(null);
  const [course, setCourse] = useState(params.get("courseId") ?? "");
  const [point, setPoint] = useState(params.get("knowledgePointId") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [search, setSearch] = useState(params.get("keyword") ?? "");
  const [querySearch, setQuerySearch] = useState(params.get("keyword") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const restore = () => window.location.reload();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const controller = new AbortController();
    setBusy(true);
    setResult(null);
    setError("");
    const query = new URLSearchParams({ page: String(page) });
    if (course) query.set("courseId", course);
    if (chapter) query.set("chapterId", chapter);
    if (point) query.set("knowledgePointId", point);
    if (type) query.set("type", type);
    if (querySearch) query.set("search", querySearch);
    void requestApi<FavoriteList>(`/api/student/question-favorites?${query}`, {
      method: "GET",
      signal: controller.signal,
    }).then((response) => {
      if (!alive) return;
      setBusy(false);
      if (response.success) {
        if (!response.data.items.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setResult(response.data);
      } else setError(response.error);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [enabled, course, chapter, point, type, querySearch, revision, page]);
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    const filters = {
      courseId: course,
      chapterId: chapter,
      knowledgePointId: point,
      type,
      keyword: querySearch,
    };
    for (const [name, value] of Object.entries(filters)) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    url.searchParams.set("view", "favorites");
    url.searchParams.set("page", String(page));
    if (url.href !== window.location.href) {
      const method = initialUrl.current ? "replaceState" : "pushState";
      window.history[method](window.history.state, "", url);
    }
    initialUrl.current = false;
  }, [enabled, course, chapter, point, type, querySearch, page]);
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    window.addEventListener("question-favorites-changed", update);
    return () =>
      window.removeEventListener("question-favorites-changed", update);
  }, []);
  return (
    <section className="space-y-4" aria-label="我的收藏">
      <header>
        <h2 className="font-semibold">
          我的收藏{" "}
          <span className="text-sm font-normal text-slate-500">
            {result ? `· ${result.total} 道题` : ""}
          </span>
        </h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          主动收藏想复习的题目；取消收藏不影响错题与掌握状态，备注仅自己可见。
        </p>
      </header>
      <div className="grid max-w-4xl gap-3 rounded-xl border border-sky-100 bg-white p-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="grid gap-3 sm:grid-cols-1">
          <select
            aria-label="收藏课程"
            disabled={busy}
            value={course}
            onChange={(e) => {
              setPage(1);
              setCourse(e.target.value);
              setChapter("");
              setPoint("");
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">全部课程</option>
            {result?.courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuerySearch(search.trim());
            setRevision((value) => value + 1);
          }}
        >
          <input
            aria-label="搜索收藏"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            placeholder="搜索题目标题或个人备注"
          />
          <button
            disabled={busy}
            type="submit"
            className="rounded-lg border px-4 py-2 text-sm"
          >
            搜索
          </button>
          <button
            disabled={busy}
            type="button"
            className="text-xs text-slate-500"
            onClick={() => {
              setPage(1);
              setCourse("");
              setChapter("");
              setPoint("");
              setType("");
              setSearch("");
              setQuerySearch("");
              setRevision((value) => value + 1);
            }}
          >
            重置
          </button>
        </form>
        <details
          className="sm:col-span-2"
          open={Boolean(chapter || point || type)}
        >
          <summary className="cursor-pointer text-sm text-sky-700">
            高级筛选 · 章节、知识点、题型
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {" "}
            <select
              aria-label="收藏章节"
              disabled={busy || !course || !result?.chapters?.length}
              value={chapter}
              onChange={(event) => {
                setPage(1);
                setChapter(event.target.value);
                setPoint("");
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">{course ? "全部章节" : "请先选择课程"}</option>
              {result?.chapters?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="收藏知识点"
              disabled={busy || !course}
              value={point}
              onChange={(e) => {
                setPage(1);
                setPoint(e.target.value);
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">全部知识点</option>
              {result?.knowledgePoints.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="收藏题型"
              disabled={busy}
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">全部题型</option>
              {Object.values(QuestionType).map((item) => (
                <option key={item} value={item}>
                  {questionTypeLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </details>
      </div>
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          正在加载收藏…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRevision((value) => value + 1)}
          >
            重试
          </button>
        </p>
      )}
      {result && !result.items.length && !busy && (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          {course || chapter || point || type || querySearch
            ? "没有符合筛选条件的收藏，可调整条件。"
            : "暂无收藏。在题目右上角点击“收藏”，即可在这里集中复习。"}
        </div>
      )}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {result?.items.map((item) => (
          <FavoriteRow
            key={`${item.id}:${item.revision}`}
            item={item}
            returnTo={`/student/wrong-questions?${new URLSearchParams({ view: "favorites", page: String(page), ...Object.fromEntries(Object.entries({ courseId: course, chapterId: chapter, knowledgePointId: point, type, keyword: querySearch }).filter(([, value]) => value)) })}`}
            onChange={() => setRevision((value) => value + 1)}
          />
        ))}
      </div>
      {result && (page > 1 || result.nextPage) ? (
        <nav
          aria-label="收藏分页"
          className="flex items-center justify-between text-sm"
        >
          <button
            type="button"
            disabled={busy || page === 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            第 {page} 页 · 共 {result.total} 道
          </span>
          <button
            type="button"
            disabled={busy || !result.nextPage}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40"
          >
            下一页
          </button>
        </nav>
      ) : null}
    </section>
  );
}
