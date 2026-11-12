import Link from "next/link";
import { Role } from "@prisma/client";
import { ClipboardCheck } from "lucide-react";
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
  activityCardClass,
} from "@/components/dashboard/student-activity-list";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import { loadActivityExams } from "@/services/student-experience/activity-service";
import { studentTaskHref } from "@/services/student-experience/task-scope";

const statusLabel = {
  TODO: "考试中",
  UPCOMING: "待开考",
  SUBMITTED: "已提交",
  EXPIRED: "已结束",
};
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
        <div className="grid items-start gap-4 md:grid-cols-2">
          {result.items.map((exam) => (
            <article
              id={`exam-${exam.id}`}
              key={exam.id}
              className={`${activityCardClass} scroll-mt-24`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 text-base font-semibold break-words">
                  {exam.title}
                </h2>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                  {statusLabel[exam.status]}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {[
                  exam.courseName,
                  exam.classroomName,
                  exam.examType === "MIDTERM" ? "期中考试" : "期末考试",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                <time dateTime={exam.startsAt.toISOString()}>
                  {formatTime.format(exam.startsAt)}
                </time>{" "}
                开考 ·{" "}
                <time dateTime={exam.dueAt.toISOString()}>
                  {formatTime.format(exam.dueAt)}
                </time>{" "}
                截止
              </p>
              <details className="mt-3 rounded-lg border border-sky-100 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-sky-700">
                  考核要求与学习安排
                </summary>
                <div className="mt-3 space-y-2 text-slate-700">
                  <p>
                    考试约{" "}
                    {Math.round(
                      (exam.dueAt.getTime() - exam.startsAt.getTime()) / 60000,
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
              <div className="mt-4 flex flex-wrap gap-2">
                {exam.status !== "UPCOMING" && (
                  <Link className={activityActionClass} href={exam.href}>
                    {exam.status === "TODO" ? "进入考试" : "查看考试记录"}
                  </Link>
                )}
                {exam.canViewReport && (
                  <Link
                    className={activityActionClass}
                    href={studentTaskHref(
                      `/student/exams/${exam.examId}/report`,
                      exam.scope,
                    )}
                  >
                    查看考试报告
                  </Link>
                )}
              </div>
            </article>
          ))}
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
