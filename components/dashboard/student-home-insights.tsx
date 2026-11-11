import { StudentHomeExams } from "./student-home-exams";
import { StudentPageLink } from "./student-page-link";
import React, { type ReactNode } from "react";
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
      value: current.length,
      unit: "门",
      detail: "按已加入班级分别统计",
    },
    {
      label: "7 天内截止",
      value: dueSoon.length,
      unit: "项",
      detail: dueBreakdown.join(" · ") || "暂无 7 天内截止的任务",
      note: exams.missed ? `已错过 ${exams.missed} 场考试` : null,
    },
    {
      label: "任务提交率",
      value: total ? `${Math.round((submitted / total) * 100)}%` : "—",
      unit: "",
      detail: total
        ? `已交 ${submitted}/${total} 项${includesExams ? " · 含已结束考试" : ""}`
        : "暂无已开放任务",
    },
    {
      label: "线上考试均分",
      value: exams.average ?? "—",
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
      <div className="grid grid-cols-2 gap-3 @min-[48rem]:grid-cols-4">
        {metrics.map((m) => (
          <article
            key={m.label}
            className="min-w-0 rounded-2xl border border-neutral-300 bg-neutral-100 px-4 py-3"
          >
            <h2 className="text-sm font-medium text-neutral-600">{m.label}</h2>
            <p className="mt-0.5 text-3xl font-medium text-neutral-950 tabular-nums">
              {m.value}
              <span className="ms-1 text-lg font-normal">{m.unit}</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              {m.detail}
            </p>
            {m.note && (
              <p className="mt-1 text-xs font-medium text-rose-700">{m.note}</p>
            )}
          </article>
        ))}
      </div>
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
            className="flex min-w-0 flex-1 flex-col rounded-[1.25rem] border border-neutral-300 bg-neutral-100 p-4 sm:p-5"
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="home-knowledge-heading" className="text-xl font-semibold">
                课程知识掌握
              </h2>
              {selected && (
                <StudentPageLink
                  href={`/student/courses/${selected.course.id}/learning-center?${new URLSearchParams({ classroomId: selected.classroom.id, tab: "knowledge" })}`}
                  className="inline-flex min-h-10 items-center rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-sky-700"
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
