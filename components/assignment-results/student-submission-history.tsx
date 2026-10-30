import { studentScoreLabel } from "@/services/recommendations/scoring";
import { FeedbackLink } from "@/components/dashboard/feedback-link";
import { SubmissionStatus } from "@prisma/client";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIndex } from "@/components/dashboard/page-index";
import { studentResultsQuerySchema } from "@/services/assignments/schemas";
import { listStudentResults } from "@/services/dashboard/student-dashboard";
const STATUS_LABELS: Record<SubmissionStatus, string> = {
  IN_PROGRESS: "作答中",
  SUBMITTED: "已提交",
  PENDING_REVIEW: "待教师批改",
  GRADED: "待发布",
  PUBLISHED: "已发布",
  WITHDRAWN: "已撤回",
};

export function StudentSubmissionHistory({
  query,
  results,
  courseId,
  classroomId,
}: {
  query: ReturnType<typeof studentResultsQuerySchema.parse>;
  results: Awaited<ReturnType<typeof listStudentResults>>;
  courseId?: string;
  classroomId?: string;
}) {
  return (
    <section className="space-y-5" aria-label="提交记录与成绩">
      {results.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="text-sm font-medium underline"
              href={`/student/assignments?${new URLSearchParams({ ...(courseId ? { courseId } : {}), ...(classroomId ? { classroomId } : {}) })}`}
            >
              查看待完成作业
            </Link>
          }
          description="完成并提交作业后，成绩记录会出现在这里。"
          icon={BarChart3}
          title="暂无提交记录"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="text-muted-foreground border-b bg-gray-50/70">
              <tr>
                <th className="px-5 py-3 font-medium">作业</th>
                <th className="px-4 py-3 font-medium">提交时间</th>
                <th className="px-4 py-3 font-medium">成绩</th>
                <th className="px-4 py-3 font-medium">得分率</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {results.items.map((result) => (
                <tr className="border-b last:border-0" key={result.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium">{result.assignmentTitle}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {result.classroomName} · 第 {result.attemptNumber} 次提交
                    </p>
                    {result.isHistorical ? (
                      <p className="mt-1 text-xs text-slate-500">
                        历史班级 · 仅查看本人记录
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    {result.submittedAt?.toLocaleString("zh-CN") ?? "—"}
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {result.status !== SubmissionStatus.PUBLISHED
                      ? result.status === SubmissionStatus.GRADED
                        ? "待发布"
                        : "待批改"
                      : studentScoreLabel(result.score, result.maxScore)}
                  </td>
                  <td className="px-4 py-4">
                    {result.percentage === null ? "—" : `${result.percentage}%`}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">
                      {STATUS_LABELS[result.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <FeedbackLink
                      ariaLabel={`查看${result.assignmentTitle}成绩详情`}
                      href={`/student/submissions/${result.id}/result?${new URLSearchParams({ ...(courseId ? { courseId } : {}), ...(classroomId ? { classroomId } : {}), page: String(query.page), pageSize: String(query.pageSize) })}`}
                      label="查看详情"
                      icon="detail"
                      arrow={false}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.pagination.totalPages > 1 ? (
        <PageIndex
          ariaLabel="成绩分页"
          hrefForPage={(page) =>
            `/student/assignments?view=records&page=${page}&pageSize=${query.pageSize}${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ""}${classroomId ? `&classroomId=${encodeURIComponent(classroomId)}` : ""}`
          }
          page={results.pagination.page}
          summary={`第 ${results.pagination.page} / ${results.pagination.totalPages} 页`}
          totalPages={results.pagination.totalPages}
        />
      ) : null}
    </section>
  );
}
