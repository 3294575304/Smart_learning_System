import { Role, SubmissionStatus } from "@prisma/client";
import { BarChart3, Eye } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIndex } from "@/components/dashboard/page-index";
import { PageHeader } from "@/components/dashboard/page-header";
import { CourseGradeBreakdown } from "@/components/grades/course-grade-breakdown";
import { StudentGradeTabs } from "@/components/grades/student-grade-tabs";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentResultsQuerySchema } from "@/services/assignments/schemas";
import { listStudentResults } from "@/services/dashboard/student-dashboard";
import { listStudentPublishedCourseGradeResults } from "@/services/gradebook/service";

type StudentCourseGradeRows = Awaited<
  ReturnType<typeof listStudentPublishedCourseGradeResults>
>;
type StudentAssignmentResults = Awaited<ReturnType<typeof listStudentResults>>;

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  IN_PROGRESS: "作答中",
  SUBMITTED: "已提交",
  PENDING_REVIEW: "待教师批改",
  GRADED: "待发布",
  PUBLISHED: "已发布",
  WITHDRAWN: "已撤回",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudentResultsPage({ searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const activeView = raw.view === "course" ? "course" : "assignments";
  const courseRows =
    activeView === "course"
      ? await listStudentPublishedCourseGradeResults(student.id)
      : null;
  const parsed = studentResultsQuerySchema.safeParse({
    page: typeof raw.page === "string" ? raw.page : undefined,
    pageSize: typeof raw.pageSize === "string" ? raw.pageSize : undefined,
  });
  const query = parsed.success
    ? parsed.data
    : studentResultsQuerySchema.parse({});
  const results =
    activeView === "assignments"
      ? await listStudentResults(student.id, query)
      : null;

  return (
    <section className="space-y-6">
      <PageHeader
        description={
          activeView === "course"
            ? "查看教师已发布的课程总评、各项占比和当前成绩。"
            : "查看历次作业提交、成绩和正确率，进入详情可查看批改结果与学习分析。"
        }
        title="我的成绩"
      />
      <StudentGradeTabs activeView={activeView} />
      {activeView === "course" && courseRows ? (
        <StudentCourseGrades rows={courseRows} />
      ) : null}
      {activeView === "assignments" && results ? (
        <StudentAssignmentResults query={query} results={results} />
      ) : null}
    </section>
  );
}

const COURSE_STATUS_LABELS: Record<string, string> = {
  SCORED: "数值成绩",
  NOT_ENTERED: "尚未录入",
  ABSENT: "缺考",
  DEFERRED: "缓考",
  LEAVE: "请假",
  EXEMPT: "免修/不参与",
  CHEATING: "作弊",
  OTHER: "其他",
};

function StudentCourseGrades({ rows }: { rows: StudentCourseGradeRows }) {
  return (
    <section className="space-y-5" aria-label="课程总评">
      <h2 className="text-lg font-semibold">课程正式总评</h2>
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <h3 className="font-semibold">暂无已发布课程成绩</h3>
          <p className="mt-2 text-sm text-gray-500">
            教师发布正式课程总评后会显示在这里。
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <article
              className="rounded-xl border bg-white p-5"
              key={row.gradebookId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{row.course.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {row.course.term} · {row.classroom.name} · 方案版本{" "}
                    {row.scheme.versionNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">
                    {row.result.effectiveStatus === "SCORED"
                      ? row.result.effectiveScore?.toFixed(2)
                      : COURSE_STATUS_LABELS[row.result.effectiveStatus]}
                  </p>
                  <p className="text-xs text-gray-500">
                    正式版本 {row.publication.versionNumber}
                  </p>
                </div>
              </div>
              <CourseGradeBreakdown
                components={row.result.componentResultsJson}
                snapshot={row.result.inputSnapshotJson}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StudentAssignmentResults({
  query,
  results,
}: {
  query: ReturnType<typeof studentResultsQuerySchema.parse>;
  results: StudentAssignmentResults;
}) {
  return (
    <section className="space-y-5" aria-label="作业成绩">
      {results.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="text-sm font-medium underline"
              href="/student/assignments"
            >
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
                      ? result.status === SubmissionStatus.GRADED
                        ? "待发布"
                        : "待批改"
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
                    <Link
                      aria-label={`查看${result.assignmentTitle}成绩详情`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none sm:text-sm"
                      href={`/student/submissions/${result.id}/result`}
                      title="查看成绩详情"
                    >
                      <Eye aria-hidden="true" className="size-4" />
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
        <PageIndex
          ariaLabel="成绩分页"
          hrefForPage={(page) =>
            `/student/results?page=${page}&pageSize=${query.pageSize}`
          }
          page={results.pagination.page}
          summary={`第 ${results.pagination.page} / ${results.pagination.totalPages} 页`}
          totalPages={results.pagination.totalPages}
        />
      ) : null}
    </section>
  );
}
