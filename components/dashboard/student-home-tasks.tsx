"use client";
import { StudentPageLink } from "./student-page-link";
import React, { useState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import {
  StudentTaskList,
  STUDENT_TASK_PRESENTATION,
} from "./student-task-list";
import { FOCUS_RING, FOCUS_RING_TIGHT } from "./ui-focus";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskOverview,
  type StudentTaskKind,
} from "@/services/dashboard/student-task-overview";

/**
 * 任务类别的取色不再在本文件另存一份。
 * 改造前这里有一份 hex（用于环图与筛选色点），student-task-list 里另有一份
 * Tailwind 类名（用于图标底），同一个语义两处维护、改一处必忘另一处。
 * 现在统一由 STUDENT_TASK_PRESENTATION.mark 提供，且已改为同一品牌色的
 * 4 级明度（类别靠图例文字区分），不再各占一个色相。
 */
const taskMarks = {
  assignment: STUDENT_TASK_PRESENTATION.assignment.mark,
  attendance: STUDENT_TASK_PRESENTATION.attendance.mark,
  survey: STUDENT_TASK_PRESENTATION.survey.mark,
  exam: STUDENT_TASK_PRESENTATION.exam.mark,
} as const;

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
    ? `conic-gradient(${taskMarks.assignment} 0 ${assignmentEnd}%, ${taskMarks.attendance} ${assignmentEnd}% ${attendanceEnd}%, ${taskMarks.survey} ${attendanceEnd}% ${surveyEnd}%, ${taskMarks.exam} ${surveyEnd}% 100%)`
    : "var(--progress-track)";
  return (
    <div
      role="img"
      aria-label={`待办分布：共 ${total} 项，作业 ${counts.assignment}、签到 ${counts.attendance}、问卷 ${counts.survey}、考试 ${counts.exam}`}
      className="grid size-[4.25rem] shrink-0 place-items-center rounded-full"
      style={{ background }}
    >
      <span
        aria-hidden="true"
        className="bg-card grid size-11 place-items-center rounded-full text-lg font-semibold text-neutral-950 tabular-nums"
      >
        {total}
      </span>
    </div>
  );
}

