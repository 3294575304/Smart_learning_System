import Link from "next/link";
import { Role } from "@prisma/client";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  StudentActivityFilters,
  StudentActivityPagination,
  activityActionClass,
} from "@/components/dashboard/student-activity-list";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import { loadActivityExams } from "@/services/student-experience/activity-service";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import { activityHref } from "@/services/student-experience/activity-query";

import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";

const examStatus = {
  TODO: { label: "考试中", tone: "brand" },
  UPCOMING: { label: "待开考", tone: "warn" },
  SUBMITTED: { label: "已提交", tone: "ok" },
  EXPIRED: { label: "已结束", tone: "neutral" },
} satisfies Record<string, { label: string; tone: StatusChipTone }>;
const formatTime = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const query = readActivityPageQuery("exams", await searchParams);
  const [result, classrooms] = await Promise.all([
    readActivityPage(() => loadActivityExams(student.id, query)),
    listStudentTaskClassrooms(student.id, query.courseId),
  ]);
  return (
    <section className="space-y-4">
      <SurveyAvailabilityRefresh at={result.nextChangeAt?.toISOString()} />
      <StudentPageHeader
        title="我的考试"
        description="查看考试安排、考核要求和提交状态。"
        actions={
          query.courseId && query.classroomId ? (
            <StudentCourseReturnLink
              courseId={query.courseId}
              classroomId={query.classroomId}
              tab="tasks"
            />
          ) : (
            <StudentBackLink href="/student/tasks">
              返回学习任务
            </StudentBackLink>
          )
        }
      />
      <StudentActivityFilters
        view="exams"
        query={query}
        classrooms={classrooms.filter((room) => room.courseName !== null)}
        total={result.pagination.total}
      />
      {result.items.length ? (
        <div className="space-y-2.5">
          {result.items.map((exam) => {
            const returnQuery = new URLSearchParams({
              returnTo: activityHref("exams", {
                ...query,
                page: result.pagination.page,
                focus: exam.id,
              }),
            });
            return (
              <article
                id={`exam-${exam.id}`}
                key={exam.id}
                className="border-line bg-card min-w-0 scroll-mt-24 rounded-xl border px-4 py-3.5"
              >
                <div className="flex min-w-0 flex-wrap items-start gap-3">
                  <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-lg">
                    <ClipboardCheck aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-ink text-[15px] font-semibold [overflow-wrap:anywhere]">
                        {exam.title}
                      </h2>
                      <StatusChip tone={examStatus[exam.status].tone}>
                        {examStatus[exam.status].label}
                      </StatusChip>
                    </div>
                    <p className="text-ink-soft mt-1 text-xs leading-5">
                      {[
                        exam.courseName,
                        exam.classroomName,
                        exam.examType === "MIDTERM" ? "期中考试" : "期末考试",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-ink-soft mt-0.5 text-xs leading-5">
                      <time dateTime={exam.startsAt.toISOString()}>
                        {formatTime.format(exam.startsAt)}
                      </time>{" "}
                      开考 ·{" "}
                      <time dateTime={exam.dueAt.toISOString()}>
                        {formatTime.format(exam.dueAt)}
                      </time>{" "}
                      截止
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {exam.status !== "UPCOMING" && (
                      <Link
                        className={
                          exam.status === "TODO"
                            ? "bg-brand hover:bg-brand-strong focus-visible:outline-brand inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                            : activityActionClass
                        }
                        href={
                          exam.status === "TODO"
                            ? exam.href
                            : exam.href + "&" + returnQuery
                        }
                      >
                        {exam.status === "TODO" ? "进入考试" : "查看考试记录"}
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    )}
                    {exam.canViewReport && (
                      <Link
                        className={activityActionClass}
                        href={
                          studentTaskHref(
                            "/student/exams/" + exam.examId + "/report",
                            exam.scope,
                          ) +
                          "&" +
                          returnQuery
                        }
                      >
                        查看考试报告
                      </Link>
                    )}
                  </div>
                </div>
                <details className="border-line-soft mt-3 border-t pt-2.5 text-sm">
                  <summary className="text-brand-strong cursor-pointer rounded font-medium focus-visible:outline-2 focus-visible:outline-sky-700">
                    考核要求与学习安排
                  </summary>
                  <div className="mt-3 space-y-2 text-slate-700">
                    <p>
                      考试约{" "}
                      {Math.round(
                        (exam.dueAt.getTime() - exam.startsAt.getTime()) /
                          60000,
                      )}{" "}
                      分钟，允许切屏 {exam.allowedSwitches} 次。请在截止前提交。
                    </p>
                    <p>
                      考试范围以教师公布内容为准。可先查看本课程任务和错题，再安排限时练习。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className={activityActionClass}
                        href={studentTaskHref(
                          `/student/courses/${exam.scope.courseId}/learning-center?tab=tasks`,
                          exam.scope,
                        )}
                      >
                        查看课程任务
                      </Link>
                      <Link
                        className={activityActionClass}
                        href={studentTaskHref(
                          "/student/wrong-questions",
                          exam.scope,
                        )}
                      >
                        按课程复习
                      </Link>
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          compact
          icon={ClipboardCheck}
          title="暂无符合条件的考试"
          description="可以调整教学班或状态筛选。"
        />
      )}
      <StudentActivityPagination
        view="exams"
        query={query}
        pagination={result.pagination}
      />
    </section>
  );
}
