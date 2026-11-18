"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import {
  parseGrowthRange,
  STUDENT_GROWTH_RANGES,
  studentCourseTabHref,
  type StudentGrowthRange,
} from "@/services/courses/student-workspace";

/**
 * 趋势页的时间区间与导出。区间通过 URL 表达，刷新和分享都能回到同一视图。
 */
export function GrowthRangeTabs({
  courseId,
  classroomId,
  panels,
}: {
  courseId: string;
  classroomId: string;
  panels: Record<StudentGrowthRange, ReactNode>;
}) {
  const range = parseGrowthRange(useSearchParams().get("range"));
  const base = studentCourseTabHref(courseId, classroomId, "growth", "trends");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          aria-label="趋势时间区间"
          className="bg-muted inline-flex rounded-lg p-0.5"
        >
          {STUDENT_GROWTH_RANGES.map((item) => {
            const active = item.id === range;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`text-ink-soft hover:text-ink inline-flex min-h-9 items-center rounded-md px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${
                  active ? "text-ink bg-white shadow-sm" : ""
                }`}
                href={`${base}&range=${item.id}`}
                key={item.id}
                prefetch={false}
                scroll={false}
                onNavigate={(event) => {
                  event.preventDefault();
                  if (!active)
                    window.history.pushState(
                      null,
                      "",
                      `${base}&range=${item.id}`,
                    );
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <a
          className="text-ink-body border-line bg-card hover:bg-muted inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          download
          href={`/api/student/courses/${encodeURIComponent(courseId)}/growth/export?${new URLSearchParams(
            { classroomId, range },
          ).toString()}`}
        >
          <Download aria-hidden="true" className="size-3.5" />
          导出 CSV
        </a>
      </div>
      {panels[range]}
    </>
  );
}
