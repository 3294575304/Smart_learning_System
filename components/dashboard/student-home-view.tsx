import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  History,
  ListTodo,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { StudentPageHeader } from "./student-page-header";
import {
  STUDENT_TASK_PRESENTATION,
  StudentTaskList,
} from "./student-task-list";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskOverview,
} from "@/services/dashboard/student-task-overview";

const shortcuts = [
  {
    title: "我的课程",
    detail: "进入课程，查看本班学习任务",
    href: "/student/courses",
    icon: GraduationCap,
  },
  {
    title: "练习中心",
    detail: "自主选题，继续针对性练习",
    href: "/student/recommendations",
    icon: Sparkles,
  },
  {
    title: "复习中心",
    detail: "回顾错题和收藏的题目",
    href: "/student/wrong-questions",
    icon: BookOpen,
  },
  {
    title: "我的成绩",
    detail: "查看提交记录和已发布成绩",
    href: "/student/assignments?view=records",
    icon: History,
  },
];
const linkStyle =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

export function StudentHomeView({
  name,
  overview,
}: {
  name: string;
  overview: StudentTaskOverview;
}) {
  const next = overview.items[0];
  return (
    <section className="space-y-5">
      <StudentPageHeader
        title={`${name}，今天继续加油`}
        description="先处理课程待办，再按自己的节奏练习和复习。"
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          <section
            aria-labelledby="next-task-heading"
            className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white p-5 sm:p-6"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
              <ListTodo aria-hidden="true" className="size-4" />
              当前优先任务
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 flex-1 basis-56">
                <h2
                  id="next-task-heading"
                  className="text-xl font-semibold break-words text-slate-900"
                >
                  {next ? next.title : "当前没有待处理任务"}
                </h2>
                {next ? (
                  <>
                    <p className="mt-2 text-sm break-words text-slate-600">
                      {studentTaskContext(next)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {STUDENT_TASK_PRESENTATION[next.kind].label} ·{" "}
                      {next.state} · {studentTaskDate(next.dueAt)}{" "}
                      {next.kind === "attendance" ? "结束签到" : "截止"}
                    </p>
                    {next.kind === "survey" ? (
                      <p className="mt-2 text-xs text-slate-500">
                        问卷不计入课程成绩。
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    可以进入课程继续学习，或到练习中心巩固知识。
                  </p>
                )}
              </div>
              <Link
                className={`${linkStyle} bg-sky-600 text-white hover:bg-sky-700`}
                href={next?.href ?? "/student/courses"}
              >
                {next?.action ?? "进入我的课程"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </section>

          <section
            aria-labelledby="pending-tasks-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="pending-tasks-heading"
                className="text-base font-semibold text-slate-900"
              >
                我的待办{" "}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  {overview.total} 项
                </span>
              </h2>
              <Link
                className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-sky-600"
                href="/student/tasks"
              >
                查看全部任务
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
              {(
                Object.keys(STUDENT_TASK_PRESENTATION) as Array<
                  keyof typeof STUDENT_TASK_PRESENTATION
                >
              ).map((kind) => {
                const {
                  label,
                  icon: Icon,
                  color,
                } = STUDENT_TASK_PRESENTATION[kind];
                return (
                  <Link
                    key={kind}
                    href={`/student/tasks#${kind}`}
                    className={`min-w-0 rounded-xl p-3 transition hover:ring-1 hover:ring-current focus-visible:outline-2 focus-visible:outline-sky-600 sm:p-4 ${color}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      {label}
                    </div>
                    <p className="mt-2 text-2xl font-semibold">
                      {overview.counts[kind]}
                      <span className="ml-1 text-xs font-normal">项</span>
                    </p>
                  </Link>
                );
              })}
            </div>
            <div className="mt-5">
              {overview.items.length ? (
                <StudentTaskList items={overview.items.slice(0, 5)} />
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-5 shrink-0 text-emerald-600"
                  />
                  作业、签到和问卷暂无待办。
                </div>
              )}
            </div>
            {overview.total > 5 ? (
              <p className="mt-4 border-t pt-3 text-xs text-slate-500">
                显示优先处理的 5 项，其余 {overview.total - 5}{" "}
                项可在全部任务中查看。
              </p>
            ) : null}
          </section>

          {overview.scheduledSurveys.length ? (
            <section
              aria-labelledby="upcoming-surveys-heading"
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="upcoming-surveys-heading"
                  className="font-semibold text-slate-900"
                >
                  问卷开放预告
                </h2>
                <span className="text-xs text-slate-500">
                  {overview.scheduledSurveys.length} 份待开放 · 暂不计入待办
                </span>
              </div>
              <ul className="mt-3 space-y-3">
                {overview.scheduledSurveys.slice(0, 2).map((survey) => (
                  <li key={survey.id} className="text-sm">
                    <Link
                      className="font-medium text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-sky-600"
                      href={survey.href}
                    >
                      {survey.title}
                    </Link>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {studentTaskContext(survey)} ·{" "}
                      {studentTaskDate(survey.opensAt)} 开放 · 不计入成绩
                    </p>
                  </li>
                ))}
              </ul>
              {overview.scheduledSurveys.length > 2 ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center text-sm text-sky-700 hover:underline"
                  href="/student/surveys"
                >
                  查看全部开放安排
                </Link>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside
          aria-labelledby="student-shortcuts-heading"
          className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h2
            id="student-shortcuts-heading"
            className="font-semibold text-slate-900"
          >
            常用入口
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {shortcuts.map(({ title, detail, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-w-0 items-start gap-3 rounded-xl p-3 transition hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600"
              >
                <span className="rounded-lg bg-sky-50 p-2 text-sky-700 group-hover:bg-white">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {detail}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Link
              href="/student/analytics"
              className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-600 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600"
            >
              <BrainCircuit aria-hidden="true" className="size-4" />
              查看学习分析
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              课程进展、掌握情况与学习趋势在对应课程和分析页面查看。
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
