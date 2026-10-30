import React from "react";
import { StudentEnrollmentPicker } from "./student-enrollment-picker";
import { BookOpen, ChartNoAxesCombined, ListTodo } from "lucide-react";
import { studentEnrollmentLabel } from "@/services/courses/student-enrollment";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";
import type { StudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";
import {
  KNOWLEDGE_STATES,
  StackedKnowledge,
} from "@/components/learner-profiles/student-course-dashboard";

const panel =
  "min-w-0 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/30";
export function StudentHomeInsights({
  classes,
  selected,
  knowledge,
  overview,
}: {
  classes: StudentClassAnalysis[];
  selected?: StudentClassAnalysis;
  knowledge?: Pick<StudentCourseLearningCenter, "heatmap" | "progressSteps">;
  overview: StudentTaskOverview;
}) {
  const current = classes.filter(
    (x) => x.classroom.status === "ACTIVE" && x.course.status !== "ARCHIVED",
  );
  const total = current.reduce((n, c) => n + c.total, 0);
  const submitted = current.reduce((n, c) => n + c.submitted, 0);
  const released = current.reduce((n, c) => n + c.publishedCount, 0);
  const rate = total ? Math.round((submitted / total) * 100) : null;
  const concepts = [
    ...new Map(
      (knowledge?.heatmap ?? [])
        .flatMap((c) => c.concepts)
        .map((c) => [c.conceptId, c]),
    ).values(),
  ];
  const kinds = [
    { id: "assignment", label: "作业", color: "#0284c7" },
    { id: "attendance", label: "签到", color: "#10b981" },
    { id: "survey", label: "问卷", color: "#a78bfa" },
  ] as const;
  let offset = 0;
  const metrics = [
    {
      label: "在学课程",
      value: current.length,
      unit: "门",
      detail: "每个已加入班级独立计算",
    },
    {
      label: "当前待办",
      value: overview.total,
      unit: "项",
      detail: "作业、签到与问卷",
    },
    {
      label: "作业提交率",
      value: rate === null ? "—" : `${rate}%`,
      unit: "",
      detail: total
        ? `已交 ${submitted}/${total} 项正式作业`
        : "暂无已开放正式作业",
    },
    {
      label: "已公布作业",
      value: released,
      unit: "份",
      detail: "当前课程已公开的作答结果",
    },
  ];
  return (
    <section aria-label="学习主页数据看板" className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <article
            key={m.label}
            className="min-w-0 rounded-xl border border-sky-100 bg-white px-3 py-3"
          >
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950 tabular-nums">
              {m.value}
              <span className="ml-1 text-xs font-normal text-slate-400">
                {m.unit}
              </span>
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              {m.detail}
            </p>
          </article>
        ))}
      </div>
      <div className="grid gap-4">
        <section className={panel} aria-label="当前课程知识看板">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BookOpen className="size-4 text-sky-600" aria-hidden="true" />
              课程知识掌握
            </h2>
            {selected && (
              <a
                className="inline-flex min-h-9 items-center rounded-lg bg-sky-50 px-3 text-xs font-medium text-sky-700 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-600"
                href={`/student/courses/${selected.course.id}/learning-center?classroomId=${selected.classroom.id}&tab=knowledge`}
              >
                查看课程详情
              </a>
            )}
          </div>
          {classes.length > 0 && selected && (
            <div className="mt-3">
              <StudentEnrollmentPicker
                contexts={classes.map((item) => ({
                  course: {
                    id: item.course.id,
                    name: item.course.name,
                    term: item.course.term,
                    status: item.course.status,
                  },
                  classroom: item.classroom,
                }))}
                selectedId={selected.classroom.id}
                action="/student"
              />
            </div>
          )}

          {concepts.length ? (
            <>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                课程画像汇总 · {concepts.length} 个章节知识点 · 未评估不算零分
              </p>
              <div className="mt-3">
                <StackedKnowledge concepts={concepts} />
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                {KNOWLEDGE_STATES.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label} {concepts.filter((c) => c.status === s.id).length}
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-3">
                {knowledge?.heatmap.slice(0, 3).map((chapter) => (
                  <div key={chapter.key}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span
                        className="min-w-0 truncate text-slate-600"
                        title={chapter.name}
                      >
                        {chapter.name}
                      </span>
                      <span className="shrink-0 text-slate-400">
                        掌握{" "}
                        {
                          chapter.concepts.filter(
                            (c) => c.status === "MASTERED",
                          ).length
                        }
                        /{chapter.concepts.length}
                      </span>
                    </div>
                    <StackedKnowledge concepts={chapter.concepts} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 flex min-h-40 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm leading-6 text-slate-500">
              {selected
                ? "当前课程暂无可展示的知识证据，完成带知识点的作业或练习后再查看。"
                : "加入课程后，在这里查看知识掌握与学习进度。"}
            </div>
          )}
          {knowledge?.progressSteps[0] && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              当前班级教学进度：{knowledge.progressSteps[0].detail}
              。知识画像仍按课程汇总。
            </p>
          )}
        </section>
        <section className={panel} aria-label="待办分布图">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ListTodo aria-hidden="true" className="size-4 text-sky-600" />
            待办事项分布
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            与任务中心同一统计口径，不包含待开放问卷
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <div className="relative size-24 shrink-0">
              <svg
                viewBox="0 0 120 120"
                className="size-full -rotate-90"
                role="img"
                aria-label={
                  overview.total
                    ? kinds
                        .map((k) => `${k.label}${overview.counts[k.id]}项`)
                        .join("，")
                    : "暂无待处理任务"
                }
              >
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="12"
                />
                {kinds.map((k) => {
                  const share = overview.total
                    ? (overview.counts[k.id] / overview.total) * 100
                    : 0;
                  const start = offset;
                  offset += share;
                  return (
                    <circle
                      key={k.id}
                      cx="60"
                      cy="60"
                      r="48"
                      pathLength="100"
                      fill="none"
                      stroke={k.color}
                      strokeWidth="12"
                      strokeDasharray={`${share} ${100 - share}`}
                      strokeDashoffset={-start}
                    />
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-2xl text-slate-950">
                  {overview.total}
                </strong>
                <span className="mt-1 text-xs text-slate-500">待处理</span>
              </div>
            </div>
            <div className="min-w-32 space-y-1">
              {kinds.map((k) => (
                <a
                  key={k.id}
                  href={`/student/tasks#${k.id}`}
                  className="flex min-h-10 items-center justify-between gap-6 rounded-lg px-2 text-sm hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600"
                >
                  <span className="flex items-center gap-2 text-slate-500">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: k.color }}
                    />
                    {k.label}
                  </span>
                  <strong className="text-slate-800">
                    {overview.counts[k.id]}
                  </strong>
                </a>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {overview.total
              ? "待办按优先级展示；开放签到优先，其他任务按截止时间排列。"
              : "当前没有可处理的作业、签到或问卷，可以继续课程学习。"}
          </p>
        </section>
      </div>
      {current.length > 0 && (
        <details className="rounded-xl border border-sky-100 bg-white p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-sky-800">
            <ChartNoAxesCombined aria-hidden="true" className="size-4" />
            查看各课程作业进展
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            仅统计当前课程的已开放正式作业，含已截止记录；待办只统计当前可处理事项。
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {current.map((item) => (
              <div key={item.classroom.id} className="min-w-0">
                <div className="mb-2 flex justify-between gap-3 text-xs">
                  <span
                    className="min-w-0 truncate text-slate-600"
                    title={studentEnrollmentLabel(item)}
                  >
                    {item.course.name} · {item.classroom.name}
                  </span>
                  <strong className="shrink-0 text-sky-700">
                    {item.total
                      ? `${item.submitted}/${item.total}`
                      : "暂无作业"}
                  </strong>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`${studentEnrollmentLabel(item)}：${item.total ? `已提交${item.submitted}项，共${item.total}项` : "暂无已开放作业"}`}
                >
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${item.completion ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
