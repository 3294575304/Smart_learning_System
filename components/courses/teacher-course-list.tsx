"use client";

import { CourseStatus } from "@prisma/client";
import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Search,
  School,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useListFilterUrlSync } from "@/components/dashboard/use-list-filter-url-sync";
import {
  describeFilterSummary,
  hasActiveFilterCondition,
  matchesFilterKeyword,
} from "@/lib/list-filter";
import type {
  TeacherCourseDeletionResult,
  TeacherCourseListItem,
} from "@/services/courses/types";

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "启用",
  ARCHIVED: "归档",
};

/** 行内徽标：浅底深字，不用描边，靠底色区分状态 */
const COURSE_STATUS_STYLES: Record<CourseStatus, string> = {
  DRAFT: "tt-badge tt-badge-draft",
  ACTIVE: "tt-badge tt-badge-ok",
  ARCHIVED: "tt-badge tt-badge-line",
};

/** 排序方式：默认按最近更新，教师最关心「哪门课刚动过」 */
const SORT_OPTIONS = [
  { value: "recent", label: "按最近更新" },
  { value: "name", label: "按课程名称" },
  { value: "term", label: "按学期" },
] as const;

type CourseSortKey = (typeof SORT_OPTIONS)[number]["value"];

/** 筛选项顺序固定，避免随数据顺序跳动。 */
const COURSE_STATUS_FILTER_ORDER: CourseStatus[] = ["ACTIVE", "DRAFT"];

export interface TeacherCourseFilters {
  keyword: string;
  status: string;
  term: string;
}

/**
 * 关键词与状态、学期之间是「与」关系：任一条件不满足即排除。
 * 抽成纯函数便于直接断言组合筛选行为，不依赖 React 渲染。
 */
export function filterTeacherCourses(
  courses: TeacherCourseListItem[],
  filters: TeacherCourseFilters,
): TeacherCourseListItem[] {
  return courses.filter((course) => {
    if (filters.status && course.status !== filters.status) return false;
    if (filters.term && course.term !== filters.term) return false;
    return matchesFilterKeyword(filters.keyword, [
      course.name,
      course.courseNo,
      course.term,
      course.description,
      course.questionCategoryName,
      course.template.name,
      COURSE_STATUS_LABELS[course.status],
    ]);
  });
}

