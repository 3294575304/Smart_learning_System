import { StudentCourseReturnLink } from "./student-course-return-link";
import { StudentPageHeader } from "./student-page-header";
import { StudentEnrollmentPicker } from "./student-enrollment-picker";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  CheckCheck,
  ClipboardList,
  Clock3,
  Info,
  Layers3,
  Lightbulb,
  Network,
  CalendarCheck2,
} from "lucide-react";
import type { ReactNode } from "react";
import { StudentAnalyticsLink as Link } from "./student-analytics-link";
import type {
  StudentClassAnalysis,
  getStudentClassAnalytics,
} from "@/services/dashboard/student-class-analytics";

type Contexts = Awaited<
  ReturnType<typeof getStudentClassAnalytics>
>["contexts"];
const panel =
  "min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30";
function PanelTitle({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-sky-600">{icon}</span>
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-xs leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
export function ScoreChart({
  points,
}: {
  points: StudentClassAnalysis["scoreHistory"];
}) {
  if (!points.length)
    return (
      <div className="my-4 flex min-h-44 flex-col items-center justify-center rounded-xl bg-slate-50/80 px-5 text-center">
        <ChartNoAxesCombined
          aria-hidden="true"
          className="size-7 text-slate-300"
        />
        <p className="mt-3 text-sm font-medium text-slate-600">
          等待第一份已公布成绩
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          成绩公布后，这里会呈现本班作业的得分变化。
        </p>
      </div>
    );
  const xs = points.map((_, i) =>
    points.length === 1 ? 300 : 44 + (i * 512) / (points.length - 1),
  );
  const y = (value: number) => 160 - value * 1.28;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xs[i]},${y(p.percentage)}`)
    .join(" ");
  return (
    <figure className="mt-4 min-w-0">
      <svg
        viewBox="0 0 600 198"
        className="block w-full"
        role="img"
        aria-label={`最近${points.length}项已公布作业的百分制成绩变化`}
      >
        <title>本班已公布作业成绩趋势</title>
        <desc>
          {points.map((p) => `${p.title}：${p.percentage}分`).join("；")}
        </desc>
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line
              x1="44"
              y1={y(value)}
              x2="556"
              y2={y(value)}
              stroke="#e2e8f0"
              strokeDasharray="4 5"
            />
            <text
              x="40"
              y={y(value) + 4}
              textAnchor="end"
              fill="#64748b"
              className="text-[20px] sm:text-[11px]"
            >
              {value}
            </text>
          </g>
        ))}
        {points.length > 1 ? (
          <>
            <path
              d={`${path} L${xs[xs.length - 1]},160 L${xs[0]},160 Z`}
              fill="#e0f2fe"
              fillOpacity="0.65"
            />
            <path
              d={path}
              fill="none"
              stroke="#0284c7"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}
        {points.map((point, i) => (
          <g key={point.id}>
            <circle
              cx={xs[i]}
              cy={y(point.percentage)}
              r="4"
              fill="white"
              stroke="#0284c7"
              strokeWidth="2.5"
            >
              <title>{`${point.title}：${point.percentage}分`}</title>
            </circle>
            <text
              x={xs[i]}
              y={y(point.percentage) - 12}
              textAnchor="middle"
              fill="#0369a1"
              className="text-[20px] sm:text-[11px]"
              fontWeight="600"
            >
              {point.percentage}
            </text>
            <text
              x={xs[i]}
              y="185"
              textAnchor="middle"
              fill="#64748b"
              className="text-[20px] sm:text-[10px]"
            >
              {point.submittedAt?.toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
              }) ?? `第${i + 1}项`}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-600" />
          百分制得分
        </span>
        <span>
          {points.length === 1
            ? "仅有1项成绩，暂不判断趋势"
            : "按提交时间排列，每项作业取最新有效提交"}
        </span>
      </figcaption>
    </figure>
  );
}
export function StudentAnalysisWorkspace({
  selected: s,
  contexts,
  updatedAt,
}: {
  selected: StudentClassAnalysis;
  contexts: Contexts;
  updatedAt: Date;
}) {
  const scope = new URLSearchParams({
    courseId: s.course.id,
    classroomId: s.classroom.id,
  });
  const assignments = `/student/assignments?${scope}`;
  const center = `/student/courses/${s.course.id}/learning-center?classroomId=${s.classroom.id}`;
  const publishedPercent = s.total ? (s.publishedCount / s.total) * 100 : 0;
  const submittedPercent = s.total ? (s.submitted / s.total) * 100 : 0;
  const attendance = [
    { label: "正常", value: s.attendance.present, color: "bg-sky-500" },
    { label: "迟到", value: s.attendance.late, color: "bg-amber-400" },
    { label: "早退", value: s.attendance.earlyLeave, color: "bg-orange-400" },
    { label: "请假", value: s.attendance.leave, color: "bg-indigo-400" },
    { label: "缺勤", value: s.attendance.absent, color: "bg-rose-400" },
    { label: "待确认", value: s.attendance.pending, color: "bg-slate-300" },
  ];
  const tips = s.unsubmitted
    ? [
        {
          title: `还有 ${s.unsubmitted} 项作业未提交`,
          text: s.overdue
            ? `其中 ${s.overdue} 项已截止，请到作业页查看任务状态和可提交范围。`
            : "先安排近期作业，再留出时间复习。",
          href: assignments,
          label: "查看作业",
        },
      ]
    : s.total
      ? [
          {
            title: "本班作业均已提交",
            text: "可以回顾已有反馈，整理容易遗漏的解题步骤。",
            href: assignments,
            label: "回顾作业",
          },
        ]
      : [
          {
            title: "从课程学习开始",
            text: "本班还没有已开放作业，可以先浏览课程内容与知识图谱。",
            href: center,
            label: "进入课程",
          },
        ];
  const scoreTip =
    s.average === null
      ? "已公布成绩不足时，不对学习水平作判断。"
      : s.average < 60
        ? "已公布作业可优先复习，结合具体题目查找遗漏。"
        : s.average >= 80
          ? "已公布作业表现较好，建议通过间隔练习巩固。"
          : "结合已公布作业反馈，先复习反复出错的内容。";
  const metrics = [
    {
      label: "作业提交率",
      value: s.completion === null ? "—" : `${s.completion}%`,
      detail: `已提交 ${s.submitted} / ${s.total} 项`,
      icon: CheckCheck,
      tint: "bg-sky-50 text-sky-600",
    },
    {
      label: "已公布作业均分",
      value: s.average ?? "—",
      detail: s.gradedCount
        ? `来自 ${s.gradedCount} 项百分制成绩`
        : "暂无完整的已公布成绩",
      icon: ChartNoAxesCombined,
      tint: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "未提交作业",
      value: s.unsubmitted,
      detail: s.overdue
        ? `${s.overdue} 项已截止`
        : s.total
          ? "按本班正式作业统计"
          : "本班暂无已开放作业",
      icon: ClipboardList,
      tint: "bg-amber-50 text-amber-600",
    },
    {
      label: "出勤记录",
      value: s.attendance.total,
      detail: s.attendance.total
        ? `正常 ${s.attendance.present} 次 · 待确认 ${s.attendance.pending} 次`
        : "本班暂无出勤记录",
      icon: CalendarCheck2,
      tint: "bg-teal-50 text-teal-600",
    },
  ];
  return (
    <section className="space-y-5 pb-2" aria-label="个人学情分析看板">
      <StudentPageHeader
        title="学习分析"
        description="查看当前课程的作业、成绩与学习表现。"
        actions={
          <StudentCourseReturnLink
            courseId={s.course.id}
            classroomId={s.classroom.id}
          />
        }
      />
      <header className={`${panel} relative overflow-hidden px-5 py-5 sm:px-6`}>
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-sky-500"
        />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere] text-slate-950 sm:text-2xl">
              {s.course.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="max-w-full rounded-md bg-sky-50 px-2 py-1 font-medium [overflow-wrap:anywhere] text-sky-700">
                {s.classroom.name}
              </span>
              <span>{s.course.term}</span>
              <span>·</span>
              <span>仅统计当前课程的学习记录</span>
            </div>
          </div>
          <div className="w-full min-w-0 sm:max-w-sm">
            <p className="mb-1.5 text-xs text-slate-500">当前课程</p>
            <StudentEnrollmentPicker
              contexts={contexts.map((item) => ({
                course: {
                  id: item.course.id,
                  name: item.course.name,
                  term: item.course.term,
                  status: item.course.status,
                },
                classroom: item.classroom,
              }))}
              selectedId={s.classroom.id}
              action="/student/analytics"
            />
          </div>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <article key={m.label} className={`${panel} p-4 sm:p-5`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium text-slate-500">{m.label}</h2>
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${m.tint}`}
              >
                <m.icon aria-hidden="true" className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {m.value}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{m.detail}</p>
          </article>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <section className={`${panel} p-5 sm:p-6 lg:col-span-8`}>
          <PanelTitle
            icon={<ChartNoAxesCombined className="size-4" />}
            title="成绩变化"
            description="最近 8 项已公布作业，按百分制展示"
            action={
              <Link
                href={assignments}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-sky-700"
              >
                作业记录
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <ScoreChart points={s.scoreHistory} />
        </section>
        <section className={`${panel} p-5 sm:p-6 lg:col-span-4`}>
          <PanelTitle
            icon={<Layers3 className="size-4" />}
            title="学习任务"
            description="本班已开放的正式作业"
          />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5">
            <div
              className="flex size-32 shrink-0 items-center justify-center rounded-full"
              role="img"
              aria-label={
                s.total
                  ? `${s.total}项作业，已公布${s.publishedCount}项，待公布${s.awaitingRelease}项，未提交${s.unsubmitted}项`
                  : "本班暂无作业"
              }
              style={{
                background: s.total
                  ? `conic-gradient(#0284c7 0% ${publishedPercent}%, #a5b4fc ${publishedPercent}% ${submittedPercent}%, #e2e8f0 ${submittedPercent}% 100%)`
                  : "#f1f5f9",
              }}
            >
              <div className="flex size-[104px] flex-col items-center justify-center rounded-full bg-white">
                <strong className="text-2xl font-semibold text-slate-900">
                  {s.total ? s.completion : "—"}
                  {s.total ? <span className="text-sm">%</span> : null}
                </strong>
                <span className="mt-1 text-xs text-slate-500">
                  {s.total ? "已提交" : "暂无任务"}
                </span>
              </div>
            </div>
            <dl className="min-w-28 space-y-3 text-xs">
              {[
                {
                  label: "已公布",
                  value: s.publishedCount,
                  color: "bg-sky-600",
                },
                {
                  label: "待公布",
                  value: s.awaitingRelease,
                  color: "bg-indigo-300",
                },
                {
                  label: "未提交",
                  value: s.unsubmitted,
                  color: "bg-slate-200",
                },
              ].map((x) => (
                <div
                  key={x.label}
                  className="flex items-center justify-between gap-5"
                >
                  <dt className="flex items-center gap-2 text-slate-500">
                    <span className={`size-2 rounded-full ${x.color}`} />
                    {x.label}
                  </dt>
                  <dd className="font-semibold text-slate-800">{x.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
            提交情况与评分状态分别统计，待公布成绩不计为零分。
          </p>
        </section>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <section className={`${panel} overflow-hidden lg:col-span-8`}>
          <div className="p-5 sm:px-6">
            <PanelTitle
              icon={<ClipboardList className="size-4" />}
              title="最近学习记录"
              description="本班最近 8 项有效作业提交"
              action={
                <Link
                  href={assignments}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-sky-700"
                >
                  全部作业
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
          </div>
          {s.recent.length ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 border-y border-slate-100 bg-slate-50/70 px-5 py-2 text-xs text-slate-500 sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:px-6">
                <span>作业名称</span>
                <span className="hidden sm:block">提交时间</span>
                <span className="text-right">成绩 / 状态</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {s.recent.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/student/submissions/${row.id}/result`}
                      className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 px-5 py-4 transition hover:bg-sky-50/50 sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:px-6"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-700">
                          {row.title}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500 sm:hidden">
                          {row.submittedAt?.toLocaleDateString("zh-CN") ??
                            "时间未记录"}
                        </span>
                      </span>
                      <span className="hidden text-xs text-slate-500 sm:block">
                        {row.submittedAt?.toLocaleDateString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                        }) ?? "—"}
                      </span>
                      <span className="text-right">
                        {row.status !== "PUBLISHED" ? (
                          <span className="inline-block rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            待公布
                          </span>
                        ) : row.percentage === null ? (
                          <span className="text-xs text-slate-500">
                            成绩不完整
                          </span>
                        ) : (
                          <span className="text-base font-semibold text-slate-800">
                            {row.percentage}
                            <span className="ml-0.5 text-xs font-normal text-slate-500">
                              分
                            </span>
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="px-6 pt-3 pb-8 text-center text-sm text-slate-500">
              暂无提交记录，完成作业后会在这里留下学习足迹。
            </div>
          )}
        </section>
        <aside className="space-y-5 lg:col-span-4">
          <section className={`${panel} p-5 sm:p-6`}>
            <PanelTitle
              icon={<CalendarCheck2 className="size-4" />}
              title="课堂出勤"
              action={
                <Link
                  href={`/student/attendance?${scope}`}
                  className="inline-flex items-center gap-1 text-xs text-sky-700"
                >
                  明细
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
            {s.attendance.total ? (
              <>
                <div
                  className="mt-5 flex h-2 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={attendance
                    .map((a) => `${a.label}${a.value}次`)
                    .join("，")}
                >
                  {attendance
                    .filter((a) => a.value)
                    .map((a) => (
                      <div
                        key={a.label}
                        className={a.color}
                        style={{
                          width: `${(a.value / s.attendance.total) * 100}%`,
                        }}
                      />
                    ))}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4">
                  {attendance.map((a) => (
                    <div key={a.label}>
                      <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className={`size-1.5 rounded-full ${a.color}`} />
                        {a.label}
                      </dt>
                      <dd className="mt-1 text-base font-semibold text-slate-700">
                        {a.value}
                        <span className="ml-1 text-xs font-normal text-slate-500">
                          次
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                暂无本班出勤记录
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/70 p-5 sm:p-6">
            <PanelTitle
              icon={<Lightbulb className="size-4" />}
              title="接下来可以做"
            />
            <div className="mt-4 space-y-4">
              {tips.map((tip) => (
                <div key={tip.title}>
                  <h3 className="text-sm font-semibold text-slate-700">
                    {tip.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-6 text-slate-500">
                    {tip.text}
                  </p>
                  <Link
                    href={tip.href}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700"
                  >
                    {tip.label}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                </div>
              ))}
              <p className="border-t border-sky-100 pt-3 text-xs leading-6 text-slate-500">
                {scoreTip}
              </p>
            </div>
          </section>
        </aside>
      </div>
      <section
        className={`${panel} flex flex-wrap items-center justify-between gap-4 p-5`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Network aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">
              进一步了解课程知识状态
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              进入课程学习中心查看画像、知识图谱与学习路径。课程画像汇总本课程证据，本页作业和出勤仅统计当前课程。
            </p>
          </div>
        </div>
        <Link
          href={center}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
        >
          <BookOpen className="size-4" aria-hidden="true" />
          课程学习中心
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
      <footer className="flex flex-wrap items-start justify-between gap-2 px-1 text-[11px] leading-5 text-slate-500">
        <p className="inline-flex max-w-3xl items-start gap-1.5">
          <Info className="mt-1 size-3 shrink-0" aria-hidden="true" />
          均分按本班各项作业最新有效且已公布的百分制成绩计算；不包含自主练习，未评分不按零分计算。
        </p>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3" aria-hidden="true" />
          更新于{" "}
          {updatedAt.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </footer>
    </section>
  );
}
