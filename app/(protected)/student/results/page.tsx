import { Role, SubmissionStatus } from "@prisma/client";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentResultsQuerySchema } from "@/services/assignments/schemas";
import { listStudentResults } from "@/services/dashboard/student-dashboard";

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  IN_PROGRESS: "作答中",
  SUBMITTED: "已提交",
  PENDING_REVIEW: "待教师批改",
  GRADED: "已批改",
  PUBLISHED: "已发布",
  WITHDRAWN: "已撤回",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudentResultsPage({ searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const parsed = studentResultsQuerySchema.safeParse({
    page: typeof raw.page === "string" ? raw.page : undefined,
    pageSize: typeof raw.pageSize === "string" ? raw.pageSize : undefined,
  });
  const query = parsed.success ? parsed.data : studentResultsQuerySchema.parse({});
  const results = await listStudentResults(student.id, query);

  return (
    <section className="space-y-6">
      <PageHeader
        description="查看历次作业提交、成绩和正确率，进入详情可查看批改结果与学情分析。"
        title="我的成绩"
      />
      {results.items.length === 0 ? (
        <EmptyState
          action={
            <Link className="text-sm font-medium underline" href="/student/assignments">
              查看待完成作业
            </Link>
          }
          description="完成并提交作业后，成绩记录会出现在这里。"
          icon={BarChart3}
          title="暂无成绩记录"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="text-muted-foreground border-b bg-gray-50/70">
              <tr>
                <th className="px-5 py-3 font-medium">作业</th>
                <th className="px-4 py-3 font-medium">提交时间</th>
                <th className="px-4 py-3 font-medium">成绩</th>
                <th className="px-4 py-3 font-medium">正确率</th>
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
                  </td>
                  <td className="px-4 py-4">
                    {result.submittedAt?.toLocaleString("zh-CN") ?? "—"}
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {result.score === null || result.maxScore === null
                      ? "待批改"
                      : `${result.score} / ${result.maxScore}`}
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
                    <Link className="font-medium underline" href={`/student/submissions/${result.id}/result`}>
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.pagination.totalPages > 1 ? (
        <nav aria-label="成绩分页" className="flex justify-center gap-3">
          {query.page > 1 ? (
            <Link className="rounded-md border bg-white px-3 py-2 text-sm" href={`/student/results?page=${query.page - 1}&pageSize=${query.pageSize}`}>
              上一页
            </Link>
          ) : null}
          <span className="px-2 py-2 text-sm text-gray-500">
            第 {query.page} / {results.pagination.totalPages} 页
          </span>
          {query.page < results.pagination.totalPages ? (
            <Link className="rounded-md border bg-white px-3 py-2 text-sm" href={`/student/results?page=${query.page + 1}&pageSize=${query.pageSize}`}>
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
