import { Role, SubmissionStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublishResultsButton } from "@/components/assignment-results/publish-results-button";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { assignmentResultStatusLabels } from "@/services/assignment-results/service";
import { listTeacherAssignmentSubmissions } from "@/services/assignments/manual-grading";
import {
  assignmentIdSchema,
  teacherSubmissionListQuerySchema,
  type TeacherSubmissionListQuery,
} from "@/services/assignments/schemas";

interface Props {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const filters: Array<{
  label: string;
  status: TeacherSubmissionListQuery["status"];
}> = [
  { label: "全部", status: undefined },
  { label: "待批改", status: SubmissionStatus.PENDING_REVIEW },
  { label: "已批改", status: SubmissionStatus.GRADED },
  { label: "已发布", status: SubmissionStatus.PUBLISHED },
];

function pageHref(
  assignmentId: string,
  query: TeacherSubmissionListQuery,
  page: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.status) params.set("status", query.status);
  return `/teacher/assignments/${assignmentId}/submissions?${params.toString()}`;
}

export default async function TeacherSubmissionsPage({
  params,
  searchParams,
}: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const assignmentId = assignmentIdSchema.safeParse(
    (await params).assignmentId,
  );
  if (!assignmentId.success) notFound();
  const raw = await searchParams;
  const query = teacherSubmissionListQuerySchema.safeParse({
    page: typeof raw.page === "string" ? raw.page : undefined,
    pageSize: typeof raw.pageSize === "string" ? raw.pageSize : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  if (!query.success) notFound();

  try {
    const result = await listTeacherAssignmentSubmissions(
      teacher.id,
      assignmentId.data,
      query.data,
    );
    if (
      result.pagination.totalPages > 0 &&
      result.pagination.page > result.pagination.totalPages
    ) {
      notFound();
    }
    return (
      <section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              className="text-muted-foreground text-sm underline"
              href="/teacher/assignments"
            >
              返回作业管理
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">批改提交</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {result.assignment.title} · {result.assignment.classroomName} ·
              满分 {result.assignment.totalPoints}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PublishResultsButton assignmentId={assignmentId.data} />
            <Link
              className="text-sm underline"
              href={`/teacher/assignments/${assignmentId.data}/results`}
            >
              查看成绩统计
            </Link>
          </div>
        </header>

        <nav aria-label="提交状态筛选" className="flex flex-wrap gap-2">
          {filters.map((filter) => {
            const active = filter.status === query.data.status;
            const href = filter.status
              ? `/teacher/assignments/${assignmentId.data}/submissions?status=${filter.status}`
              : `/teacher/assignments/${assignmentId.data}/submissions`;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-full bg-gray-900 px-4 py-2 text-sm text-white"
                    : "rounded-full border bg-white px-4 py-2 text-sm"
                }
                href={href}
                key={filter.label}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        {result.items.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed bg-white p-10 text-center">
            当前筛选条件下没有提交记录。
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-muted-foreground border-b bg-gray-50">
                <tr>
                  <th className="px-5 py-3 font-medium">学生</th>
                  <th className="px-4 py-3 font-medium">提交时间</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">客观题得分</th>
                  <th className="px-4 py-3 font-medium">人工批改</th>
                  <th className="px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((submission) => (
                  <tr className="border-b last:border-0" key={submission.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium">
                        {submission.student.displayName}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {submission.student.studentNo ?? "无学号"} · 第{" "}
                        {submission.attemptNumber} 次
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {submission.submittedAt?.toLocaleString("zh-CN") ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      {assignmentResultStatusLabels[submission.status]}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {submission.objectiveScore}
                    </td>
                    <td className="px-4 py-4">
                      {submission.requiresManualReview
                        ? "仍有待批改题目"
                        : submission.status === SubmissionStatus.PENDING_REVIEW
                          ? "单题已完成，可结束整份批改"
                          : "已完成"}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        className="font-medium underline"
                        href={`/teacher/assignments/${assignmentId.data}/submissions/${submission.id}`}
                      >
                        {submission.status === SubmissionStatus.PENDING_REVIEW
                          ? "进入批改"
                          : "查看详情"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.pagination.totalPages > 1 ? (
          <nav aria-label="提交分页" className="flex justify-center gap-3">
            {query.data.page > 1 ? (
              <Link
                className="rounded-md border bg-white px-3 py-2 text-sm"
                href={pageHref(
                  assignmentId.data,
                  query.data,
                  query.data.page - 1,
                )}
              >
                上一页
              </Link>
            ) : null}
            <span className="px-2 py-2 text-sm text-gray-500">
              第 {query.data.page} / {result.pagination.totalPages} 页
            </span>
            {query.data.page < result.pagination.totalPages ? (
              <Link
                className="rounded-md border bg-white px-3 py-2 text-sm"
                href={pageHref(
                  assignmentId.data,
                  query.data,
                  query.data.page + 1,
                )}
              >
                下一页
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
