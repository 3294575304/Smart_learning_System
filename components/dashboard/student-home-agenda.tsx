import React from "react";

import { ArrowRight, ClipboardList } from "lucide-react";

import { StudentPageLink } from "./student-page-link";
import { FOCUS_RING } from "./ui-focus";
import { dueLabel, overdueDays } from "./student-time";
import {
  studentTaskContext,
  type StudentTaskOverview,
} from "@/services/dashboard/student-task-overview";
import type { StudentHomePulse } from "@/services/dashboard/student-home-pulse";

type Tone = "overdue" | "active" | "upcoming";
type Row = {
  id: string;
  title: string;
  meta: string;
  when: string;
  action: string;
  href: string;
  tone: Tone;
};

/** 今日任务仅显示待办；已提交记录与错题复习分别进入独立区域。 */
function buildRows(
  overview: StudentTaskOverview,
  pulse: StudentHomePulse,
  now: Date,
): Row[] {
  const inProgress = new Map(
    pulse.inProgress.map((row) => [row.assignmentId, row]),
  );
  const pending: Row[] = overview.pendingItems.slice(0, 4).map((item) => {
    const draft =
      item.kind === "assignment"
        ? inProgress.get(item.id.replace(/^assignment:/, ""))
        : undefined;
    const overdue = item.dueAt < now;
    const when = overdue
      ? `已逾期 ${overdueDays(item.dueAt, now)} 天`
      : item.kind === "exam" && item.opensAt && item.opensAt > now
        ? dueLabel(item.opensAt, now)
        : dueLabel(item.dueAt, now);
    const detail = [
      studentTaskContext(item) || null,
      draft
        ? `已答 ${draft.answered} / ${draft.total} 题`
        : item.kind === "exam" && item.windowMinutes
          ? `${item.state} · 限时 ${item.windowMinutes} 分钟`
          : item.state,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: item.id,
      title: item.title,
      meta: detail,
      when,
      action:
        overdue && item.kind === "assignment"
          ? "立即补交"
          : draft
            ? "继续做题"
            : item.action,
      href: draft?.href ?? item.href,
      tone: overdue
        ? "overdue"
        : item.status === "UPCOMING"
          ? "upcoming"
          : "active",
    };
  });

  return pending;
}

export function StudentHomeAgenda({
  overview,
  pulse,
  now,
}: {
  overview: StudentTaskOverview;
  pulse: StudentHomePulse;
  now: Date;
}) {
  const rows = buildRows(overview, pulse, now);
  const draft = pulse.inProgress[0];
  const next = draft
    ? Math.min(draft.answered + 1, Math.max(draft.total, 1))
    : null;
  return (
    <section
      aria-labelledby="student-agenda-heading"
      className="workspace-panel st-home-panel st-agenda-panel border-border bg-card flex min-w-0 flex-col rounded-lg border p-4"
    >
      <header className="st-panel-header flex items-center justify-between gap-3">
        <h2 id="student-agenda-heading">今日任务</h2>
        <StudentPageLink
          className={`st-section-link ${FOCUS_RING}`}
          href="/student/tasks"
        >
          全部任务
          <ArrowRight aria-hidden="true" className="size-3" />
        </StudentPageLink>
      </header>
      {rows.length ? (
        <ul className="st-agenda">
          {rows.map((row) => (
            <li className={`st-agenda-row is-${row.tone}`} key={row.id}>
              <span className="st-agenda-symbol" aria-hidden="true">
                <ClipboardList />
              </span>
              <div className="st-agenda-main">
                <StudentPageLink
                  className={`st-agenda-title ${FOCUS_RING}`}
                  href={row.href}
                >
                  {row.title}
                </StudentPageLink>
                <p className="st-agenda-meta">{row.meta}</p>
              </div>
              <p className="st-agenda-when">{row.when}</p>
              <StudentPageLink
                className={`st-agenda-action is-${row.tone} ${FOCUS_RING}`}
                href={row.href}
              >
                {row.action}
              </StudentPageLink>
            </li>
          ))}
        </ul>
      ) : (
        <div className="st-panel-empty">
          <p>今天没有待办</p>
          <p className="mt-2">
            可以到「练习中心」按推荐练一组，或复习历史错题。
          </p>
          <StudentPageLink
            className={`st-section-link mt-3 ${FOCUS_RING}`}
            href="/student/recommendations"
          >
            进入练习中心
            <ArrowRight aria-hidden="true" className="size-3" />
          </StudentPageLink>
        </div>
      )}
      {draft ? (
        <StudentPageLink
          className={`st-resume mt-4 ${FOCUS_RING}`}
          href={draft.href}
        >
          <span className="st-resume-label">上次做到</span>
          <span className="st-resume-title">
            {draft.title}
            {draft.total > 0 ? ` · 第 ${next} 题` : ""}
          </span>
          <span className="st-resume-action">
            接着做
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </span>
        </StudentPageLink>
      ) : null}
    </section>
  );
}
