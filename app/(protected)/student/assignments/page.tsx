import { Role } from "@prisma/client";
import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIndex } from "@/components/dashboard/page-index";
import { PageHeader } from "@/components/dashboard/page-header";
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

function assignmentState(
  assignment: Awaited<ReturnType<typeof listStudentAssignments>>[number],
  now: Date,
): Exclude<StudentAssignmentListQuery["status"], "ALL"> {
  if (assignment.latestSubmissionId) return "SUBMITTED";
  if (assignment.inProgressSubmissionId) return "IN_PROGRESS";
  if (assignment.dueAt <= now) return "EXPIRED";
  return "PENDING";
}

function stateLabel(state: ReturnType<typeof assignmentState>): string {
  return FILTERS.find((filter) => filter.value === state)?.label ?? state;
}

function pageHref(
  query: StudentAssignmentListQuery,
  page: number,
  courseId?: string,
): string {
  const params = new URLSearchParams({
    status: query.status,
    page: String(page),
  });
  if (courseId) params.set("courseId", courseId);
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
  const parsed = studentAssignmentListQuerySchema.safeParse({
    page: typeof raw.page === "string" ? raw.page : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const query = parsed.success
    ? parsed.data
    : studentAssignmentListQuerySchema.parse({});
  const assignments = await listStudentAssignments(student.id, course?.id);
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
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            href={
              course
                ? `/student/courses/${course.id}/learning-center`
                : "/student/tasks"
            }
          >
            {course ? "返回课程学习中心" : "返回学习任务"}
          </Link>
        }
        description={
          course
            ? `仅显示「${course.name}」中分配给你的作业。`
            : "查看各门课程待完成、作答中、已提交与已截止的作业。"
        }
        eyebrow={course?.name}
        title="我的作业"
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
            href={pageHref({ ...query, status: filter.value }, 1, course?.id)}
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
                href={pageHref({ ...query, status: "ALL" }, 1, course?.id)}
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
                className="rounded-xl border bg-white p-5 transition-colors hover:bg-gray-50"
                href={`/student/assignments/${assignment.id}`}
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
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
                  {state === "IN_PROGRESS"
                    ? "继续作答"
                    : state === "SUBMITTED"
                      ? "查看提交记录"
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
          hrefForPage={(targetPage) => pageHref(query, targetPage, course?.id)}
          page={page}
          summary={`第 ${page} / ${totalPages} 页`}
          totalPages={totalPages}
        />
      ) : null}
    </section>
  );
}
