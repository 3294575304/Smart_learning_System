"use client";

import { useState } from "react";

import {
  QUESTION_TYPE_GROUPS,
  QUESTION_TYPE_LABELS,
} from "@/services/questions/constants";
import type { QuestionListQuery } from "@/services/questions/schemas";

interface QuestionFiltersProps {
  query: QuestionListQuery;
  categories: Array<{ id: string; name: string }>;
  courses: Array<{
    id: string;
    questionCategoryId: string;
    name: string;
    term: string;
    courseNo: string;
    classrooms: string[];
    concepts: Array<{
      conceptId: string;
      code: string;
      name: string;
      chapterName?: string;
    }>;
  }>;
}

export function QuestionFilters({
  query,
  courses,
  categories,
}: QuestionFiltersProps) {
  const [keyword, setKeyword] = useState(query.keyword ?? "");
  const [pending, setPending] = useState(false);
  const selectedCourse = courses.find((course) => course.id === query.courseId);
  const conceptGroups = new Map<
    string,
    NonNullable<typeof selectedCourse>["concepts"]
  >();
  for (const concept of selectedCourse?.concepts ?? []) {
    const chapter = concept.chapterName ?? "课程知识点";
    conceptGroups.set(chapter, [
      ...(conceptGroups.get(chapter) ?? []),
      concept,
    ]);
  }

  function update(name: string, value: string) {
    const params = new URLSearchParams();
    params.set("pageSize", String(query.pageSize));
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (query.type) params.set("type", query.type);
    if (query.difficulty) params.set("difficulty", String(query.difficulty));
    if (query.courseId) params.set("courseId", query.courseId);
    if (query.categoryId) params.set("categoryId", query.categoryId);
    if (query.courseConceptId)
      params.set("courseConceptId", query.courseConceptId);
    params.set(name, value);
    if (name === "courseId") {
      params.delete("courseConceptId");
      const course = courses.find((item) => item.id === value);
      if (course) params.set("categoryId", course.questionCategoryId);
    }
    if (name === "categoryId") {
      params.delete("courseId");
      params.delete("courseConceptId");
    }
    params.delete("knowledgePointId");
    params.set("page", "1");
    if (!value) params.delete(name);
    setPending(true);
    window.location.assign(`/teacher/questions?${params.toString()}`);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update("keyword", keyword.trim());
  }

  return (
    <fieldset
      disabled={pending}
      aria-busy={pending}
      className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <form
        className="flex w-full gap-2 sm:col-span-2 lg:col-span-3 lg:max-w-2xl"
        onSubmit={submitSearch}
      >
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-xs font-medium">搜索题目</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            maxLength={120}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入标题、题干或完整标签"
            value={keyword}
          />
        </label>
        <button
          className="mt-5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
          type="submit"
        >
          搜索
        </button>
      </form>
      <label className="space-y-1">
        <span className="text-xs font-medium">课程分类</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={query.categoryId ?? ""}
          onChange={(event) => update("categoryId", event.target.value)}
        >
          <option value="">全部课程分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">题型</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={query.type ?? ""}
          onChange={(event) => update("type", event.target.value)}
        >
          <option value="">全部题型</option>
          {QUESTION_TYPE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.types.map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_LABELS[type]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <>
        <label className="space-y-1">
          <span className="text-xs font-medium">课程</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            value={query.courseId ?? ""}
            onChange={(event) => update("courseId", event.target.value)}
          >
            <option value="">全部课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
                {courses.filter((item) => item.name === course.name).length > 1
                  ? ` · ${course.term} · ${course.courseNo}`
                  : ""}
              </option>
            ))}
          </select>
          <span className="block text-xs text-slate-500">
            {selectedCourse
              ? `${selectedCourse.courseNo} · ${selectedCourse.term} · ${selectedCourse.classrooms.length} 个关联班级`
              : "包含未关联课程的题目"}
          </span>
        </label>
      </>
      <details
        open={Boolean(query.courseConceptId || query.difficulty)}
        className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:col-span-2 lg:col-span-3"
      >
        <summary className="text-xs font-medium text-sky-700">
          更多筛选 · 知识点与难度
          {query.courseConceptId || query.difficulty ? "（已启用）" : ""}
        </summary>
        <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">课程知识点</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={query.courseConceptId ?? ""}
              disabled={!selectedCourse?.concepts.length}
              onChange={(event) =>
                update("courseConceptId", event.target.value)
              }
            >
              <option value="">
                {!query.courseId
                  ? "请先选择课程"
                  : !selectedCourse?.concepts.length
                    ? "暂无正式知识点"
                    : "该课程全部知识点"}
              </option>
              {[...conceptGroups].map(([chapter, concepts]) => (
                <optgroup key={chapter} label={chapter}>
                  {concepts.map((concept) => (
                    <option key={concept.conceptId} value={concept.conceptId}>
                      {concept.code} · {concept.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">难度</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={query.difficulty ?? ""}
              onChange={(event) => update("difficulty", event.target.value)}
            >
              <option value="">全部难度</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  难度 {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <div className="flex items-center gap-3 text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-slate-700"
          onClick={() => {
            setKeyword("");
            setPending(true);
            window.location.assign("/teacher/questions");
          }}
        >
          重置筛选
        </button>
        <span role="status">
          {pending
            ? "正在更新题目…"
            : courses.length === 0
              ? "暂无可筛选课程，可先创建课程；题型与难度仍可筛选。"
              : query.courseId && !selectedCourse?.concepts.length
                ? "该课程尚未发布正式知识图谱，暂不能按知识点筛选。"
                : query.courseId
                  ? "课程范围包含关联到课程、章节及知识点的题目；选择具体知识点后再精确筛选。"
                  : "全部题目包含未关联课程的题目；切换课程会清空知识点条件。"}
        </span>
      </div>
    </fieldset>
  );
}
