import Link from "next/link";
import { Role } from "@prisma/client";
import { ArrowRight, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import {
  StudentTaskList,
  STUDENT_TASK_PRESENTATION,
} from "@/components/dashboard/student-task-list";
import {
  StudentActivityFilters,
  StudentActivityPagination,
  activityActionClass,
  activityCardClass,
} from "@/components/dashboard/student-activity-list";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import {
  studentTaskContext,
  studentTaskDate,
} from "@/services/dashboard/student-task-overview";
import { activityHref } from "@/services/student-experience/activity-query";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import { loadActivityTasks } from "@/services/student-experience/activity-service";

const entries = [
  { kind: "exam", view: "exams" },
  { kind: "assignment", view: "assignments" },
  { kind: "attendance", view: "attendance" },
  { kind: "survey", view: "surveys" },
] as const;

export default async function StudentTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const query = readActivityPageQuery("tasks", await searchParams);
  const [overview, classrooms] = await Promise.all([
    readActivityPage(() => loadActivityTasks(student.id, query)),
    listStudentTaskClassrooms(student.id, query.courseId),
  ]);
  const pending = overview.items.filter((item) => item.status === "TODO");
  const upcoming = overview.items.filter((item) => item.status === "UPCOMING");
  return (
    <section className="space-y-4">
      <SurveyAvailabilityRefresh at={overview.nextChangeAt?.toISOString()} />
      <StudentPageHeader
        title="学习任务"
        description="查看待办、考试预告和问卷开放安排。"
      />
      <StudentActivityFilters
        view="tasks"
        query={query}
        classrooms={classrooms.filter((room) => room.courseName !== null)}
        total={overview.pagination.total}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {!overview.items.length && (
            <EmptyState
              compact
              icon={ClipboardList}
              title={
                query.status === "ALL" && query.kind === "ALL"
                  ? "暂无待办"
                  : "暂无符合条件的任务"
              }
              description="可以调整筛选，或查看各类任务记录。"
            />
          )}
          {pending.length > 0 && (
            <section
              className={activityCardClass}
              aria-labelledby="student-pending-tasks"
            >
              <h2
                id="student-pending-tasks"
                className="mb-3 text-lg font-semibold"
              >
                我的待办
              </h2>
              <StudentTaskList
                items={pending}
                priorityId={
                  overview.pagination.page === 1 ? pending[0]?.id : undefined
                }
                layout="workspace"
              />
            </section>
          )}
          {upcoming.length > 0 && (
            <section
              className={activityCardClass}
              aria-labelledby="student-upcoming-tasks"
            >
              <h2
                id="student-upcoming-tasks"
                className="mb-3 text-lg font-semibold"
              >
                待开放安排
              </h2>
              <ul className="divide-y divide-slate-100">
                {upcoming.map((item) => (
                  <li
                    key={`${item.kind}:${item.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <h3 className="font-medium break-words">{item.title}</h3>
                      <p className="text-sm text-slate-600">
                        {studentTaskContext(item)} ·{" "}
                        <time dateTime={item.startsAt.toISOString()}>
                          {studentTaskDate(item.startsAt)}
                        </time>{" "}
                        {item.kind === "exam" ? "开考" : "开放"}
                      </p>
                    </div>
                    <Link className={activityActionClass} href={item.href}>
                      查看安排
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <StudentActivityPagination
            view="tasks"
            query={query}
            pagination={overview.pagination}
          />
        </div>
        <section
          className={activityCardClass}
          aria-labelledby="student-task-records"
        >
          <h2 id="student-task-records" className="font-semibold">
            课程任务入口
          </h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {entries.map(({ kind, view }) => {
              const {
                label,
                icon: Icon,
                color,
              } = STUDENT_TASK_PRESENTATION[kind];
              return (
                <li key={kind} id={kind} className="scroll-mt-24 py-1">
                  <Link
                    href={activityHref(view, {
                      courseId: query.courseId,
                      classroomId: query.classroomId,
                    })}
                    className="flex min-h-12 items-center gap-3 rounded-lg px-1 py-2 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{label}</span>
                      <span className="block text-xs text-slate-600">
                        {overview.counts[kind]} 项待办
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-sky-700"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
