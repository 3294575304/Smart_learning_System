import { getAssignmentPublicationState } from "@/services/assignments/manual-grading";
import { TeacherAssignmentNav } from "@/components/assignments/teacher-assignment-nav";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role, SubmissionStatus } from "@prisma/client";
import { ClipboardCheck, Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageIndex } from "@/components/dashboard/page-index";
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
    const publication = await getAssignmentPublicationState(
      teacher.id,
      assignmentId.data,
    );
    return (
      <section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <TeacherBackLink href="/teacher/assignments">
              返回作业管理
            </TeacherBackLink>
            <h1 className="mt-3 text-2xl font-semibold">批改提交</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {result.assignment.title} · {result.assignment.classroomName} ·
              满分 {result.assignment.totalPoints}
            </p>
          </div>
          {result.totalSubmitted > 0 ? (
            <div className="flex flex-col items-end gap-2">
              <PublishResultsButton
                assignmentId={assignmentId.data}
                publication={publication}
              />
            </div>
          ) : null}
        </header>

        <TeacherAssignmentNav
          assignmentId={assignmentId.data}
          active="submissions"
        />
        {result.totalSubmitted > 0 ? (
          <nav
            aria-label="提交状态筛选"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="mr-1 text-xs text-slate-500">提交状态</span>
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
                      ? "rounded-full bg-sky-600 px-4 py-2 text-sm text-white"
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
        ) : null}

        {result.items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center">
            <h2 className="font-medium text-slate-800">
              {result.totalSubmitted === 0
                ? "学生尚未提交作业"
                : "该状态下暂无提交记录"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {result.totalSubmitted === 0
                ? "这里展示学生提交后的作答与批改记录。作业题目和任务要求可在“作业内容”中查看。"
                : "可切换其他提交状态，或查看全部提交记录。"}
            </p>
            <Link
              className="mt-4 inline-flex rounded-lg border border-sky-200 px-4 py-2 text-sm text-sky-800"
              href={
                result.totalSubmitted === 0
                  ? `/teacher/assignments/${assignmentId.data}`
                  : `/teacher/assignments/${assignmentId.data}/submissions`
              }
            >
              {result.totalSubmitted === 0 ? "查看作业内容" : "查看全部提交"}
            </Link>
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
                        aria-label={`${submission.status === SubmissionStatus.PENDING_REVIEW ? "进入批改" : "查看详情"}：${submission.student.displayName}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none sm:text-sm"
                        href={`/teacher/assignments/${assignmentId.data}/submissions/${submission.id}`}
                        title={
                          submission.status === SubmissionStatus.PENDING_REVIEW
                            ? "进入批改"
                            : "查看提交详情"
                        }
                      >
                        {submission.status ===
                        SubmissionStatus.PENDING_REVIEW ? (
                          <ClipboardCheck
                            aria-hidden="true"
                            className="size-4"
                          />
                        ) : (
                          <Eye aria-hidden="true" className="size-4" />
                        )}
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
          <PageIndex
            ariaLabel="提交分页"
            hrefForPage={(page) =>
              pageHref(assignmentId.data, query.data, page)
            }
            page={result.pagination.page}
            summary={`第 ${result.pagination.page} / ${result.pagination.totalPages} 页`}
            totalPages={result.pagination.totalPages}
          />
        ) : null}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
