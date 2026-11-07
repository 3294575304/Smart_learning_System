import { Role } from "@prisma/client";
import { ArrowRight, CalendarClock, CircleCheck } from "lucide-react";
import Link from "next/link";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import {
  StudentTaskList,
  STUDENT_TASK_PRESENTATION,
} from "@/components/dashboard/student-task-list";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskKind,
} from "@/services/dashboard/student-task-overview";

const groups: Array<{
  kind: StudentTaskKind;
  href: string;
}> = [
  {
    kind: "assignment",
    href: "/student/assignments?status=ALL",
  },
  {
    kind: "attendance",
    href: "/student/attendance",
  },
  {
    kind: "survey",
    href: "/student/surveys",
  },
];

export default async function StudentTasksPage() {
  const student = await requirePageRole(Role.STUDENT);
  const overview = await getStudentTaskOverview(student.id);
  return (
    <section className="space-y-5">
      <SurveyAvailabilityRefresh at={overview.nextChangeAt?.toISOString()} />
      <PageHeader
        title="学习任务"
        description="集中处理各门课程的全部待办，也可查看作业、签到和问卷记录。"
      />
      <div className="@container">
        <div className="grid items-start gap-4 @min-[52rem]:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-4">
            <section
              aria-labelledby="student-pending-tasks"
              className="rounded-2xl border bg-white"
            >
              <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2
                    id="student-pending-tasks"
                    className="text-lg font-semibold text-slate-950"
                  >
                    我的待办
                  </h2>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 tabular-nums">
                    {overview.total} 项待处理
                  </span>
                </div>
                {overview.total > 1 && (
                  <p className="text-xs leading-5 text-slate-600">
                    签到优先，其余按截止时间排序
                  </p>
                )}
              </header>
              {overview.items.length ? (
                <StudentTaskList
                  items={overview.items}
                  priorityId={overview.items[0]?.id}
                  layout="workspace"
                />
              ) : (
                <div className="flex items-start gap-3 px-4 py-5 sm:px-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <CircleCheck aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">暂无待办</p>
                    <p className="mt-0.5 text-sm leading-5 text-slate-600">
                      可以继续查看作业、出勤和问卷记录。
                    </p>
                  </div>
                </div>
              )}
            </section>
            {overview.scheduledSurveys.length > 0 && (
              <section
                aria-labelledby="scheduled-surveys-heading"
                className="rounded-2xl border bg-white px-4 py-4 sm:px-5"
              >
                <h2
                  id="scheduled-surveys-heading"
                  className="flex items-center gap-2 font-semibold text-slate-950"
                >
                  <CalendarClock
                    aria-hidden="true"
                    className="size-5 shrink-0 text-violet-700"
                  />
                  待开放问卷
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  开放后显示在待办中，问卷不计入成绩。
                </p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {overview.scheduledSurveys.map((survey) => (
                    <li key={survey.id} className="py-1 last:pb-0">
                      <Link
                        className="group flex min-h-11 items-center gap-3 rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                        href={survey.href}
                      >
                        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          <p className="text-sm font-medium text-slate-900 group-hover:text-sky-800">
                            {survey.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-slate-600">
                            {studentTaskContext(survey)} ·{" "}
                            <time dateTime={survey.opensAt.toISOString()}>
                              {studentTaskDate(survey.opensAt)}
                            </time>{" "}
                            开放
                          </p>
                        </div>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-sky-700"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <section
            aria-labelledby="student-task-records"
            className="rounded-2xl border bg-white p-4"
          >
            <h2
              id="student-task-records"
              className="px-1 text-base font-semibold text-slate-950"
            >
              课程任务入口
            </h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {groups.map(({ kind, href }) => {
                const {
                  icon: Icon,
                  label,
                  color,
                } = STUDENT_TASK_PRESENTATION[kind];
                const count = overview.counts[kind];
                return (
                  <li
                    key={kind}
                    id={kind}
                    className="scroll-mt-24 py-1.5 last:pb-0"
                  >
                    <Link
                      href={href}
                      className="group flex min-h-12 items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-sky-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {label}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                          {count} 项待办
                        </p>
                      </div>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-sky-700"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}
