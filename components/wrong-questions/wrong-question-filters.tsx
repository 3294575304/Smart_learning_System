"use client";
import { QuestionType } from "@prisma/client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { WrongQuestionListQuery } from "@/services/wrong-questions/schemas";
import type { WrongQuestionListResult } from "@/services/wrong-questions/types";
import { wrongQuestionFilterUrl } from "@/services/wrong-questions/filter-url";
interface Props {
  query: WrongQuestionListQuery;
  filterOptions: WrongQuestionListResult["filterOptions"];
  chapters?: Array<{ id: string; name: string }>;
  total?: number;
}
export function WrongQuestionFilters({
  query,
  filterOptions,
  chapters = [],
  total = 0,
}: Props) {
  const [pending, setPending] = useState(false);
  const [keyword, setKeyword] = useState(query.keyword ?? "");
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setKeyword(query.keyword ?? "");
    setDraft({});
    setPending(false);
  }, [query]);
  function value(name: keyof WrongQuestionListQuery) {
    return draft[name] ?? String(query[name] ?? "");
  }
  function update(name: keyof WrongQuestionListQuery, next: string) {
    if (pending) return;
    setDraft({ ...draft, [name]: next });
    setPending(true);
    // 完整导航避免客户端流式路由挂起导致筛选无法完成。
    window.location.assign(wrongQuestionFilterUrl(query, name, next, keyword));
  }
  const selectClass =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50";
  const active = Boolean(
    query.keyword ||
    query.courseId ||
    query.type ||
    query.isMastered !== undefined ||
    query.chapterId ||
    query.knowledgePointId ||
    query.recentDays ||
    query.classroomId,
  );
  return (
    <section
      aria-label="错题筛选"
      aria-busy={pending}
      className="rounded-xl border bg-white p-4"
    >
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-70">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium">
            课程
            <select
              aria-label="课程"
              className={selectClass}
              value={value("courseId")}
              onChange={(e) => update("courseId", e.target.value)}
            >
              <option value="">全部课程</option>
              {filterOptions.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            班级
            <select
              aria-label="班级"
              className={selectClass}
              value={value("classroomId")}
              onChange={(e) => update("classroomId", e.target.value)}
            >
              <option value="">全部班级</option>
              {filterOptions.classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            掌握状态
            <select
              aria-label="掌握状态"
              className={selectClass}
              value={value("isMastered")}
              onChange={(e) => update("isMastered", e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="false">待巩固</option>
              <option value="true">已掌握</option>
            </select>
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update("keyword", keyword.trim());
          }}
        >
          <input
            aria-label="关键词"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            maxLength={120}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索题目标题或内容"
          />
          <button
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
            type="submit"
          >
            搜索
          </button>
        </form>
        <details
          key={`${query.courseId ?? "all"}:${Boolean(query.type || query.chapterId || query.knowledgePointId || query.recentDays)}`}
          open={Boolean(
            query.type ||
            query.chapterId ||
            query.knowledgePointId ||
            query.recentDays,
          )}
        >
          <summary className="w-fit cursor-pointer text-sm text-sky-700">
            更多筛选 · 题型、章节、知识点、时间
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium">
              题型
              <select
                aria-label="题型"
                className={selectClass}
                value={value("type")}
                onChange={(e) => update("type", e.target.value)}
              >
                <option value="">全部题型</option>
                {Object.values(QuestionType).map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              章节
              <select
                aria-label="章节"
                className={selectClass}
                disabled={!query.courseId || chapters.length === 0}
                value={value("chapterId")}
                onChange={(e) => update("chapterId", e.target.value)}
              >
                <option value="">
                  {!query.courseId
                    ? "请先选择课程"
                    : chapters.length
                      ? "全部章节"
                      : "暂无可筛选章节"}
                </option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              知识点
              <select
                aria-label="知识点"
                className={selectClass}
                disabled={
                  !query.courseId || filterOptions.knowledgePoints.length === 0
                }
                value={value("knowledgePointId")}
                onChange={(e) => update("knowledgePointId", e.target.value)}
              >
                <option value="">
                  {!query.courseId
                    ? "请先选择课程"
                    : filterOptions.knowledgePoints.length
                      ? "全部知识点"
                      : "当前范围暂无关联知识点"}
                </option>
                {filterOptions.knowledgePoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              最近错误
              <select
                aria-label="最近错误"
                className={selectClass}
                value={value("recentDays")}
                onChange={(e) => update("recentDays", e.target.value)}
              >
                <option value="">全部时间</option>
                {[7, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    最近 {d} 天
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </fieldset>
      {active ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          aria-label="已选筛选条件"
        >
          <span className="text-xs text-slate-500">已选条件</span>
          {query.courseId ? (
            <button
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("courseId", "")}
            >
              {filterOptions.courses.find((item) => item.id === query.courseId)
                ?.name ?? "课程"}{" "}
              ×
            </button>
          ) : null}
          {query.classroomId ? (
            <button
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("classroomId", "")}
            >
              {filterOptions.classrooms.find(
                (item) => item.id === query.classroomId,
              )?.name ?? "班级"}{" "}
              ×
            </button>
          ) : null}
          {query.isMastered !== undefined ? (
            <button
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("isMastered", "")}
            >
              {query.isMastered ? "已掌握" : "待巩固"} ×
            </button>
          ) : null}
          {query.keyword ? (
            <button
              type="button"
              className="max-w-48 truncate rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("keyword", "")}
            >
              关键词：{query.keyword} ×
            </button>
          ) : null}
          {query.type ? (
            <button
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("type", "")}
            >
              {QUESTION_TYPE_LABELS[query.type]} ×
            </button>
          ) : null}
          {query.chapterId ? (
            <button
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("chapterId", "")}
            >
              {chapters.find((item) => item.id === query.chapterId)?.name ??
                "章节"}{" "}
              ×
            </button>
          ) : null}
          {query.knowledgePointId ? (
            <button
              type="button"
              className="max-w-48 truncate rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("knowledgePointId", "")}
            >
              {filterOptions.knowledgePoints.find(
                (item) => item.id === query.knowledgePointId,
              )?.name ?? "知识点"}{" "}
              ×
            </button>
          ) : null}
          {query.recentDays ? (
            <button
              type="button"
              className="rounded-full border px-2.5 py-1 text-xs text-slate-700"
              onClick={() => update("recentDays", "")}
            >
              最近 {query.recentDays} 天 ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span role="status" aria-live="polite">
          {pending ? "正在筛选…" : `找到 ${total} 道错题 · 选择条件后自动筛选`}
        </span>
        {active ? (
          <Link
            className="rounded px-2 py-1 text-sky-700 hover:bg-sky-50"
            href="/student/wrong-questions?view=wrong"
          >
            重置筛选
          </Link>
        ) : null}
      </div>
    </section>
  );
}
