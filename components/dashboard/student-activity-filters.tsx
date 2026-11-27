"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AutoSubmitSelect } from "@/components/filters/auto-submit-select";
import { examTypeLabels } from "@/services/exams/exam-types";
import type { StudentClassroomOption } from "./student-classroom-filter";
import {
  activityActionClass,
  activityCardClass,
  activityControlClass,
} from "./student-activity-styles";
import {
  activityHref,
  withAssignmentTaskReturn,
  activityKindLabels,
  activityStatusLabelFor,
  activityStatusOptions,
  type ActivityQuery,
  type ActivityView,
} from "@/services/student-experience/activity-query";

const defaultValues: Record<string, string> = {
  status: "ALL",
  kind: "ALL",
  examType: "ALL",
  range: "all",
};

/**
 * 列表筛选：仍保留 `<form method="get">` 供无 JS 场景使用，
 * 但有 JS 时走客户端过渡，避免整页刷新导致白屏、丢焦点和丢滚动位置。
 */
export function StudentActivityFilters({
  returnTo,
  view,
  query,
  classrooms,
  total,
}: {
  returnTo?: string;
  view: ActivityView;
  query: ActivityQuery;
  classrooms: StudentClassroomOption[];
  total: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState(query.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedHref = useRef<string | null>(null);
  const fixed = Boolean(query.courseId && query.classroomId);
  const classroom = classrooms.find(
    (option) => option.id === query.classroomId,
  );

  useEffect(() => {
    setKeyword(query.q ?? "");
  }, [query.q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function navigate(form: HTMLFormElement) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      if (defaultValues[key] === trimmed) return;
      params.append(key, trimmed);
    });
    const href = `/student/${view}${params.size ? `?${params}` : ""}`;
    if (pending && requestedHref.current === href) return;
    if (!pending && href === window.location.pathname + window.location.search)
      return;
    requestedHref.current = href;
    startTransition(() => router.push(href, { scroll: false }));
  }

  function scheduleKeywordSearch(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      if (value.trim() === (query.q ?? "")) return;
      navigate(form);
    }, 350);
  }

  return (
    <form
      ref={formRef}
      action={`/student/${view}`}
      method="get"
      aria-label="列表筛选"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        navigate(event.currentTarget);
      }}
      className={`${activityCardClass} relative transition-opacity ${pending ? "opacity-70" : ""}`}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="bg-brand absolute inset-x-0 top-0 h-0.5 animate-pulse rounded-t-xl"
        />
      )}
      {query.analysisReturn && (
        <input
          type="hidden"
          name="analysisReturn"
          value={query.analysisReturn}
        />
      )}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {query.courseId && (
        <input type="hidden" name="courseId" value={query.courseId} />
      )}
      <div className="flex flex-wrap items-end gap-3">
        {fixed ? (
          <div aria-label="当前教学班" className="min-w-0 flex-1 text-sm">
            <input type="hidden" name="classroomId" value={query.classroomId} />
            <p className="font-medium text-slate-700">当前教学班</p>
            <p className="mt-1 break-words text-slate-600">
              {[classroom?.courseName, classroom?.name, classroom?.term]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : (
          <label className="min-w-0 flex-[2_1_14rem] space-y-1 text-sm font-medium text-slate-700">
            <span>教学班</span>
            <AutoSubmitSelect
              key={query.classroomId}
              name="classroomId"
              defaultValue={query.classroomId ?? ""}
              className={activityControlClass}
            >
              <option value="">全部教学班</option>
              {classrooms.map((option) => (
                <option key={option.id} value={option.id}>
                  {[option.courseName, option.name, option.term]
                    .filter(Boolean)
                    .join(" · ")}
                  {option.inactive ? "（已退出）" : ""}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        )}
        {view === "tasks" && (
          <label className="min-w-0 flex-[1_1_8rem] space-y-1 text-sm font-medium text-slate-700">
            <span>任务类型</span>
            <AutoSubmitSelect
              key={query.kind}
              name="kind"
              defaultValue={query.kind}
              className={activityControlClass}
            >
              {Object.entries(activityKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        )}
        <label className="min-w-0 flex-[1_1_8rem] space-y-1 text-sm font-medium text-slate-700">
          <span>状态</span>
          <AutoSubmitSelect
            key={query.status}
            name="status"
            defaultValue={query.status}
            className={activityControlClass}
          >
            {activityStatusOptions[view].map((status) => (
              <option key={status} value={status}>
                {activityStatusLabelFor(view, status)}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        {view === "exams" && (
          <>
            <label className="min-w-0 flex-[1_1_8rem] space-y-1 text-sm font-medium text-slate-700">
              <span>时间范围</span>
              <AutoSubmitSelect
                key={query.range}
                name="range"
                defaultValue={query.range}
                className={activityControlClass}
              >
                <option value="all">全部学期</option>
                <option value="term">仅本学期</option>
              </AutoSubmitSelect>
            </label>
            <label className="min-w-0 flex-[1_1_8rem] space-y-1 text-sm font-medium text-slate-700">
              <span>考试类型</span>
              <AutoSubmitSelect
                key={query.examType}
                name="examType"
                defaultValue={query.examType}
                className={activityControlClass}
              >
                <option value="ALL">全部类型</option>
                {Object.entries(examTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AutoSubmitSelect>
            </label>
            <label className="min-w-0 flex-[1_1_10rem] space-y-1 text-sm font-medium text-slate-700">
              <span>关键词</span>
              <span className="relative block">
                <input
                  type="search"
                  name="q"
                  value={keyword}
                  maxLength={50}
                  placeholder="按考试名称搜索"
                  aria-label="按考试名称搜索"
                  onChange={(event) => {
                    const value = event.target.value;
                    setKeyword(value);
                    scheduleKeywordSearch(value);
                  }}
                  className={`${activityControlClass} pe-9`}
                />
                {keyword && (
                  <button
                    type="button"
                    aria-label="清空关键词"
                    onClick={() => {
                      setKeyword("");
                      if (timer.current) clearTimeout(timer.current);
                      const form = formRef.current;
                      if (form) {
                        const input = form.elements.namedItem("q");
                        if (input instanceof HTMLInputElement) input.value = "";
                        navigate(form);
                      }
                    }}
                    className="hover:bg-muted absolute end-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:text-slate-700"
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
            <button type="submit" className={activityActionClass}>
              搜索
            </button>
          </>
        )}
        <noscript>
          <button className={activityActionClass} type="submit">
            应用筛选
          </button>
        </noscript>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p role="status" aria-live="polite">
          {pending ? "正在筛选…" : `共 ${total} 项`}
        </p>
        {(query.status !== "ALL" ||
          query.kind !== "ALL" ||
          query.examType !== "ALL" ||
          query.range !== "all" ||
          Boolean(query.q) ||
          (query.classroomId && !fixed)) && (
          <Link
            className="text-brand-strong rounded px-2 py-1 font-medium hover:underline focus-visible:outline-2"
            href={withAssignmentTaskReturn(
              activityHref(view, {
                analysisReturn: query.analysisReturn,
                courseId: query.courseId,
                classroomId: fixed ? query.classroomId : undefined,
              }),
              returnTo,
            )}
          >
            重置筛选
          </Link>
        )}
      </div>
    </form>
  );
}
