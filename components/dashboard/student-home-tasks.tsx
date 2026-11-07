"use client";
import { StudentPageLink } from "./student-page-link";
import React, { useState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { StudentTaskList } from "./student-task-list";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskOverview,
  type StudentTaskKind,
} from "@/services/dashboard/student-task-overview";

const taskColors = {
  assignment: "#0369a1",
  attendance: "#047857",
  survey: "#6d28d9",
  exam: "#b45309",
};

function PendingTaskDistribution({
  overview,
}: {
  overview: StudentTaskOverview;
}) {
  const { counts, total } = overview;
  const assignmentEnd = total ? (counts.assignment / total) * 100 : 0;
  const attendanceEnd = total
    ? ((counts.assignment + counts.attendance) / total) * 100
    : 0;
  const surveyEnd = total
    ? ((counts.assignment + counts.attendance + counts.survey) / total) * 100
    : 0;
  const background = total
    ? `conic-gradient(${taskColors.assignment} 0 ${assignmentEnd}%, ${taskColors.attendance} ${assignmentEnd}% ${attendanceEnd}%, ${taskColors.survey} ${attendanceEnd}% ${surveyEnd}%, ${taskColors.exam} ${surveyEnd}% 100%)`
    : "#e2e8f0";
  return (
    <div
      role="img"
      aria-label={`待办分布：共 ${total} 项，作业 ${counts.assignment}、签到 ${counts.attendance}、问卷 ${counts.survey}、考试 ${counts.exam}`}
      className="grid size-[4.25rem] shrink-0 place-items-center rounded-full"
      style={{ background }}
    >
      <span
        aria-hidden="true"
        className="grid size-13 place-items-center rounded-full bg-white text-lg font-semibold text-slate-950 tabular-nums"
      >
        {total}
      </span>
    </div>
  );
}

export function StudentHomeTasks({
  overview,
  scope,
}: {
  overview: StudentTaskOverview;
  scope?: { courseId: string; classroomId: string };
}) {
  const scopedHref = (path: string) =>
    scope ? `${path}?${new URLSearchParams(scope)}` : path;
  const [kind, setKind] = useState<StudentTaskKind | "all">("all");
  const items = overview.items.filter(
    (item) => kind === "all" || item.kind === kind,
  );
  return (
    <section
      aria-labelledby="pending-tasks-heading"
      className="flex min-w-0 flex-col rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="pending-tasks-heading"
          className="text-base font-semibold text-slate-950"
        >
          我的待办{" "}
          {scope && (
            <span className="text-sm font-normal text-slate-600">
              {overview.total} 项
            </span>
          )}
        </h2>
        {!scope && (
          <StudentPageLink
            href="/student/tasks"
            className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-700"
          >
            查看全部任务
            <ArrowRight aria-hidden="true" className="size-4" />
          </StudentPageLink>
        )}
      </div>
      <div
        className={
          scope
            ? "mt-3"
            : "mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3"
        }
      >
        {!scope && overview.total > 0 && (
          <PendingTaskDistribution overview={overview} />
        )}
        {!scope && !overview.total && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <CheckCircle2
              aria-hidden="true"
              className="size-5 shrink-0 text-emerald-700"
            />
            <p className="text-sm font-medium text-slate-800">
              暂无待办，当前没有需要处理的考试、作业、签到或问卷
            </p>
            <StudentPageLink
              href="/student/courses"
              className="inline-flex min-h-10 items-center gap-1 rounded text-sm font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700"
            >
              进入我的课程
              <ArrowRight aria-hidden="true" className="size-4" />
            </StudentPageLink>
          </div>
        )}
        {overview.total > 0 && (
          <div
            role="group"
            aria-label="待办分类"
            className="flex min-w-0 flex-wrap gap-1.5"
          >
            {(
              [
                { id: "all", label: "全部", count: overview.total },
                {
                  id: "assignment",
                  label: "作业",
                  count: overview.counts.assignment,
                },
                {
                  id: "attendance",
                  label: "签到",
                  count: overview.counts.attendance,
                },
                { id: "survey", label: "问卷", count: overview.counts.survey },
                { id: "exam", label: "考试", count: overview.counts.exam },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={kind === filter.id}
                onClick={() => setKind(filter.id)}
                className={`min-h-10 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${kind === filter.id ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-sky-50"}`}
              >
                {!scope && filter.id !== "all" && (
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block size-2 rounded-full border border-white"
                    style={{ background: taskColors[filter.id] }}
                  />
                )}
                {filter.label}
                {filter.id === "all"
                  ? scope
                    ? ` ${filter.count}`
                    : ""
                  : ` ${filter.count}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {kind === "all"
          ? "全部待办"
          : {
              assignment: "作业",
              attendance: "签到",
              survey: "问卷",
              exam: "考试",
            }[kind]}
        ，共 {items.length} 项，显示 {Math.min(items.length, 5)} 项。
      </div>
      {(scope || overview.total > 0) && (
        <div className="mt-3">
          {items.length ? (
            <StudentTaskList
              items={items.slice(0, 5)}
              priorityId={overview.items[0]?.id}
              showContext={!scope}
            />
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 shrink-0 text-emerald-700"
              />
              <p className="text-sm font-medium text-slate-800">
                {overview.total === 0 ? "暂无待办" : "此类暂无待办"}
              </p>
            </div>
          )}
          {items.length > 5 && (
            <p className="mt-3 text-xs text-slate-600">
              其余 {items.length - 5} 项可在
              {scope ? "课程记录" : "全部任务"}中查看。
            </p>
          )}
        </div>
      )}
      {overview.scheduledExams.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-sm font-medium">
            近期考试 · {overview.scheduledExams.length} 场
          </h3>
          {overview.scheduledExams.slice(0, 2).map((exam) => (
            <a
              key={exam.id}
              href={exam.href}
              className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 focus-visible:outline-2"
            >
              <span>
                {exam.title} · {exam.classroomName}
              </span>
              <span>{studentTaskDate(exam.opensAt)} 开考</span>
            </a>
          ))}
        </div>
      )}
      {overview.scheduledSurveys.length > 0 && (
        <details className="mt-4 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer rounded text-sm font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-700">
            问卷开放预告 · {overview.scheduledSurveys.length} 份
          </summary>
          <p className="mt-2 text-xs text-slate-600">
            暂不计入待办，问卷不计入成绩。
          </p>
          <ul className="mt-2 space-y-2">
            {overview.scheduledSurveys.slice(0, 2).map((survey) => (
              <li
                key={survey.id}
                className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"
              >
                <StudentPageLink
                  href={survey.href}
                  className="inline-flex min-h-9 items-center font-medium text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700"
                >
                  {survey.title}
                </StudentPageLink>
                <p>
                  {!scope && `${studentTaskContext(survey)} · `}
                  {studentTaskDate(survey.opensAt)} 开放
                </p>
              </li>
            ))}
          </ul>
          {overview.scheduledSurveys.length > 2 && (
            <StudentPageLink
              href={scopedHref("/student/surveys")}
              className="inline-flex min-h-10 items-center text-sm text-sky-800 underline"
            >
              查看全部开放安排
            </StudentPageLink>
          )}
        </details>
      )}
    </section>
  );
}
