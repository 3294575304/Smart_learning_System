"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
}: {
  item: FavoriteView;
  onChange: () => void;
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
            href={`/student/question-favorites/${item.questionId}`}
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
    if (!enabled) return;
    let alive = true;
    setBusy(true);
    setError("");
    const query = new URLSearchParams();
    if (course) query.set("courseId", course);
    if (chapter) query.set("chapterId", chapter);
    if (point) query.set("knowledgePointId", point);
    if (type) query.set("type", type);
    if (querySearch) query.set("search", querySearch);
    void requestApi<FavoriteList>(`/api/student/question-favorites?${query}`, {
      method: "GET",
    }).then((response) => {
      if (!alive) return;
      setBusy(false);
      if (response.success) setResult(response.data);
      else setError(response.error);
    });
    return () => {
      alive = false;
    };
  }, [enabled, course, chapter, point, type, querySearch, revision]);
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
    url.searchParams.delete("page");
    window.history.replaceState(null, "", url);
  }, [enabled, course, chapter, point, type, querySearch]);
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    window.addEventListener("question-favorites-changed", update);
    return () =>
      window.removeEventListener("question-favorites-changed", update);
  }, []);
  async function more() {
    if (!result?.nextPage || busy) return;
    setBusy(true);
    const query = new URLSearchParams({ page: String(result.nextPage) });
    if (course) query.set("courseId", course);
    if (chapter) query.set("chapterId", chapter);
    if (point) query.set("knowledgePointId", point);
    if (type) query.set("type", type);
    if (querySearch) query.set("search", querySearch);
    const response = await requestApi<FavoriteList>(
      `/api/student/question-favorites?${query}`,
      { method: "GET" },
    );
    setBusy(false);
    if (response.success)
      setResult({
        ...response.data,
        items: [
          ...new Map(
            [...result.items, ...response.data.items].map((item) => [
              item.questionId,
              item,
            ]),
          ).values(),
        ],
      });
    else setError(response.error);
  }
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
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          <select
            aria-label="收藏课程"
            disabled={busy}
            value={course}
            onChange={(e) => {
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
          <select
            aria-label="收藏章节"
            disabled={busy || !course || !result?.chapters?.length}
            value={chapter}
            onChange={(event) => setChapter(event.target.value)}
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
            onChange={(e) => setPoint(e.target.value)}
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
            onChange={(e) => setType(e.target.value)}
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
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
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
            onChange={() => setRevision((value) => value + 1)}
          />
        ))}
      </div>
      {result?.nextPage && (
        <button
          disabled={busy}
          type="button"
          onClick={() => void more()}
          className="w-full rounded-lg border bg-white py-2 text-sm"
        >
          加载更多收藏
        </button>
      )}
    </section>
  );
}
