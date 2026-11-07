import { StudentPageLink } from "./student-page-link";
import React, { type ReactNode } from "react";
import { StudentEnrollmentPicker } from "./student-enrollment-picker";
import { HomeKnowledgeMatrix } from "./home-knowledge-matrix";
import { StudentAssignmentRings } from "./student-assignment-rings";
import { StudentHomeTasks } from "./student-home-tasks";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

export function StudentHomeInsights({
  classes,
  selected,
  knowledge,
  overview,
  now = new Date(),
}: {
  classes: StudentClassAnalysis[];
  selected?: StudentClassAnalysis;
  knowledge?: ReactNode;
  overview: StudentTaskOverview;
  now?: Date;
}) {
  const current = classes.filter(
    (x) => x.classroom.status === "ACTIVE" && x.course.status !== "ARCHIVED",
  );
  const total = current.reduce((n, c) => n + c.total, 0),
    submitted = current.reduce((n, c) => n + c.submitted, 0),
    released = current.reduce((n, c) => n + c.publishedCount, 0);
  // 待办总数已在「我的待办」卡的环图里显示，这里换成更有行动价值的「7 天内截止」。
  const weekEnd = now.getTime() + 7 * 86_400_000;
  const dueSoon = overview.items.filter(
    (item) => item.dueAt.getTime() <= weekEnd,
  ).length;
  const overdue = overview.items.filter(
    (item) => item.dueAt.getTime() < now.getTime(),
  ).length;
  const metrics = [
    {
      label: "在学课程",
      value: current.length,
      unit: "门",
      detail: "按已加入班级分别统计",
    },
    {
      label: "7 天内截止",
      value: dueSoon,
      unit: "项",
      detail: overdue ? `其中 ${overdue} 项已逾期` : "含作业、签到与问卷",
    },
    {
      label: "作业提交率",
      value: total ? `${Math.round((submitted / total) * 100)}%` : "—",
      unit: "",
      detail: total
        ? `已交 ${submitted}/${total} 项正式作业`
        : "暂无已开放正式作业",
    },
    {
      label: "已公布作业",
      value: released,
      unit: "份",
      detail: "仅含已公布的作答结果",
    },
  ];
  const profileHref = selected
    ? `/student/courses/${selected.course.id}/profile?${new URLSearchParams({ classroomId: selected.classroom.id })}`
    : "/student/courses";
  return (
    <section aria-label="学习主页数据看板" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <article
            key={m.label}
            className="min-w-0 rounded-xl border border-sky-100 bg-white px-4 py-3"
          >
            <h2 className="text-xs font-medium text-slate-600">{m.label}</h2>
            <p className="mt-1 text-2xl font-semibold text-slate-950 tabular-nums">
              {m.value}
              <span className="ml-1 text-xs font-normal text-slate-600">
                {m.unit}
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{m.detail}</p>
          </article>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <StudentHomeTasks overview={overview} />
          <StudentAssignmentRings classes={current} />
        </div>
        <section
          aria-labelledby="home-knowledge-heading"
          className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"
        >
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="home-knowledge-heading"
              className="font-semibold text-slate-950"
            >
              课程知识掌握
            </h2>
            {selected && (
              <StudentPageLink
                href={`/student/courses/${selected.course.id}/learning-center?${new URLSearchParams({ classroomId: selected.classroom.id, tab: "knowledge" })}`}
                className="inline-flex min-h-10 items-center rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700"
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
            />
          )}
        </section>
      </div>
    </section>
  );
}
