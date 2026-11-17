"use client";

import {
  ChevronDown,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useState } from "react";

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
    courseIds: string[];
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
    objectives: Array<{ code: string; title: string }>;
  }>;
}

export function QuestionFilters({
  query,
  courses,
  categories,
}: QuestionFiltersProps) {
  const [keyword, setKeyword] = useState(query.keyword ?? "");
  const [pending, setPending] = useState(false);
  const advancedFilterCount = [
    query.courseConceptId,
    query.defaultObjectiveKind,
    query.objectiveCode,
  ].filter(Boolean).length;
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);
  const advancedId = useId();
  const hasFilters = Boolean(
    keyword.trim() ||
    query.keyword ||
    query.categoryId ||
    query.type ||
    query.courseId ||
    query.knowledgePointId ||
    advancedFilterCount,
  );
  const selectedCourse = courses.find((course) =>
    course.courseIds.includes(query.courseId ?? ""),
  );
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
    if (query.defaultObjectiveKind)
      params.set("defaultObjectiveKind", query.defaultObjectiveKind);
    if (query.objectiveCode) params.set("objectiveCode", query.objectiveCode);
    if (query.courseId) params.set("courseId", query.courseId);
    if (query.categoryId) params.set("categoryId", query.categoryId);
    if (query.courseConceptId)
      params.set("courseConceptId", query.courseConceptId);
    params.set(name, value);
    if (name === "courseId") {
      params.delete("courseConceptId");
      params.delete("objectiveCode");
      params.delete("defaultObjectiveKind");
      const course = courses.find((item) => item.id === value);
      if (course) params.set("categoryId", course.questionCategoryId);
    }
    if (name === "categoryId") {
      params.delete("courseId");
      params.delete("courseConceptId");
      params.delete("objectiveCode");
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
      aria-label="题库搜索与筛选"
      className="min-w-0 space-y-2.5"
    >
      <div className="tt-fbar">
        <form
          className="tt-search"
          style={{ flex: "1 1 16rem" }}
          onSubmit={submitSearch}
          role="search"
        >
          <Search
            aria-hidden="true"
            className="size-3.5 shrink-0 text-slate-400"
          />
          <input
            aria-label="搜索题目"
            autoComplete="off"
            maxLength={120}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索标题、题干或完整标签"
            type="search"
            value={keyword}
          />
          <button
            className="shrink-0 text-xs font-medium text-sky-700 hover:text-sky-900"
            type="submit"
          >
            搜索
          </button>
        </form>
        <select
          aria-label="课程分类"
          className="max-w-full sm:max-w-48"
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
        <select
          aria-label="题型"
          className="max-w-full sm:max-w-40"
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
        <select
          aria-label="课程"
          className="max-w-full sm:max-w-56"
          value={selectedCourse?.id ?? ""}
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
        <button
          aria-controls={advancedId}
          aria-expanded={advancedOpen}
          className="tt-btn-line shrink-0"
          onClick={() => setAdvancedOpen((open) => !open)}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          更多筛选{advancedFilterCount ? `（${advancedFilterCount}）` : ""}
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
          />
        </button>
        {hasFilters ? (
          <button
            type="button"
            className="tt-btn-ghost shrink-0"
            onClick={() => {
              setKeyword("");
              setPending(true);
              window.location.assign("/teacher/questions");
            }}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            重置筛选
          </button>
        ) : null}
      </div>
      <div
        hidden={!advancedOpen}
        id={advancedId}
        className="rounded-md border bg-white p-3"
      >
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
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
            <span className="text-xs font-medium">课程目标</span>
            {selectedCourse?.objectives.length ? (
              <select
                className="w-full rounded-md border px-3 py-2"
                value={query.objectiveCode ?? ""}
                onChange={(event) =>
                  update("objectiveCode", event.target.value)
                }
              >
                <option value="">全部课程目标</option>
                {selectedCourse.objectives.map((objective) => (
                  <option key={objective.code} value={objective.code}>
                    {objective.code} · {objective.title}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="w-full rounded-md border px-3 py-2"
                value={query.defaultObjectiveKind ?? ""}
                onChange={(event) =>
                  update("defaultObjectiveKind", event.target.value)
                }
              >
                <option value="">全部类型</option>
                <option value="KNOWLEDGE">1 · 知识</option>
                <option value="ABILITY">2 · 能力</option>
                <option value="LITERACY">3 · 素养</option>
              </select>
            )}
          </label>
        </div>
      </div>
      <p className="tt-hint" role="status">
        {selectedCourse
          ? `${selectedCourse.courseNo} · ${selectedCourse.term} · ${selectedCourse.classrooms.length} 个关联班级；`
          : ""}
        {pending
          ? "正在更新题目…"
          : courses.length === 0
            ? "暂无可筛选课程，可先创建课程；题型与通用目标仍可筛选。"
            : query.courseId && !selectedCourse?.concepts.length
              ? "该课程尚未发布正式知识图谱，暂不能按知识点筛选。"
              : query.courseId
                ? "包含课程、章节及知识点关联题目，可展开更多筛选。"
                : "包含未关联课程的题目，可按标题、题干或完整标签搜索。"}
      </p>
    </fieldset>
  );
}
