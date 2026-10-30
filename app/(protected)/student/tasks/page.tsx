import { Role } from "@prisma/client";
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
  action: string;
  detail: string;
}> = [
  {
    kind: "assignment",
    href: "/student/assignments?status=ALL",
    action: "查看作业",
    detail: "继续作答或查看已提交记录与成绩。",
  },
  {
    kind: "attendance",
    href: "/student/attendance",
    action: "查看出勤",
    detail: "处理开放中的课堂签到，查看出勤记录。",
  },
  {
    kind: "survey",
    href: "/student/surveys",
    action: "查看问卷",
    detail: "填写已开放问卷；问卷不计入课程成绩。",
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
        description="查看各门课程的作业、签到和问卷，与学习主页使用相同的待办范围。"
      />
      <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700">
        当前有 <strong>{overview.total}</strong>{" "}
        项待处理任务。开放中的签到优先处理，其他任务按截止时间排列。
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {groups.map(({ kind, href, action, detail }) => {
          const { icon: Icon, label } = STUDENT_TASK_PRESENTATION[kind];
          const items = overview.items.filter((item) => item.kind === kind);
          return (
            <section
              key={kind}
              id={kind}
              aria-label={label}
              className="min-w-0 scroll-mt-24 rounded-2xl border bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Icon aria-hidden="true" className="size-5 text-sky-700" />
                  {label}
                </h2>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                  {overview.counts[kind]} 项待处理
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
              <div className="mt-4 border-t pt-4">
                {items.length ? (
                  <StudentTaskList items={items} />
                ) : (
                  <p className="text-sm text-slate-500">当前没有待处理事项。</p>
                )}
              </div>
              <Link
                className="mt-5 inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600"
                href={href}
              >
                {action}
              </Link>
            </section>
          );
        })}
      </div>
      {overview.scheduledSurveys.length ? (
        <section
          aria-labelledby="scheduled-surveys-heading"
          className="rounded-2xl border bg-white p-5"
        >
          <h2 id="scheduled-surveys-heading" className="font-semibold">
            待开放问卷（{overview.scheduledSurveys.length} 份）
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            开放后才计入待处理任务，所有问卷均不计入成绩。
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {overview.scheduledSurveys.map((survey) => (
              <li key={survey.id}>
                <Link
                  className="text-sm font-medium text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-sky-600"
                  href={survey.href}
                >
                  {survey.title}
                </Link>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {studentTaskContext(survey)} ·{" "}
                  {studentTaskDate(survey.opensAt)} 开放
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
