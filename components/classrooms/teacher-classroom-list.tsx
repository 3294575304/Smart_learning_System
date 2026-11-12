"use client";

import type { ClassroomStatus } from "@prisma/client";
import { MoreHorizontal, School, SearchX, Users } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { DeleteClassroomButton } from "./delete-classroom-button";

import { EmptyState } from "@/components/dashboard/empty-state";
import {
  ListFilterBar,
  type ListFilterOption,
} from "@/components/dashboard/list-filter-bar";
import { useListFilterUrlSync } from "@/components/dashboard/use-list-filter-url-sync";
import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import type { TeacherClassroomListItem } from "@/services/classrooms/service";
import {
  describeFilterSummary,
  hasActiveFilterCondition,
  matchesFilterKeyword,
} from "@/lib/list-filter";

/** 教师端班级列表不返回归档班级，所以这里只列出实际可能出现的状态。 */
const CLASSROOM_STATUS_OPTIONS = (
  ["ACTIVE", "COMPLETED", "CLOSED"] as const
).map((value) => ({ value, label: CLASSROOM_STATUS_LABELS[value] }));

export interface TeacherClassroomFilters {
  keyword: string;
  status: string;
  courseId: string;
}

/**
 * 关键词与状态、关联课程之间是「与」关系：任一条件不满足即排除。
 * 抽成纯函数便于直接断言组合筛选行为，不依赖 React 渲染。
 */
export function filterTeacherClassrooms(
  classrooms: TeacherClassroomListItem[],
  filters: TeacherClassroomFilters,
): TeacherClassroomListItem[] {
  const matchesKeyword = (classroom: TeacherClassroomListItem) =>
    matchesFilterKeyword(filters.keyword, [
      classroom.name,
      classroom.description,
      classroom.joinCode,
      classroom.course?.name,
      CLASSROOM_STATUS_LABELS[classroom.status],
    ]);

  return classrooms.filter((classroom) => {
    if (filters.status && classroom.status !== filters.status) return false;
    if (filters.courseId && classroom.course?.id !== filters.courseId)
      return false;
    return matchesKeyword(classroom);
  });
}

