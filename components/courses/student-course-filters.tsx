"use client";

import { BookOpenCheck, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import { StudentJoinClassroomButton } from "@/components/classrooms/student-join-classroom-button";
import { EmptyState } from "@/components/dashboard/empty-state";

const tabs = [
  { id: "all", label: "全部" },
  { id: "active", label: "学习中" },
  { id: "ended", label: "已结束" },
] as const;

const courseListPath = "/student/courses";

export type StudentCourseCardItem = {
  id: string;
  readOnly: boolean;
  ratio: number | null;
  searchText: string[];
  card: ReactNode;
};

function updateFilter(href: string) {
  const url = new URL(href, window.location.origin);
  url.hash = window.location.hash;
  const current = window.location;
  if (url.href !== current.href) window.history.pushState(null, "", url);
}

function followFilter(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  updateFilter(event.currentTarget.href);
}

export function StudentCourseFilters({
  courses,
  activeCount,
}: {
  courses: StudentCourseCardItem[];
  activeCount: number;
}) {
  const params = useSearchParams();
  const selected = params.getAll("status");
  const status =
    selected.length === 1 &&
    (selected[0] === "active" || selected[0] === "ended")
      ? selected[0]
      : "all";
  const keywords = params.getAll("q");
  const keyword = keywords.length === 1 ? keywords[0].trim().slice(0, 120) : "";
  const sorts = params.getAll("sort");
  const sort =
    sorts.length === 1 && sorts[0] === "progress" ? "progress" : "default";
  const counts = {
    all: courses.length,
    active: activeCount,
    ended: courses.length - activeCount,
  };
  const needle = keyword.toLocaleLowerCase("zh-CN");
  const visible = courses.filter(
    ({ readOnly, searchText }) =>
      (status === "all" || (status === "ended" ? readOnly : !readOnly)) &&
      (!needle ||
        searchText.some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(needle),
        )),
  );
  if (sort === "progress")
    visible.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
  const href = (
    nextStatus: typeof status,
    nextSort: typeof sort,
    q = keyword,
  ) =>
    `${courseListPath}?${new URLSearchParams({ status: nextStatus, sort: nextSort, q })}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <nav
          aria-label="课程状态"
          className="bg-muted flex flex-wrap gap-1 rounded-md p-1"
        >
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={href(tab.id, sort)}
              onClick={followFilter}
              aria-current={status === tab.id ? "page" : undefined}
              className={`text-brand-strong focus-visible:outline-brand-strong inline-flex min-h-10 items-center gap-1 rounded px-2.5 text-sm focus-visible:outline-2 ${status === tab.id ? "bg-card font-semibold shadow-sm" : "hover:bg-card/70"}`}
            >
              {tab.label}{" "}
              <span className="text-xs tabular-nums">{counts[tab.id]}</span>
            </a>
          ))}
        </nav>
        <form
          action={courseListPath}
          onSubmit={(event) => {
            event.preventDefault();
            const nextKeyword = String(
              new FormData(event.currentTarget).get("q") ?? "",
            )
              .trim()
              .slice(0, 120);
            updateFilter(href(status, sort, nextKeyword));
          }}
          className="flex min-w-0 flex-[1_1_16rem] flex-wrap gap-2"
        >
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="sort" value={sort} />
          <label className="workspace-search-field flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border px-3">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-500"
            />
            <span className="sr-only">搜索课程名、班级名或课程号</span>
            <input
              key={keyword}
              name="q"
              type="search"
              autoComplete="off"
              defaultValue={keyword}
              maxLength={120}
              placeholder="搜索课程名或班级名"
              className="w-full min-w-0 bg-transparent text-base outline-none sm:text-sm"
            />
          </label>
          <button
            type="submit"
            className="border-border bg-card focus-visible:outline-brand-strong min-h-11 rounded-md border px-3 text-sm focus-visible:outline-2"
          >
            搜索
          </button>
        </form>
        <a
          href={href(status, sort === "progress" ? "default" : "progress")}
          onClick={followFilter}
          className="border-border bg-card focus-visible:outline-brand-strong inline-flex min-h-11 items-center rounded-md border px-3 text-sm focus-visible:outline-2"
        >
          {sort === "progress" ? "恢复默认排序" : "按进度排序"}
        </a>
      </div>
      {!visible.length && (
        <EmptyState
          icon={BookOpenCheck}
          title={courses.length ? "没有符合条件的教学班" : "暂未加入课程"}
          description={
            courses.length
              ? "调整课程状态或搜索词后再试。"
              : "使用教师提供的邀请码加入教学班。"
          }
        />
      )}
      <div className="grid gap-3 @min-[33rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
        {visible.map(({ id, card }) => (
          <Fragment key={id}>{card}</Fragment>
        ))}
        {status !== "ended" && <StudentJoinClassroomButton card />}
      </div>
    </>
  );
}
