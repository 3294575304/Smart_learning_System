import React from "react";
import {
  BookOpen,
  ChartNoAxesCombined,
  ClipboardCheck,
  CalendarCheck,
  Lightbulb,
} from "lucide-react";
import { ScoreChart } from "@/components/dashboard/student-analysis-workspace";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";
import type { StudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";

export const KNOWLEDGE_STATES = [
  { id: "MASTERED", label: "已掌握", color: "#10b981" },
  { id: "DEVELOPING", label: "巩固中", color: "#38bdf8" },
  { id: "NEEDS_SUPPORT", label: "需加强", color: "#fb7185" },
  { id: "INSUFFICIENT", label: "证据待积累", color: "#fbbf24" },
  { id: "NO_EVIDENCE", label: "尚未评估", color: "#cbd5e1" },
] as const;
const panel =
  "min-w-0 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/30 sm:p-5";
export function StackedKnowledge({
  concepts,
}: {
  concepts: ReadonlyArray<{ status: (typeof KNOWLEDGE_STATES)[number]["id"] }>;
}) {
  return (
    <div
      className="flex h-2.5 overflow-hidden rounded-full bg-slate-100"
      role="img"
      aria-label={KNOWLEDGE_STATES.map(
        (s) =>
          `${s.label}${concepts.filter((c) => c.status === s.id).length}个`,
      ).join("，")}
    >
      {KNOWLEDGE_STATES.map((s) => (
        <span
          key={s.id}
          style={{
            background: s.color,
            width: `${concepts.length ? (concepts.filter((c) => c.status === s.id).length / concepts.length) * 100 : 0}%`,
          }}
        />
      ))}
    </div>
  );
}
export function StudentCourseDashboard({
  data,
  analysis,
}: {
  data: Pick<
    StudentCourseLearningCenter,
    "heatmap" | "progressSteps" | "nextAction"
  >;
  analysis: StudentClassAnalysis;
}) {
  const concepts = [
    ...new Map(
      data.heatmap.flatMap((c) => c.concepts).map((c) => [c.conceptId, c]),
    ).values(),
  ];
  const segments = [
    { label: "已公布", count: analysis.publishedCount, color: "#0284c7" },
    { label: "已交待公布", count: analysis.awaitingRelease, color: "#fbbf24" },
    { label: "未提交", count: analysis.unsubmitted, color: "#e2e8f0" },
  ];
  const attendance = [
    { label: "正常", count: analysis.attendance.present, color: "#0ea5e9" },
    { label: "迟到", count: analysis.attendance.late, color: "#fbbf24" },
    { label: "早退", count: analysis.attendance.earlyLeave, color: "#fb923c" },
    { label: "请假", count: analysis.attendance.leave, color: "#a78bfa" },
    { label: "缺勤", count: analysis.attendance.absent, color: "#fb7185" },
    { label: "待确认", count: analysis.attendance.pending, color: "#cbd5e1" },
  ];
  let offset = 0;
  return (
    <div className="space-y-4" aria-label="课程学习数据面板">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {data.progressSteps.map((step, index) => (
          <article key={step.key} className={panel}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-500">
                {step.label}
              </h2>
              <span className="text-xs text-sky-500">0{index + 1}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-950 tabular-nums">
              {step.value === null ? "—" : `${step.value}%`}
            </p>
            <div
              className="my-3 h-1.5 overflow-hidden rounded-full bg-sky-50"
              role="img"
              aria-label={`${step.label}：${step.detail}`}
            >
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${step.value ?? 0}%` }}
              />
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {step.numerator}/{step.denominator} ·{" "}
              {step.key === "teaching-progress"
                ? "本班已授知识点"
                : "课程证据 · 已授范围"}
            </p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ClipboardCheck
              aria-hidden="true"
              className="size-4 text-sky-600"
            />
            本班作业完成情况
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            仅统计本班已开放的正式作业
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <div className="relative size-40 shrink-0">
              <svg
                viewBox="0 0 120 120"
                className="size-full -rotate-90"
                role="img"
                aria-label={
                  analysis.total
                    ? segments.map((s) => `${s.label}${s.count}项`).join("，")
                    : "本班暂无已开放作业"
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
                {segments.map((s) => {
                  const length = analysis.total
                    ? (s.count / analysis.total) * 100
                    : 0;
                  const start = offset;
                  offset += length;
                  return (
                    <circle
                      key={s.label}
                      cx="60"
                      cy="60"
                      r="48"
                      pathLength="100"
                      fill="none"
                      stroke={s.color}
                      strokeWidth="12"
                      strokeDasharray={`${length} ${100 - length}`}
                      strokeDashoffset={-start}
                    />
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-2xl text-slate-950">
                  {analysis.completion === null
                    ? "—"
                    : `${analysis.completion}%`}
                </strong>
                <span className="mt-1 text-xs text-slate-500">提交完成率</span>
              </div>
            </div>
            <dl className="min-w-32 space-y-3">
              {segments.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-5 text-sm"
                >
                  <dt className="flex items-center gap-2 text-slate-500">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </dt>
                  <dd className="font-semibold text-slate-800">{s.count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {analysis.total
              ? `共 ${analysis.total} 项 · 已提交 ${analysis.submitted} 项 · 逾期未交 ${analysis.overdue} 项`
              : "本班暂无已开放作业，不计算完成率。"}
          </p>
        </section>
        <section className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ChartNoAxesCombined
                  aria-hidden="true"
                  className="size-4 text-sky-600"
                />
                本班成绩变化
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                最近 8 项已公布作业，统一按百分制展示
              </p>
            </div>
            <span className="text-xs text-slate-500">
              已公布均分{" "}
              <strong className="text-sky-700">
                {analysis.average === null ? "—" : `${analysis.average} 分`}
              </strong>
            </span>
          </div>
          <ScoreChart points={analysis.scoreHistory} />
          <p className="mt-2 text-xs text-slate-400">
            待公布、待批改和缺失满分的记录不计入均分和趋势。
          </p>
        </section>
        <section className={panel}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BookOpen aria-hidden="true" className="size-4 text-sky-600" />
            课程知识状态
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            课程画像汇总 · 已归入章节的知识点；尚未评估不代表零分
          </p>
          {concepts.length ? (
            <>
              <div className="mt-4">
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
              <div className="mt-5 space-y-3">
                {data.heatmap.slice(0, 5).map((chapter) => (
                  <div key={chapter.key}>
                    <div className="mb-1.5 flex justify-between gap-3 text-xs">
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
              {data.heatmap.length > 5 && (
                <p className="mt-3 text-xs text-slate-400">
                  展示前 5 章，其余在“知识与路径”查看。
                </p>
              )}
            </>
          ) : (
            <p className="flex min-h-44 items-center justify-center text-sm text-slate-500">
              暂无章节知识数据，等待正式图谱与学习证据。
            </p>
          )}
        </section>
        <section className={panel}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarCheck aria-hidden="true" className="size-4 text-sky-600" />
            本班出勤分布
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            截至当前已开始的签到，共 {analysis.attendance.total} 条本人记录
          </p>
          {analysis.attendance.total ? (
            <div className="mt-5 space-y-3">
              {attendance.map((s) => (
                <div
                  key={s.label}
                  className="grid grid-cols-[3rem_1fr_2rem] items-center gap-3 text-xs"
                >
                  <span className="text-slate-500">{s.label}</span>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${s.label}${s.count}次，共${analysis.attendance.total}次`}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.count / analysis.attendance.total) * 100}%`,
                        background: s.color,
                      }}
                    />
                  </div>
                  <strong className="text-right text-slate-700">
                    {s.count}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex min-h-44 items-center justify-center text-sm text-slate-500">
              暂无本班出勤记录
            </p>
          )}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">
            出勤反映学习投入，不直接等同于知识掌握；待确认记录单独列出。
          </p>
        </section>
      </div>
      <aside className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-sm leading-6 text-slate-600">
        <Lightbulb
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-sky-600"
        />
        <p>
          <strong className="mr-2 font-medium text-sky-800">
            当前学习建议
          </strong>
          {data.nextAction}
        </p>
      </aside>
    </div>
  );
}