export function StudentHomeTasks({
  overview,
  scope,
  dashboard = false,
}: {
  overview: StudentTaskOverview;
  scope?: { courseId: string; classroomId: string };
  dashboard?: boolean;
}) {
  const scopedHref = (path: string) =>
    scope ? `${path}?${new URLSearchParams(scope)}` : path;
  const [kind, setKind] = useState<StudentTaskKind | "all">("all");
  const items = overview.pendingItems.filter(
    (item) => kind === "all" || item.kind === kind,
  );
  const FilterPanel = dashboard && overview.total > 0 ? "details" : "div";
  return (
    <section
      aria-labelledby="pending-tasks-heading"
      className="border-border bg-card flex min-w-0 flex-col rounded-[1.25rem] border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="pending-tasks-heading"
          className={`font-semibold text-neutral-950 ${dashboard ? "text-xl" : "text-base"}`}
        >
          我的待办{" "}
          {((scope && !dashboard) || overview.total > 0) && (
            <span className="text-sm font-normal text-neutral-600">
              {dashboard ? "· " : ""}
              {overview.total} 项
            </span>
          )}
        </h2>
        {!scope && (
          <StudentPageLink
            href="/student/tasks"
            className={`inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium ${FOCUS_RING} ${dashboard ? "underline-offset-4 hover:underline" : "bg-brand/10 text-brand-strong hover:bg-muted px-3"}`}
          >
            查看全部任务
            {!dashboard && <ArrowRight aria-hidden="true" className="size-4" />}
          </StudentPageLink>
        )}
      </div>
      {/*
        待办从「首屏 3 条 + 折叠 2 条」改为 5 条直出。
        产品约定本就是最多展示 5 项（见上方 sr-only 文案），
        把第 4、5 条藏在折叠里等于让学生多点一次才能看全自己有什么事。
      */}
      {dashboard && overview.total > 0 && (
        <div className="mt-2">
          {items.length ? (
            <StudentTaskList
              items={items.slice(0, 5)}
              priorityId={overview.pendingItems[0]?.id}
              layout="home"
            />
          ) : (
            <p className="border-border border-t py-3 text-sm text-neutral-600">
              此类暂无待办
            </p>
          )}
        </div>
      )}
      {dashboard && items.length > 5 && (
        <p className="mt-2 text-xs text-neutral-600">
          其余 {items.length - 5} 项可在全部任务中查看。
        </p>
      )}
      <FilterPanel
        className={
          dashboard
            ? "mt-1"
            : scope
              ? "mt-3"
              : "bg-muted/65 mt-3 flex flex-wrap items-center gap-4 rounded-xl p-3"
        }
      >
        {dashboard && overview.total > 0 && (
          <summary
            className={`min-h-10 cursor-pointer content-center rounded-md text-sm font-medium ${FOCUS_RING_TIGHT}`}
          >
            按类别筛选
          </summary>
        )}
        <div
          className={
            dashboard ? "flex flex-wrap items-center gap-3" : "contents"
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
              <p className="text-sm font-medium text-neutral-800">
                暂无待办，当前没有需要处理的考试、作业、签到或问卷
              </p>
              <StudentPageLink
                href="/student/courses"
                className={`text-brand-strong inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium ${FOCUS_RING}`}
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
                  {
                    id: "survey",
                    label: "问卷",
                    count: overview.counts.survey,
                  },
                  { id: "exam", label: "考试", count: overview.counts.exam },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={kind === filter.id}
                  onClick={() => setKind(filter.id)}
                  className={`min-h-10 rounded-md border px-3 text-sm font-medium ${FOCUS_RING} ${kind === filter.id ? "border-brand bg-brand text-white" : "border-border bg-card hover:bg-muted text-neutral-700"}`}
                >
                  {!scope && filter.id !== "all" && (
                    <span
                      aria-hidden="true"
                      className="mr-1.5 inline-block size-2 rounded-full border border-white"
                      style={{ background: taskMarks[filter.id] }}
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
      </FilterPanel>
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
      {!dashboard && (scope || overview.total > 0) && (
        <div className="mt-3">
          {items.length ? (
            <StudentTaskList
              items={items.slice(0, 5)}
              priorityId={overview.pendingItems[0]?.id}
              showContext={!scope}
            />
          ) : (
            <div className="bg-muted/65 flex items-center gap-2 rounded-xl p-3">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 shrink-0 text-emerald-700"
              />
              <p className="text-sm font-medium text-neutral-800">
                {overview.total === 0 ? "暂无待办" : "此类暂无待办"}
              </p>
            </div>
          )}
          {items.length > 5 && (
            <p className="mt-3 text-xs text-neutral-600">
              其余 {items.length - 5} 项可在
              {scope ? "课程记录" : "全部任务"}中查看。
            </p>
          )}
        </div>
      )}
      {overview.scheduledSurveys.length > 0 && (
        <details className="border-border mt-4 border-t pt-3">
          <summary
            className={`cursor-pointer rounded-md text-sm font-medium text-neutral-700 ${FOCUS_RING_TIGHT}`}
          >
            问卷开放预告 · {overview.scheduledSurveys.length} 份
          </summary>
          <p className="mt-2 text-xs text-neutral-600">
            暂不计入待办，问卷不计入成绩。
          </p>
          <ul className="mt-2 space-y-2">
            {overview.scheduledSurveys.slice(0, 2).map((survey) => (
              <li
                key={survey.id}
                className="bg-muted/65 rounded-md p-3 text-xs text-neutral-600"
              >
                <StudentPageLink
                  href={survey.href}
                  className={`text-brand-strong inline-flex min-h-10 items-center font-medium underline underline-offset-4 ${FOCUS_RING}`}
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
              className={`text-brand-strong inline-flex min-h-10 items-center text-sm underline ${FOCUS_RING}`}
            >
              查看全部开放安排
            </StudentPageLink>
          )}
        </details>
      )}
    </section>
  );
}
