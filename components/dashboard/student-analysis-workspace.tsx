import { StudentCourseReturnLink } from "./student-course-return-link";
import { StudentPageHeader } from "./student-page-header";
import { StudentEnrollmentPicker } from "./student-enrollment-picker";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCheck,
  ClipboardList,
  Clock3,
  Info,
  Lightbulb,
  ListChecks,
  Network,
  CalendarCheck2,
} from "lucide-react";
import type { ReactNode } from "react";
import { StudentAnalyticsLink as Link } from "./student-analytics-link";
import { ScoreTrendChart } from "./score-trend-chart";
import { recordLabel, shortKindLabel } from "./record-label";
import { StudentRecordLinks } from "./student-record-links";
import type {
  StudentClassAnalysis,
  getStudentClassAnalytics,
} from "@/services/dashboard/student-class-analytics";

type Contexts = Awaited<
  ReturnType<typeof getStudentClassAnalytics>
>["contexts"];
const panel =
  "workspace-panel min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30";
const panelAction =
  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const specialGradeLabels: Record<string, string> = {
  ABSENT: "缺考",
  DEFERRED: "缓考",
  LEAVE: "请假",
  EXEMPT: "免修",
  CHEATING: "作弊",
  OTHER: "特殊状态",
  NOT_ENTERED: "未录入",
};

/**
 * 出勤周历条的状态色与文案。
 *
 * 只用于一格 24px 的小色块，不做大面积铺色；颜色与「我的出勤记录」
 * 的原有语义保持一致（正常蓝、迟到琥珀、请假靛、缺勤玫红）。
 */