export function TeacherClassroomList({
  initialClassrooms,
  initialFilters = { keyword: "", status: "", courseId: "" },
  createEntry,
}: {
  initialClassrooms: TeacherClassroomListItem[];
  initialFilters?: TeacherClassroomFilters;
  createEntry?: React.ReactNode;
}) {
  const [classrooms, setClassrooms] = useState(initialClassrooms);
  const [keyword, setKeyword] = useState(initialFilters.keyword);
  const [status, setStatus] = useState(initialFilters.status);
  const [courseId, setCourseId] = useState(initialFilters.courseId);

  useEffect(() => setClassrooms(initialClassrooms), [initialClassrooms]);

  // 关联课程选项来自当前数据，避免出现永远匹配不到的空选项
  const courseOptions = useMemo<ListFilterOption[]>(() => {
    const byId = new Map<string, string>();
    for (const classroom of classrooms) {
      if (classroom.course)
        byId.set(classroom.course.id, classroom.course.name);
    }
    return [...byId]
      .sort((left, right) => left[1].localeCompare(right[1], "zh-CN"))
      .map(([value, label]) => ({ value, label }));
  }, [classrooms]);

  // 分享链接里的课程可能已被删除、状态可能已失效：不合法就当作未筛选，
  // 否则会出现「下拉显示全部课程却一条也不显示」的死局
  const effectiveStatus = CLASSROOM_STATUS_OPTIONS.some(
    (option) => option.value === status,
  )
    ? status
    : "";
  const effectiveCourseId = courseOptions.some(
    (option) => option.value === courseId,
  )
    ? courseId
    : "";

  const visibleClassrooms = useMemo(
    () =>
      filterTeacherClassrooms(classrooms, {
        keyword,
        status: effectiveStatus,
        courseId: effectiveCourseId,
      }),
    [classrooms, effectiveCourseId, effectiveStatus, keyword],
  );

  const isFiltered = hasActiveFilterCondition({
    keyword,
    values: [effectiveStatus, effectiveCourseId],
  });

  useListFilterUrlSync({
    keyword: keyword.trim(),
    status: effectiveStatus,
    courseId: effectiveCourseId,
  });

  const conditions = [
    ...(keyword.trim() ? [`关键词「${keyword.trim()}」`] : []),
    ...(effectiveStatus
      ? [
          `状态「${CLASSROOM_STATUS_LABELS[effectiveStatus as ClassroomStatus]}」`,
        ]
      : []),
    ...(effectiveCourseId
      ? [
          `关联课程「${courseOptions.find((option) => option.value === effectiveCourseId)?.label ?? "已失效"}」`,
        ]
      : []),
  ];

  const summary = describeFilterSummary({
    visibleCount: visibleClassrooms.length,
    totalCount: classrooms.length,
    unit: "个班级",
    conditions,
    idleHint: "可按班级名称、邀请码、关联课程搜索与筛选",
  });

  function resetFilters() {
    setKeyword("");
    setStatus("");
    setCourseId("");
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">全部班级</h2>
        <span className="text-muted-foreground text-sm">
          {isFiltered
            ? `筛选出 ${visibleClassrooms.length} / ${classrooms.length} 个`
            : `共 ${classrooms.length} 个`}
        </span>
      </div>

      {classrooms.length === 0 ? (
        createEntry ? null : (
          <EmptyState
            description="创建第一个班级后即可邀请学生加入。"
            icon={School}
            title="暂无班级"
          />
        )
      ) : (
        <>
          <div className="mb-4">
            <ListFilterBar
              filters={[
                {
                  key: "status",
                  label: "班级状态",
                  value: effectiveStatus,
                  allLabel: "全部状态",
                  options: CLASSROOM_STATUS_OPTIONS,
                  onChange: setStatus,
                },
                {
                  key: "course",
                  label: "关联课程",
                  value: effectiveCourseId,
                  allLabel: "全部课程",
                  options: courseOptions,
                  onChange: setCourseId,
                },
              ]}
              isFiltered={isFiltered}
              keyword={keyword}
              onKeywordChange={setKeyword}
              onReset={resetFilters}
              searchLabel="搜索班级"
              searchPlaceholder="班级名称、邀请码或关联课程"
              searchScope="班级名称、班级说明、邀请码、关联课程名称、班级状态；多个关键词用空格分隔，需同时命中"
              summary={summary}
            />
          </div>

          {visibleClassrooms.length === 0 ? (
            <EmptyState
              action={
                <button
                  className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                  onClick={resetFilters}
                  type="button"
                >
                  清除筛选条件
                </button>
              }
              description={`当前条件：${conditions.join("、")}。可以放宽条件，或清除全部条件查看全部 ${classrooms.length} 个班级。`}
              icon={SearchX}
              title="没有匹配的班级"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleClassrooms.map((classroom) => (
                <article
                  className="bg-card rounded-xl border p-5 transition-colors hover:bg-sky-50/70"
                  key={classroom.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      className="min-w-0 flex-1"
                      href={`/teacher/classrooms/${classroom.id}`}
                      prefetch={true}
                    >
                      <h3 className="truncate font-semibold">
                        {classroom.name}
                      </h3>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {classroom.description ?? "暂无班级说明"}
                      </p>
                    </Link>
                    <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                      {CLASSROOM_STATUS_LABELS[classroom.status]}
                    </span>
                    <details className="relative shrink-0">
                      <summary
                        aria-label={`更多操作：${classroom.name}`}
                        className="cursor-pointer list-none rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden"
                      >
                        <MoreHorizontal aria-hidden="true" className="size-5" />
                      </summary>
                      <div className="absolute end-0 top-full z-10 mt-1 w-36 rounded-xl border bg-white p-1 shadow-lg">
                        <DeleteClassroomButton
                          classroomId={classroom.id}
                          menu
                          onDeleted={(id) =>
                            setClassrooms((rows) =>
                              rows.filter((row) => row.id !== id),
                            )
                          }
                        />
                      </div>
                    </details>
                  </div>
                  <Link
                    className="block"
                    href={`/teacher/classrooms/${classroom.id}`}
                    prefetch={true}
                  >
                    <div className="text-muted-foreground mt-5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {classroom.studentCount} 名学生
                      </span>
                      {classroom.status === "ACTIVE" ? (
                        <span>邀请码 {classroom.joinCode}</span>
                      ) : (
                        <span>历史记录保留</span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">
                      关联课程：{classroom.course?.name ?? "无"}
                    </p>
                  </Link>
                </article>
              ))}
              {createEntry}
            </div>
          )}
        </>
      )}
      {visibleClassrooms.length === 0 && createEntry && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {createEntry}
        </div>
      )}
    </section>
  );
}
