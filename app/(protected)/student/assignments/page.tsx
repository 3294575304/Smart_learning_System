import { StudentClassroomFilter } from "@/components/dashboard/student-classroom-filter";
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
import { PageIndex } from "@/components/dashboard/page-index";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  studentAssignmentListQuerySchema,
  type StudentAssignmentListQuery,
} from "@/services/assignments/schemas";
import { listStudentAssignments } from "@/services/assignments/service";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { courseIdSchema } from "@/services/courses/schemas";
import { getStudentCourseContext } from "@/services/courses/student-access";

const PAGE_SIZE = 8;

const FILTERS: Array<{
  value: StudentAssignmentListQuery["status"];
  label: string;
}> = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待完成" },
  { value: "IN_PROGRESS", label: "进行中" },
  { value: "SUBMITTED", label: "已提交" },
  { value: "EXPIRED", label: "已截止" },
];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const assignmentState = studentAssignmentState;

function stateLabel(state: ReturnType<typeof assignmentState>): string {
  return FILTERS.find((filter) => filter.value === state)?.label ?? state;
}

function pageHref(
  query: StudentAssignmentListQuery,
  page: number,
  courseId?: string,
  classroomId?: string,
): string {
  const params = new URLSearchParams({
    status: query.status,
    page: String(page),
  });
  if (courseId) params.set("courseId", courseId);
  if (classroomId) params.set("classroomId", classroomId);
  return `/student/assignments?${params.toString()}`;
}

export default async function StudentAssignmentsPage({ searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const rawCourseId =
    typeof raw.courseId === "string" ? raw.courseId : undefined;
  const parsedCourseId =
    rawCourseId !== undefined ? courseIdSchema.safeParse(rawCourseId) : null;
  if (parsedCourseId && !parsedCourseId.success) notFound();
  let course: Awaited<ReturnType<typeof getStudentCourseContext>> | null = null;
  if (parsedCourseId?.success) {
    try {
      course = await getStudentCourseContext(student.id, parsedCourseId.data);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }
  }
  const classroomId =
    typeof raw.classroomId === "string" ? raw.classroomId : undefined;
  if (raw.classroomId !== undefined && !classroomId) notFound();
  const classrooms = await listStudentTaskClassrooms(student.id, course?.id);
  if (classroomId && !classrooms.some((item) => item.id === classroomId))
    notFound();
  const parsed = studentAssignmentListQuerySchema.safeParse({
    page: typeof raw.page === "string" ? raw.page : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const query = parsed.success
    ? parsed.data
    : studentAssignmentListQuerySchema.parse({});
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
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm"
              href="/student/results?view=course"
            >
              查看课程总评
            </Link>
          }
        />
        <StudentClassroomFilter
          classrooms={classrooms}
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
  const assignments = await listStudentAssignments(
    student.id,
    course?.id,
    classroomId,
  );
  const now = new Date();
  const filtered = assignments.filter(
    (assignment) =>
      query.status === "ALL" ||
      assignmentState(assignment, now) === query.status,
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const page = Math.min(query.page, Math.max(totalPages, 1));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            href={
              course
                ? `/student/courses/${course.id}/learning-center${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`
                : "/student/tasks"
            }
          >
            {course ? "返回课程学习中心" : "返回学习任务"}
          </Link>
        }
        description={
          course
            ? `仅显示「${course.name}」中分配给你的作业。`
            : "从作答到提交、批改和成绩统一查看；已结束班级的本人提交记录会继续保留。"
        }
        eyebrow={course?.name}
        title="我的作业"
      />

      <StudentClassroomFilter
        classrooms={classrooms}
        selectedId={classroomId}
        summary={`当前 ${filtered.length} 项作业`}
      />
      <StudentAssignmentTabs
        view="work"
        courseId={course?.id}
        classroomId={classroomId}
      />
      <nav
        aria-label="作业状态筛选"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {FILTERS.map((filter) => (
          <Link
            aria-current={query.status === filter.value ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
              query.status === filter.value
                ? "border-sky-600 bg-sky-600 text-white"
                : "bg-white hover:bg-gray-50"
            }`}
            href={pageHref(
              { ...query, status: filter.value },
              1,
              course?.id,
              classroomId,
            )}
            key={filter.value}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {pageItems.length === 0 ? (
        <EmptyState
          action={
            query.status === "ALL" ? null : (
              <Link
                className="text-sm font-medium underline"
                href={pageHref(
                  { ...query, status: "ALL" },
                  1,
                  course?.id,
                  classroomId,
                )}
              >
                查看全部作业
              </Link>
            )
          }
          description={
            query.status === "ALL"
              ? "当前没有已发布且可访问的作业。"
              : "当前筛选状态下没有作业。"
          }
          icon={ClipboardList}
          title="暂无作业"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pageItems.map((assignment) => {
            const state = assignmentState(assignment, now);
            return (
              <Link
                className="rounded-xl border bg-white p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-sky-600"
                href={
                  state === "SUBMITTED" && assignment.latestSubmissionId
                    ? `/student/submissions/${assignment.latestSubmissionId}/result`
                    : `/student/assignments/${assignment.id}`
                }
                key={assignment.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{assignment.title}</h2>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      state === "PENDING" || state === "IN_PROGRESS"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {stateLabel(state)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {assignment.classroomName} · {assignment.questionCount} 题 ·{" "}
                  {assignment.totalPoints} 分
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  开始：{assignment.publishedAt.toLocaleString("zh-CN")}
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
                      ? `已发布成绩：${assignment.latestPublishedScore ?? "—"} / ${assignment.totalPoints}`
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

      {totalPages > 1 ? (
        <PageIndex
          ariaLabel="作业分页"
          hrefForPage={(targetPage) =>
            pageHref(query, targetPage, course?.id, classroomId)
          }
          page={page}
          summary={`第 ${page} / ${totalPages} 页`}
          totalPages={totalPages}
        />
      ) : null}
    </section>
  );
}