const attendanceStatusMeta: Record<string, { label: string; tone: string }> = {
  PRESENT: { label: "正常", tone: "bg-sky-500" },
  LATE: { label: "迟到", tone: "bg-amber-400" },
  EARLY_LEAVE: { label: "早退", tone: "bg-orange-400" },
  LEAVE: { label: "请假", tone: "bg-indigo-400" },
  ABSENT: { label: "缺勤", tone: "bg-rose-400" },
  PENDING: { label: "待确认", tone: "bg-slate-300" },
};
const suggestionTone: Record<string, string> = {
  brand: "bg-sky-600",
  practice: "bg-teal-600",
  exam: "bg-amber-500",
};
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
  compactSmallSample = false,
}: {
  points: StudentClassAnalysis["scoreHistory"];
  compactSmallSample?: boolean;
}) {
  if (compactSmallSample && points.length <= 2) {
    return points.length ? (
      <ul className="divide-line divide-y text-sm">
        {points.map((point, index) => (
          <li
            key={`${point.href}-${index}`}
            className="flex items-baseline justify-between gap-3 py-2"
          >
            <Link
              className="text-brand-strong min-w-0 font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline"
              href={point.href}
            >
              {point.title}
            </Link>
            <span className="text-ink shrink-0 font-semibold tabular-nums">
              {point.percentage} 分
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-ink-soft py-2 text-sm">这段时间暂无已公布成绩。</p>
    );
  }
  if (!points.length)
    return (
      <div className="mt-4 flex min-h-44 flex-1 flex-col items-center justify-center rounded-xl bg-slate-50/80 px-5 text-center">
        <ChartNoAxesCombined
          aria-hidden="true"
          className="size-7 text-slate-300"
        />
        <p className="mt-3 text-sm font-medium text-slate-600">
          等待第一份已公布成绩
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          成绩公布后，我可以在这里查看每次作业与考试的得分。
        </p>
      </div>
    );
  // 只有 1 项成绩时，孤立的一个点画不出趋势，直接给出这次成绩和反馈入口更有用。
  if (points.length === 1) {
    const only = points[0];
    return (
      <div className="mt-4 flex flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <p className="text-xs font-medium text-slate-600">最近一次已公布成绩</p>
        <p className="mt-2 text-sm font-medium [overflow-wrap:anywhere] break-words text-slate-900">
          {recordLabel(only.kind, only.href)} · {only.title}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1.5">
          <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {only.percentage}
            <span className="ml-1 text-sm font-medium text-slate-600">分</span>
          </p>
          {only.submittedAt ? (
            <p className="text-xs text-slate-600 tabular-nums">
              {only.submittedAt.toLocaleDateString("zh-CN")} 提交
            </p>
          ) : null}
        </div>
        <p className="mt-auto pt-3 text-xs leading-5 text-slate-600">
          只有 1 项已公布成绩，暂时不展示趋势；累积到 2 项后会自动显示变化曲线。
        </p>
        <Link
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          href={only.href}
        >
          查看成绩与教师反馈
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    );
  }
  const left = 44;
  const right = 16;
  const width = Math.max(560, left + points.length * 100 + right);
  const plotWidth = width - left - right;
  const xs = points.map(
    (_, i) => left + ((i + 0.5) * plotWidth) / points.length,
  );
  const y = (value: number) => 160 - value * 1.28;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xs[i]},${y(p.percentage)}`)
    .join(" ");
  return (
    <figure className="mt-4 flex min-w-0 flex-1 flex-col">
      <div
        role="region"
        aria-label="作业与考试成绩图，可横向滚动"
        tabIndex={0}
        className="flex flex-1 items-center overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-sky-700"
      >
        <div
          className="w-full"
          style={{ minWidth: Math.max(340, left + points.length * 82 + right) }}
        >
          <svg
            viewBox={`0 0 ${width} 176`}
            className="block w-full"
            role="img"
            aria-label={`我的作业与考试成绩，最近 ${points.length} 项已公布成绩，按百分制展示`}
          >
            <title>我的作业与考试成绩变化</title>
            <desc>
              {points.map((p) => `${p.title}：${p.percentage}分`).join("；")}
            </desc>
            {[0, 50, 100].map((value) => (
              <g key={value}>
                <line
                  x1={left}
                  y1={y(value)}
                  x2={width - right}
                  y2={y(value)}
                  stroke="#e2e8f0"
                  strokeDasharray="4 5"
                />
                <text
                  x={left - 8}
                  y={y(value) + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="11"
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
                  fontSize="12"
                  fontWeight="600"
                >
                  {point.percentage}
                </text>
              </g>
            ))}
          </svg>
          <ol
            aria-label="横轴作业名称"
            className="grid pb-3 text-center text-xs leading-5 text-slate-700"
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
              paddingInline: `${(left / width) * 100}% ${(right / width) * 100}%`,
            }}
          >
            {points.map((point) => (
              <li key={point.id} className="min-w-0 px-1" title={point.title}>
                <span className="line-clamp-2 [overflow-wrap:anywhere]">
                  {recordLabel(point.kind, point.href)} · {point.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <details className="mt-2 text-sm text-slate-700">
        <summary className="w-fit cursor-pointer rounded py-2 font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700">
          查看完整任务名和得分
        </summary>
        <ol className="divide-y divide-slate-100">
          {points.map((point) => (
            <li
              key={point.id}
              className="flex items-baseline justify-between gap-3 py-2.5"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {recordLabel(point.kind, point.href)} · {point.title}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {point.percentage} 分
              </span>
            </li>
          ))}
        </ol>
      </details>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-600" />
          百分制得分
        </span>
        <span>
          {points.length === 1
            ? "仅有 1 项已公布成绩"
            : "按时间排列，在线任务取最新有效提交；台账成绩取已发布快照"}
        </span>
      </figcaption>
    </figure>
  );
}
export function StudentAnalysisWorkspace({
  selected: s,
  contexts,
  updatedAt,
  initialChart = "all",
}: {
  selected: StudentClassAnalysis;
  contexts: Contexts;
  updatedAt: Date;
  initialChart?: "all" | "assignment" | "exam" | "practice";
}) {
  const scope = new URLSearchParams({
    courseId: s.course.id,
    classroomId: s.classroom.id,
  });
  const assignments = `/student/assignments?${scope}`;
  const center = `/student/courses/${s.course.id}/learning-center?classroomId=${s.classroom.id}`;
  const attendance = [
    { label: "正常", value: s.attendance.present, color: "bg-sky-500" },
    { label: "迟到", value: s.attendance.late, color: "bg-amber-400" },
    { label: "早退", value: s.attendance.earlyLeave, color: "bg-orange-400" },
    { label: "请假", value: s.attendance.leave, color: "bg-indigo-400" },
    { label: "缺勤", value: s.attendance.absent, color: "bg-rose-400" },
    { label: "待确认", value: s.attendance.pending, color: "bg-slate-300" },
  ];
  const unsubmittedAssignments =
    s.assignmentProgress.total - s.assignmentProgress.submitted;
  const assignmentCompletion = s.assignmentProgress.total
    ? Math.round(
        (s.assignmentProgress.submitted / s.assignmentProgress.total) * 100,
      )
    : null;
  const tips = unsubmittedAssignments
    ? [
        {
          title: `我还有 ${unsubmittedAssignments} 项作业未提交`,
          text: s.assignmentProgress.overdue
            ? `其中 ${s.assignmentProgress.overdue} 项已截止，请到作业页查看任务状态和可提交范围。`
            : "先安排近期作业，再留出时间复习。",
          href: assignments,
          label: "查看作业",
        },
      ]
    : s.assignmentProgress.total
      ? [
          {
            title: "我已提交全部作业",
            text: "打开作业记录可回看答题和批改反馈。",
            href: assignments,
            label: "回顾作业",
          },
        ]
      : [
          {
            title: "从课程学习开始",
            text: "当前教学班暂无已开放作业，可以先查看课程知识图谱。",
            href: center,
            label: "进入课程",
          },
        ];
  /*
    建议列表：第一条永远是待办动作，第二条起按「本课程练习」补充。
    练习是课程级口径，文案里写明「本课程」，避免被读成教学班任务。
  */
  const practiceAnswered = s.practiceHistory.reduce(
    (sum, day) => sum + day.answered,
    0,
  );
  const practiceCorrect = s.practiceHistory.reduce(
    (sum, day) => sum + day.correct,
    0,
  );
  const practiceTip =
    s.practiceHistory.length && practiceAnswered
      ? {
          tone: "practice" as const,
          title: `练习正确率 ${Math.round((practiceCorrect / practiceAnswered) * 100)}%`,
          text: `本课程最近 ${s.practiceHistory.length} 个练习日 · 共 ${practiceAnswered} 道题`,
          href: `/student/practice?${scope}`,
          label: "去练习",
        }
      : null;
  const suggestions = [
    { ...tips[0], tone: "brand" as const },
    ...(practiceTip ? [practiceTip] : []),
  ];
  /*
    常用入口：填满右栏剩余高度，同时承担「下一步去哪儿」的导航。
    全部为已有路由，不引入新的数据口径。
  */
  const quickLinks = [
    {
      label: "错题复习",
      hint: "按课程整理错题与收藏",
      href: `/student/wrong-questions?${scope}`,
      icon: ListChecks,
    },
    {
      label: "课程任务",
      hint: "查看待办、考试与签到安排",
      href: `/student/tasks?${scope}`,
      icon: ClipboardList,
    },
    {
      label: "课程总评",
      hint: "成绩明细与目标达成",
      href: `/student/results?view=course&courseId=${s.course.id}&classroomId=${s.classroom.id}`,
      icon: ChartNoAxesCombined,
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
      value: assignmentCompletion === null ? "—" : `${assignmentCompletion}%`,
      detail: `已提交 ${s.assignmentProgress.submitted} / ${s.assignmentProgress.total} 项作业`,
      icon: CheckCheck,
      tint: "bg-sky-50 text-sky-600",
    },
    {
      label: "作业与考试均分",
      value: s.average ?? "—",
      detail: s.gradedCount
        ? `来自 ${s.gradedCount} 项百分制成绩`
        : "暂无完整的已公布成绩",
      icon: ChartNoAxesCombined,
      tint: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "未提交作业",
      value: unsubmittedAssignments,
      detail: s.assignmentProgress.overdue
        ? `${s.assignmentProgress.overdue} 项已截止`
        : s.assignmentProgress.total
          ? "当前教学班的正式作业"
          : "当前教学班暂无已开放作业",
      icon: ClipboardList,
      tint: "bg-amber-50 text-amber-600",
    },
    {
      label: "出勤次数",
      value: s.attendance.total,
      detail: s.attendance.total
        ? `正常 ${s.attendance.present} 次 · 待确认 ${s.attendance.pending} 次`
        : "我还没有出勤记录",
      icon: CalendarCheck2,
      tint: "bg-teal-50 text-teal-600",
    },
  ];
  return (
    <section
      className="grid gap-4 pb-2 xl:grid-cols-[minmax(0,1fr)_22.5rem]"
      aria-label="个人学情分析看板"
    >
      <div className="min-w-0 xl:col-span-2 xl:row-start-1">
        <StudentPageHeader
          title="学习分析"
          description="查看我的作业、成绩和出勤记录。"
          actions={
            <StudentCourseReturnLink
              courseId={s.course.id}
              classroomId={s.classroom.id}
            />
          }
        />
      </div>
      <header
        className={`${panel} relative overflow-hidden px-5 py-5 sm:px-6 xl:col-span-2 xl:row-start-2`}
      >
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
              <span>当前教学班</span>
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
      <div className="grid grid-cols-2 gap-3 xl:col-span-2 xl:row-start-3 xl:grid-cols-4 xl:gap-4">
        {metrics.map((m) => (
          <article key={m.label} className={`${panel} p-4 sm:p-5 xl:p-5`}>
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
      <div className="grid gap-4 xl:contents">
        <section
          className={`${panel} flex flex-col p-5 sm:p-6 xl:col-span-1 xl:col-start-1 xl:row-start-4`}
        >
          <PanelTitle
            icon={<ChartNoAxesCombined className="size-4" />}
            title="我的学习记录"
            description="切换统计口径，查看最近的成绩变化"
            action={
              <Link href={assignments} className={panelAction}>
                作业记录
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <ScoreTrendChart
            initialTab={initialChart}
            practice={s.practiceHistory}
            practiceHref={`/student/practice?${scope}`}
            series={{
              all: s.scoreHistory,
              assignment: s.scoreHistoryByKind.assignment,
              exam: s.scoreHistoryByKind.exam,
            }}
            status={{
              total: s.total,
              published: s.publishedCount,
              awaiting: s.awaitingRelease,
              unsubmitted: s.unsubmitted,
              examEnded: s.total - s.assignmentProgress.total,
              examSubmitted: s.submitted - s.assignmentProgress.submitted,
            }}
          />
        </section>
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-1 xl:col-start-2 xl:row-start-4">
          <section className={`${panel} flex flex-col p-5 sm:p-6`}>
            <PanelTitle
              icon={<CalendarCheck2 className="size-4" />}
              title="我的出勤记录"
              action={
                <Link
                  href={`/student/attendance?${scope}`}
                  className={panelAction}
                >
                  明细
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
            {s.attendance.total ? (
              <>
                <div
                  className="mt-4 grid max-w-[20rem] grid-cols-7 gap-1"
                  role="img"
                  aria-label={`最近 7 天出勤：${s.attendanceWeek
                    .map(
                      (day) =>
                        `周${day.weekday} ${
                          day.status
                            ? (attendanceStatusMeta[day.status]?.label ??
                              "未知")
                            : "无课"
                        }`,
                    )
                    .join("，")}`}
                >
                  {s.attendanceWeek.map((day) => (
                    <div key={day.key} className="text-center">
                      <p className="text-[11px] leading-4 text-slate-400">
                        {day.weekday}
                      </p>
                      <span
                        className={`mt-1 block h-6 rounded-md ${
                          day.status
                            ? (attendanceStatusMeta[day.status]?.tone ??
                              "bg-slate-200")
                            : "bg-slate-100"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="text-slate-400">累计</span>
                  {attendance
                    .filter((item) => item.value > 0)
                    .map((item) => (
                      <span
                        key={item.label}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          className={`size-1.5 rounded-full ${item.color}`}
                        />
                        {item.label}
                        <b className="font-medium text-slate-900 tabular-nums">
                          {item.value}
                        </b>
                      </span>
                    ))}
                </p>
                <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-400">
                  本周 {s.attendanceWeek.filter((day) => day.status).length}{" "}
                  次课；灰格为无课日，不按缺勤计。
                </p>
              </>
            ) : (
              <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-slate-500">
                我还没有出勤记录
              </p>
            )}
          </section>
          {/* 三段式：固定头（标题 + 条目数）、可滚动列表、固定底部入口。
              卡高随内容，条目超过 3 条时列表在卡内滚动，避免把整页撑长或撑出空带 */}
          <section
            className={`${panel} flex min-h-0 flex-1 flex-col overflow-hidden`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="text-sky-600">
                  <Lightbulb className="size-4" aria-hidden="true" />
                </span>
                接下来可以做
              </h2>
              <span className="text-xs text-slate-400 tabular-nums">
                {suggestions.length} 项
              </span>
            </div>
            <ul
              aria-label="学习行动建议"
              className="max-h-[13.5rem] [scrollbar-gutter:stable] divide-y divide-slate-100 overflow-y-auto overscroll-contain"
            >
              {suggestions.map((item) => (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    className="flex min-h-14 items-start gap-2.5 px-5 py-2.5 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-700"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 w-[3px] self-stretch rounded-full ${suggestionTone[item.tone]}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium [overflow-wrap:anywhere] text-slate-800">
                        {item.title}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-xs text-slate-500"
                        title={item.text}
                      >
                        {item.text}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs font-medium text-sky-700">
                      {item.label}
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-5 py-2 text-[11px] leading-4 text-slate-400">
              {scoreTip}
            </p>
            {/* 常用入口：三行等分剩余高度，内容不足时由入口块吸收，不留空带 */}
            <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100">
              <p className="px-5 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-slate-400">
                常用入口
              </p>
              <ul className="flex min-h-0 flex-1 flex-col divide-y divide-slate-100">
                {quickLinks.map((link) => (
                  <li key={link.label} className="flex min-h-11 flex-1">
                    <Link
                      href={link.href}
                      className="flex w-full items-center gap-2.5 px-5 py-1.5 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-700"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sky-600">
                        <link.icon aria-hidden="true" className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-slate-800">
                          {link.label}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {link.hint}
                        </span>
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3 shrink-0 text-sky-700"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sky-600">
                <Network aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-800">
                  我的知识掌握
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  画像汇总我在这门课的评分记录
                </p>
              </div>
              <Link
                href={center}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
              >
                学习中心
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </div>
      <div className="grid gap-4 xl:contents">
        <section
          className={`${panel} flex min-h-0 flex-col xl:col-span-2 xl:col-start-1 xl:row-start-5`}
        >
          <div className="relative z-20 p-5 pb-3 sm:px-6">
            <PanelTitle
              icon={<ClipboardList className="size-4" />}
              title="我的作业与考试记录"
              description="当前教学班最近 8 项记录（含待公布成绩）"
              action={
                <StudentRecordLinks
                  assignmentsHref={assignments}
                  examsHref={`/student/exams?${scope}`}
                  triggerClassName={panelAction}
                />
              }
            />
          </div>
          {s.recent.length ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-2xl">
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_5rem] gap-3 border-y border-slate-100 bg-slate-50/95 px-5 py-2 text-xs text-slate-500 backdrop-blur-sm sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem] sm:px-6">
                <span>任务名称</span>
                <span className="hidden sm:block">类型</span>
                <span className="hidden sm:block">提交 / 发布时间</span>
                <span className="text-right">成绩 / 状态</span>
              </div>
              {/* 记录条目超过卡片可用高度时在卡内滚动，页脚与页面对齐不被撑开 */}
              <ul className="max-h-[19rem] min-h-0 flex-1 [scrollbar-gutter:stable] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                {s.recent.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 px-5 py-3 transition hover:bg-sky-50/50 sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem] sm:px-6"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-700">
                          {row.title}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500 sm:hidden">
                          {shortKindLabel(row.kind)} ·{" "}
                          {row.submittedAt?.toLocaleDateString("zh-CN") ??
                            "时间未记录"}
                        </span>
                      </span>
                      <span className="hidden text-xs text-slate-600 sm:block">
                        {shortKindLabel(row.kind)}
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
                        ) : row.gradeStatus && row.gradeStatus !== "SCORED" ? (
                          <span className="text-xs text-slate-600">
                            {specialGradeLabels[row.gradeStatus] ?? "特殊状态"}
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
              <p className="mt-auto border-t border-slate-100 px-5 py-2.5 text-xs leading-5 text-slate-500 sm:px-6">
                线上提交显示提交时间；台账录入的成绩显示发布时间。
              </p>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 pb-8 text-center text-sm text-slate-500">
              暂无作业与考试记录
            </div>
          )}
        </section>
      </div>
      <footer className="flex flex-wrap items-start justify-between gap-2 px-1 text-[11px] leading-5 text-slate-500 xl:col-span-2 xl:row-start-7">
        <p className="inline-flex max-w-3xl items-start gap-1.5">
          <Info className="mt-1 size-3 shrink-0" aria-hidden="true" />
          均分取当前教学班已公布的作业与考试百分制成绩；同步到已发布台账的考试只计一次。仅台账录入的考试不计入提交率，自主练习和未评分项不计入均分。
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
