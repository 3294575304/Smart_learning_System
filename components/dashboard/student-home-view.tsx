import { ArrowRight, CalendarClock, PlayCircle } from "lucide-react";
import React, { type ReactNode } from "react";

import { StudentPageLink } from "./student-page-link";
import { FOCUS_RING } from "./ui-focus";
import { greeting, kickerDate, relativeTime } from "./student-time";
import type { StudentHomePulse } from "@/services/dashboard/student-home-pulse";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

export function StudentHomeView({
  name,
  overview,
  pulse,
  week = null,
  now = new Date(),
  insights,
}: {
  name: string;
  overview: StudentTaskOverview;
  pulse?: StudentHomePulse;
  week?: number | null;
  now?: Date;
  insights?: ReactNode;
}) {
  const pendingAssignments = overview.pendingItems.filter(
    (item) => item.kind === "assignment",
  );
  const lastActive = pulse?.lastActiveAt ?? null;
  const continueHref =
    pulse?.inProgress[0]?.href ?? pulse?.finished[0]?.href ?? "/student/tasks";

  return (
    <section className="workspace-home text-foreground @container min-w-0">
      <header className="workspace-page-header flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="st-kicker">
            {kickerDate(now)}
            {week ? <em>· 第 {week} 周</em> : null}
          </p>
          <h1 className="min-w-0 text-[26px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
            {greeting(now)}，{name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {pendingAssignments.length > 0
              ? `今天还有 ${pendingAssignments.length} 份作业没交`
              : overview.total > 0
                ? `还有 ${overview.total} 项待办要处理`
                : "今天的作业都交齐了"}
            {lastActive
              ? `，最近一次学习在${relativeTime(lastActive, now)}。`
              : "，可以从一次练习开始。"}
          </p>
        </div>
        <p className="sr-only">
          先处理临近截止的任务，再看学习进展。首页最多展示 4 项待办。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StudentPageLink
            href="/student/recommendations"
            className={`border-border bg-card hover:bg-muted inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3.5 text-sm font-medium text-neutral-800 ${FOCUS_RING}`}
          >
            <CalendarClock aria-hidden="true" className="size-3.5" />
            学习计划
          </StudentPageLink>
          <StudentPageLink
            href={continueHref}
            className={`st-btn-cta bg-brand hover:bg-brand-strong border-brand inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3.5 text-sm font-medium text-white ${FOCUS_RING}`}
          >
            <PlayCircle aria-hidden="true" className="size-3.5" />
            继续学习
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </StudentPageLink>
        </div>
      </header>
      {insights ?? null}
    </section>
  );
}
