import { StudentHomeExams } from "./student-home-exams";
import { StudentPageLink } from "./student-page-link";
import React, { type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
} from "lucide-react";
import { FOCUS_RING } from "./ui-focus";
import { StudentEnrollmentPicker } from "./student-enrollment-picker";
import { HomeKnowledgeMatrix } from "./home-knowledge-matrix";
import { StudentAssignmentRings } from "./student-assignment-rings";
import { StudentHomeTasks } from "./student-home-tasks";
import type {
  StudentHomeExamResult,
  StudentClassAnalysis,
} from "@/services/dashboard/student-class-analytics";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

export function StudentHomeInsights({
  classes,
  selected,
  knowledge,
  overview,
  now = new Date(),
  exams = { recent: null, missed: 0, scoredCount: 0, average: null },
  examClassAverage = null,
}: {
  classes: StudentClassAnalysis[];
  selected?: StudentClassAnalysis;
  knowledge?: ReactNode;
  overview: StudentTaskOverview;
  now?: Date;
  exams?: {
    recent: StudentHomeExamResult | null;
    missed: number;
    scoredCount: number;
    average: number | null;
  };
  examClassAverage?: number | null;
}) {
  const current = classes.filter(
    (x) => x.classroom.status === "ACTIVE" && x.course.status !== "ARCHIVED",
  );
  const total = current.reduce((n, c) => n + c.total, 0);
  const submitted = current.reduce((n, c) => n + c.submitted, 0);
  const includesExams = current.some(
    (c) => c.total > c.assignmentProgress.total,
  );
  const weekEnd = now.getTime() + 7 * 86_400_000;
  const dueSoon = overview.items.filter(
    (item) =>
      item.status !== "DONE" &&
      item.dueAt >= now &&
      item.dueAt.getTime() <= weekEnd,
  );
  const dueBreakdown = (
    ["assignment", "exam", "attendance", "survey"] as const
  ).flatMap((kind) => {
    const count = dueSoon.filter((item) => item.kind === kind).length;
    const labels = {
      assignment: "作业",
      exam: "考试",
      attendance: "签到",
      survey: "问卷",
    };
    return count ? [`${labels[kind]} ${count}`] : [];
  });
  const metrics = [
    {
      label: "在学课程",
      icon: BookOpen,
      href: "/student/courses",
      value: current.length,
      unit: "门",
      detail: "按已加入班级分别统计",
    },
    {
      label: "7 天内截止",
      icon: CalendarClock,
      href: "/student/tasks",
      value: dueSoon.length,
      unit: "项",
      detail: dueBreakdown.join(" · ") || "暂无 7 天内截止的任务",
      note: exams.missed ? `已错过 ${exams.missed} 场考试` : null,
    },
    {
      label: "任务提交率",
      icon: ClipboardCheck,
      href: "/student/analytics",
      value: total ? `${Math.round((submitted / total) * 100)}%` : null,
      unit: "",
      detail: total
        ? `已交 ${submitted}/${total} 项${includesExams ? " · 含已结束考试" : ""}`
        : "暂无已开放任务",
    },
    {
      label: "线上考试均分",
      icon: ChartColumn,
      href: "/student/exams",
      value: exams.average,
      emptyLabel: "暂无成绩",
      unit: exams.average === null ? "" : "分",
      detail: exams.scoredCount
        ? `${exams.scoredCount} 场线上考试已公布成绩`
        : overview.counts.exam
          ? `${overview.counts.exam} 场考试已开放 · 成绩未公布`
          : overview.counts.examUpcoming
            ? `${overview.counts.examUpcoming} 场考试待开考`
            : "暂无已公布的线上考试成绩",
    },
  ];
  const profileHref = selected
    ? `/student/courses/${selected.course.id}/profile?${new URLSearchParams({ classroomId: selected.classroom.id })}`
    : "/student/courses";
  const examCards = {
    next: overview.nextExam,
    recent: exams.recent,
    classAverage: examClassAverage,
    upcomingCount: overview.counts.examUpcoming,
    now,
  };
  return (
    <section aria-label="学习主页数据看板" className="space-y-6">
      <ul
        aria-label="学习概览"
        className="grid grid-cols-2 gap-3 @min-[48rem]:grid-cols-4"
      >
        {metrics.map(
          ({
            icon: Icon,
            label,
            href,
            value,
            unit,
            detail,
            note,
            emptyLabel,
          }) => (
            <li key={label} className="min-w-0">
              <StudentPageLink
                href={href}
                className={`group text-foreground hover:border-brand/65 border-border bg-card flex h-full min-w-0 flex-col gap-2 rounded-xl border p-3 transition-colors sm:px-4 ${FOCUS_RING}`}
              >
                <div className="flex min-w-0 items-start justify-between gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="bg-brand/10 text-brand-strong grid size-7 shrink-0 place-items-center rounded-lg">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <h2 className="text-sm font-medium [overflow-wrap:anywhere]">
                      {label}
                    </h2>
                  </div>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-muted-foreground group-hover:text-brand mt-1 size-4 shrink-0"
                  />
                </div>
                <p className="flex min-h-8 flex-wrap items-baseline gap-x-1">
                  {value === null ? (
                    <span className="text-muted-foreground self-center text-sm font-semibold">
                      {emptyLabel ?? "暂无数据"}
                    </span>
                  ) : (
                    <>
                      <span className="text-2xl leading-8 font-semibold tabular-nums">
                        {value}
                      </span>
                      {unit && (
                        <span className="text-muted-foreground text-xs font-medium">
                          {unit}
                        </span>
                      )}
                    </>
                  )}
                </p>
                <p className="text-muted-foreground text-xs leading-5">
                  {detail}
                </p>
                {note && (
                  <p className="text-xs font-medium text-rose-700">{note}</p>
                )}
              </StudentPageLink>
            </li>
          ),
        )}
      </ul>
      <div className="grid gap-5 has-[details[open]]:items-start @min-[48rem]:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div
          aria-label="考试安排与任务"
          className="flex min-w-0 flex-col gap-5"
        >
          <StudentHomeExams {...examCards} slot="next" />
          <StudentHomeTasks overview={overview} dashboard />
          <StudentAssignmentRings classes={current} dashboard />
        </div>
        <div
          aria-label="知识掌握与考试回顾"
          className="flex min-w-0 flex-col gap-5"
        >
          <section
            aria-labelledby="home-knowledge-heading"
            className="border-border bg-card flex min-w-0 flex-1 flex-col rounded-[1.25rem] border p-4 sm:p-5"
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="home-knowledge-heading" className="text-xl font-semibold">
                课程知识掌握
              </h2>
              {selected && (
                <StudentPageLink
                  href={`/student/courses/${selected.course.id}/learning-center?${new URLSearchParams({ classroomId: selected.classroom.id, tab: "knowledge" })}`}
                  className={`inline-flex min-h-10 items-center rounded-md text-sm font-medium underline-offset-4 hover:underline ${FOCUS_RING}`}
                >
                  查看课程详情
                </StudentPageLink>
              )}
            </header>
            {selected && (
              <div className="mt-3">
                <StudentEnrollmentPicker
                  contexts={classes.map((item) => ({
                    course: item.course,
                    classroom: item.classroom,
                  }))}
                  selectedId={selected.classroom.id}
                  action="/student"
                />
              </div>
            )}
            {knowledge ?? (
              <HomeKnowledgeMatrix
                chapters={[]}
                profileHref={profileHref}
                generatedAt={null}
                profileRevision={null}
                dashboard
              />
            )}
          </section>
          <StudentHomeExams {...examCards} slot="recent" />
        </div>
      </div>
    </section>
  );
}