function CourseDeleteAction({
  course,
  onDeleted,
}: {
  course: TeacherCourseListItem;
  onDeleted: (result: TeacherCourseDeletionResult) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (isDeleting) return;
    setDialogOpen(false);
    setError(null);
  }

  async function confirmDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    const result = await requestApi<TeacherCourseDeletionResult>(
      `/api/teacher/courses/${course.id}`,
      { method: "DELETE" },
    );

    if (!result.success) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setDialogOpen(false);
    setIsDeleting(false);
    onDeleted(result.data);
  }

  return (
    <>
      <button
        aria-label={`删除课程“${course.name}”`}
        className="text-muted-foreground hover:bg-destructive/5 hover:text-destructive inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={openDialog}
        title={`删除课程“${course.name}”`}
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">删除</span>
      </button>

      {dialogOpen ? (
        <div
          aria-labelledby={`delete-course-title-${course.id}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/25 p-4 backdrop-blur-[1px]"
          role="alertdialog"
        >
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-lg font-semibold"
                  id={`delete-course-title-${course.id}`}
                >
                  确认删除课程
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  课程将从课程管理中移除；关联班级、作业、成绩和其他历史教学数据会完整保留。
                </p>
              </div>
              <button
                aria-label="关闭删除确认框"
                className="rounded-md p-1 text-gray-500 hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={closeDialog}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-lg border bg-sky-50/70 p-4 text-sm">
              <p className="font-medium">{course.name}</p>
              <p className="text-muted-foreground mt-1">
                课程号：{course.courseNo}
              </p>
            </div>

            <p className="text-destructive mt-4 text-sm font-medium">
              当前不提供恢复入口，请确认不再使用此课程开展教学。
            </p>

            {error ? (
              <div
                aria-live="polite"
                className="bg-destructive/10 text-destructive mt-4 rounded-md p-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={closeDialog}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-800 transition-[background-color,border-color,color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 enabled:hover:border-rose-400 enabled:hover:bg-rose-100 enabled:active:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:enabled:active:scale-[0.96]"
                disabled={isDeleting}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {isDeleting ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 motion-safe:animate-spin"
                    />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={2}
                    />
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function TeacherCourseList({
  initialCourses,
  initialFilters = { keyword: "", status: "", term: "" },
  createEntry,
}: {
  initialCourses: TeacherCourseListItem[];
  initialFilters?: TeacherCourseFilters;
  createEntry?: React.ReactNode;
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [keyword, setKeyword] = useState(initialFilters.keyword);
  const [status, setStatus] = useState(initialFilters.status);
  const [term, setTerm] = useState(initialFilters.term);
  const [sortBy, setSortBy] = useState<CourseSortKey>("recent");

  // 学期选项来自当前课程数据，最新学期排在前面
  const termOptions = useMemo<{ value: string; label: string }[]>(() => {
    const terms = [...new Set(courses.map((course) => course.term))];
    return terms
      .sort((left, right) => right.localeCompare(left))
      .map((value) => ({ value, label: value }));
  }, [courses]);

  // 分享链接里的状态、学期可能已失效：不合法就当作未筛选，避免出现
  // 「tab 显示全部却一条也不显示」的死局
  const effectiveStatus = COURSE_STATUS_FILTER_ORDER.includes(
    status as CourseStatus,
  )
    ? status
    : "";
  const effectiveTerm = termOptions.some((option) => option.value === term)
    ? term
    : "";

  // tab 计数始终基于全部课程：切换 tab 时数字不应跟着变
  const statusTabs = useMemo(
    () => [
      { value: "", label: "全部", count: courses.length },
      ...COURSE_STATUS_FILTER_ORDER.map((value) => ({
        value,
        label: COURSE_STATUS_LABELS[value],
        count: courses.filter((course) => course.status === value).length,
      })),
    ],
    [courses],
  );

  const visibleCourses = useMemo(() => {
    const filtered = filterTeacherCourses(courses, {
      keyword,
      status: effectiveStatus,
      term: effectiveTerm,
    });
    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((left, right) =>
        left.name.localeCompare(right.name, "zh-CN"),
      );
    } else if (sortBy === "term") {
      sorted.sort(
        (left, right) =>
          right.term.localeCompare(left.term) ||
          left.name.localeCompare(right.name, "zh-CN"),
      );
    } else {
      sorted.sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      );
    }
    return sorted;
  }, [courses, effectiveStatus, effectiveTerm, keyword, sortBy]);

  const isFiltered = hasActiveFilterCondition({
    keyword,
    values: [effectiveStatus, effectiveTerm],
  });

  useListFilterUrlSync({
    keyword: keyword.trim(),
    status: effectiveStatus,
    term: effectiveTerm,
  });

  const conditions = [
    ...(keyword.trim() ? [`关键词「${keyword.trim()}」`] : []),
    ...(effectiveStatus
      ? [`状态「${COURSE_STATUS_LABELS[effectiveStatus as CourseStatus]}」`]
      : []),
    ...(effectiveTerm ? [`学期「${effectiveTerm}」`] : []),
  ];

  const summary = describeFilterSummary({
    visibleCount: visibleCourses.length,
    totalCount: courses.length,
    unit: "门课程",
    conditions,
    idleHint: "可按课程名称、课程号或学期搜索",
  });

  function resetFilters() {
    setKeyword("");
    setStatus("");
    setTerm("");
  }

  function handleDeleted(result: TeacherCourseDeletionResult) {
    setCourses((items) => items.filter((course) => course.id !== result.id));
    setSuccessMessage(`课程“${result.name}”已删除，历史教学数据已保留。`);
  }

  return (
    <section className="tc-course-library space-y-4">
      {successMessage ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {successMessage}
        </div>
      ) : null}

      {courses.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {createEntry ?? (
            <EmptyState
              description="先基于课程模板创建一门课程，再在课程建设中创建班级。"
              icon={School}
              title="暂无课程"
            />
          )}
        </div>
      ) : (
        <>
          <div className="tc-course-filters tt-fbar">
            <div aria-label="课程状态" className="tt-tabs" role="tablist">
              {statusTabs.map((tab) => (
                <button
                  aria-selected={effectiveStatus === tab.value}
                  className="tt-tab"
                  key={tab.value || "all"}
                  onClick={() => setStatus(tab.value)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                  <em>{tab.count}</em>
                </button>
              ))}
            </div>

            <div className="tt-search">
              <Search
                aria-hidden="true"
                className="size-3.5 shrink-0 text-slate-400"
              />
              <input
                aria-label="搜索课程"
                autoComplete="off"
                maxLength={80}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索课程名称、课程号或学期"
                type="search"
                value={keyword}
              />
              {keyword.length > 0 ? (
                <button
                  aria-label="清除搜索关键词"
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-600"
                  onClick={() => setKeyword("")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </div>

            <select
              aria-label="按学期筛选"
              onChange={(event) => setTerm(event.target.value)}
              value={effectiveTerm}
            >
              <option value="">全部学期</option>
              {termOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              aria-label="排序方式"
              onChange={(event) =>
                setSortBy(event.target.value as CourseSortKey)
              }
              value={sortBy}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {isFiltered ? (
              <button
                className="tt-btn-ghost"
                onClick={resetFilters}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
                重置
              </button>
            ) : null}
          </div>

          <p aria-live="polite" className="tt-hint">
            {summary}
          </p>

          {visibleCourses.length === 0 ? (
            <EmptyState
              action={
                <button
                  className="tt-btn-line"
                  onClick={resetFilters}
                  type="button"
                >
                  清除筛选条件
                </button>
              }
              description={`当前条件：${conditions.join("、")}。可以放宽条件，或清除全部条件查看全部 ${courses.length} 门课程。`}
              icon={SearchX}
              title="没有匹配的课程"
            />
          ) : (
            <div className="tc-course-catalog">
              {visibleCourses.map((course) => (
                <article className="tc-course-row" key={course.id}>
                  <span className="tc-course-symbol" aria-hidden="true">
                    <BookOpenCheck className="size-6" />
                  </span>
                  <div className="tc-course-main">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        className="tc-course-title"
                        href={`/teacher/courses/${course.id}`}
                      >
                        {course.name}
                      </Link>
                      <span className={COURSE_STATUS_STYLES[course.status]}>
                        {COURSE_STATUS_LABELS[course.status]}
                      </span>
                    </div>
                    <p className="tc-course-meta">
                      课程号 {course.courseNo} · {course.term}
                    </p>
                    {course.description ? (
                      <p className="tc-course-description">
                        {course.description}
                      </p>
                    ) : null}
                    <div className="tc-course-shortcuts">
                      <Link href={`/teacher/courses/${course.id}/classrooms`}>
                        课程班级
                      </Link>
                      <Link href={`/teacher/courses/${course.id}/syllabus`}>
                        教学大纲
                      </Link>
                      <Link
                        href={`/teacher/courses/${course.id}/knowledge-graph`}
                      >
                        知识图谱
                      </Link>
                    </div>
                  </div>
                  <dl className="tc-course-stats">
                    <div>
                      <dt>课程班级</dt>
                      <dd>
                        {course.classroomCount}
                        <span> 个</span>
                      </dd>
                    </div>
                    <div>
                      <dt>开课班级</dt>
                      <dd>
                        {course.activeClassroomCount}
                        <span> 个</span>
                      </dd>
                    </div>
                    <div>
                      <dt>学生人次</dt>
                      <dd>{course.activeStudentCount}</dd>
                    </div>
                  </dl>
                  <div className="tc-course-actions">
                    <Link
                      className="tt-btn"
                      href={`/teacher/courses/${course.id}`}
                    >
                      进入课程
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
                    <CourseDeleteAction
                      course={course}
                      onDeleted={handleDeleted}
                    />
                  </div>
                </article>
              ))}
              {createEntry ? (
                <div className="tc-create-row">{createEntry}</div>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
