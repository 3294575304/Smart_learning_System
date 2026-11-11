import {
  StudentActivityFilters,
  StudentActivityPagination,
  activityCardClass,
} from "@/components/dashboard/student-activity-list";
import { activityHref } from "@/services/student-experience/activity-query";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import { loadActivityAssignments } from "@/services/student-experience/activity-service";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { studentScoreLabel } from "@/services/recommendations/scoring";
import { StudentTaskScope } from "@/components/dashboard/student-task-scope";
import {
  studentTaskScopeSchema,
  studentTaskHref,
} from "@/services/student-experience/task-scope";
import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import { StudentAssignmentTabs } from "@/components/assignments/student-assignment-tabs";
import { StudentSubmissionHistory } from "@/components/assignment-results/student-submission-history";
import { listStudentResults } from "@/services/dashboard/student-dashboard";
import { studentResultsQuerySchema } from "@/services/assignments/schemas";
import { studentAssignmentState } from "@/services/student-experience/task-policy";
import { Role } from "@prisma/client";
import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/dashboard/empty-state";

import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { requirePageRole } from "@/services/auth/page-authorization";

import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentCourseContext } from "@/services/courses/student-access";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const assignmentState = studentAssignmentState;

const STATE_LABELS: Record<ReturnType<typeof assignmentState>, string> = {
  PENDING: "未开始",
  IN_PROGRESS: "进行中",
  SUBMITTED: "已提交",
  EXPIRED: "已截止",
};

export default async function StudentAssignmentsPage({ searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const scopeResult = studentTaskScopeSchema.safeParse({
    ...raw,
    classroomId: raw.classroomId === "" ? undefined : raw.classroomId,
  });
  if (!scopeResult.success) notFound();
  const { courseId, classroomId } = scopeResult.data;
  let course: Awaited<ReturnType<typeof getStudentCourseContext>> | null = null;
  if (courseId) {
    try {
      course = await getStudentCourseContext(student.id, courseId);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }
  }
  const classrooms = await listStudentTaskClassrooms(student.id, course?.id);
  if (classroomId && !classrooms.some((item) => item.id === classroomId))
    notFound();
  if (raw.view === "records") {
    const parsedResults = studentResultsQuerySchema.safeParse({
      page:
        typeof raw.page === "string" && Number(raw.page) <= 100_000
          ? raw.page
          : undefined,
      pageSize: typeof raw.pageSize === "string" ? raw.pageSize : undefined,
    });
    const resultQuery = parsedResults.success
      ? parsedResults.data
      : studentResultsQuerySchema.parse({});
    const results = await listStudentResults(
      student.id,
      resultQuery,
      course?.id,
      classroomId,
    );
    return (
      <section className="space-y-4">
        <PageHeader
          title="我的作业"
          description="统一查看提交记录、批改进度与正式成绩；历史班级保留本人记录，未发布成绩不提前显示。"
          eyebrow={course?.name}
          actions={
            course && classroomId ? (
              <StudentCourseReturnLink
                courseId={course.id}
                classroomId={classroomId}
                tab="tasks"
              />
            ) : (
              <StudentBackLink href="/student/results?view=course">
                查看课程总评
              </StudentBackLink>
            )
          }
        />
        <StudentTaskScope
          classrooms={classrooms}
          courseId={course?.id}
          selectedId={classroomId}
          summary={`共 ${results.pagination.total} 条提交记录`}
        />
        <StudentAssignmentTabs
          view="records"
          courseId={course?.id}
          classroomId={classroomId}
        />
        <StudentSubmissionHistory
          query={resultQuery}
          results={results}
          courseId={course?.id}
          classroomId={classroomId}
        />
      </section>
    );
  }
  const now = new Date();
  const query = readActivityPageQuery("assignments", raw);
  const result = await readActivityPage(() =>
    loadActivityAssignments(student.id, query, now),
  );
  const { items: pageItems, pagination } = result;

  return (
    <section className="space-y-4">
      <PageHeader
        actions={
          course ? (
            <StudentCourseReturnLink
              courseId={course.id}
              classroomId={classroomId}
              tab="tasks"
            />
          ) : (
            <StudentBackLink href="/student/tasks">
              返回学习任务
            </StudentBackLink>
          )
        }
        description={
          course
            ? "查看当前课程的全部作业、提交记录与成绩，最新发布的作业排在前面。"
            : "查看各门课程的全部作业、提交记录与成绩。待处理任务集中在学习任务中。"
        }
        eyebrow={course?.name}
        title="我的作业"
      />

      <StudentActivityFilters
        view="assignments"
        query={query}
        classrooms={classrooms}
        total={pagination.total}
      />
      <StudentAssignmentTabs
        view="work"
        courseId={course?.id}
        classroomId={classroomId}
      />
      {pageItems.length === 0 ? (
        <EmptyState
          compact
          action={
            query.status === "ALL" ? null : (
              <Link
                className="text-sm font-medium underline"
                href={activityHref("assignments", { courseId, classroomId })}
              >
                查看全部作业
              </Link>
            )
          }
          description={
            query.status === "ALL"
              ? course && classroomId
                ? "本班暂无已发布且可访问的作业。"
                : "当前没有已发布且可访问的作业。"
              : "当前筛选状态下没有作业。"
          }
          icon={ClipboardList}
          title={course && classroomId ? "本班暂无作业" : "暂无作业"}
        />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          {pageItems.map((assignment) => {
            const state = assignmentState(assignment, now);
            return (
              <Link
                className={`${activityCardClass} transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-sky-600`}
                href={studentTaskHref(
                  state === "SUBMITTED" && assignment.latestSubmissionId
                    ? `/student/submissions/${assignment.latestSubmissionId}/result`
                    : `/student/assignments/${assignment.id}`,
                  scopeResult.data,
                )}
                key={assignment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 font-semibold break-words">
                    {assignment.title}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      state === "PENDING" || state === "IN_PROGRESS"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {STATE_LABELS[state]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {assignment.classroomName} · {assignment.questionCount} 题 ·{" "}
                  百分制展示 · 原始满分 {assignment.totalPoints} 分
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  发布：{assignment.publishedAt.toLocaleString("zh-CN")}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  截止：{assignment.dueAt.toLocaleString("zh-CN")}
                </p>
                {assignment.historyOnly ? (
                  <p className="mt-3 text-xs text-slate-500">
                    历史作业 · 仅查看本人提交记录
                  </p>
                ) : null}
                {assignment.latestSubmissionStatus ? (
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    {assignment.latestSubmissionStatus === "PUBLISHED"
                      ? `已发布成绩：${studentScoreLabel(assignment.latestPublishedScore ?? null, assignment.totalPoints)}`
                      : assignment.latestSubmissionStatus === "GRADED"
                        ? "批改完成 · 成绩待发布"
                        : assignment.latestSubmissionStatus === "PENDING_REVIEW"
                          ? "已提交 · 待教师批改或复核"
                          : "已提交 · 等待批改"}
                  </p>
                ) : null}
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
                  {state === "IN_PROGRESS"
                    ? "继续作答"
                    : state === "SUBMITTED"
                      ? "查看提交与成绩"
                      : state === "EXPIRED"
                        ? "查看详情"
                        : "开始作业"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <StudentActivityPagination
        view="assignments"
        query={query}
        pagination={pagination}
      />
    </section>
  );
}
