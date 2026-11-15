import React from "react";

import { ArrowRight } from "lucide-react";

import { relativeTime } from "./student-time";
import { StudentPageLink } from "./student-page-link";
import { FOCUS_RING } from "./ui-focus";

/**
 * 错题本只报三个事实：还欠几道、这一周新进来几道、上次复习是什么时候。
 * 数字用红色，因为它和"待完成作业"一样属于"压着的事"，不是荣誉指标。
 */
export function StudentWrongBookCard({
  open,
  newInWeek,
  lastReviewedAt,
  now,
}: {
  open: number;
  newInWeek: number;
  lastReviewedAt: Date | null;
  now: Date;
}) {
  return (
    <section
      aria-labelledby="student-wrongbook-heading"
      className="workspace-panel st-home-panel st-wrongbook-panel border-border bg-card rounded-lg border p-4"
    >
      <header className="st-panel-header flex items-center justify-between gap-2">
        <h2
          id="student-wrongbook-heading"
          className="text-[13px] font-semibold text-neutral-900"
        >
          错题本
        </h2>
      </header>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[12px] leading-5 text-neutral-600">
          <span className="st-wrongbook-count">{open}</span> 道待复习
          <span className="mt-1 block text-[10.5px] text-neutral-500">
            {newInWeek > 0
              ? `最近 7 天新增 ${newInWeek} 道`
              : "最近 7 天没有新增"}
          </span>
        </p>
        <p className="shrink-0 text-right text-[10.5px] text-neutral-500">
          {lastReviewedAt
            ? `${relativeTime(lastReviewedAt, now)}复习`
            : "尚未开始复习"}
        </p>
      </div>
      <StudentPageLink
        className={`st-wrongbook-cta text-brand-strong inline-flex items-center gap-1 rounded text-[11.5px] font-medium hover:underline ${FOCUS_RING}`}
        href="/student/wrong-questions"
      >
        开始复习
        <ArrowRight aria-hidden="true" className="size-3" />
      </StudentPageLink>
    </section>
  );
}
