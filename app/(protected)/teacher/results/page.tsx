import { Role } from "@prisma/client";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  teacherResultsOverviewQuerySchema,
  type TeacherResultsOverviewQuery,
} from "@/services/assignment-results/schemas";
import { listTeacherResultsOverview } from "@/services/assignment-results/service";
import { listTeacherClassrooms } from "@/services/classrooms/service";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pageHref(query: TeacherResultsOverviewQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.classroomId) params.set("classroomId", query.classroomId);
  return `/teacher/results?${params.toString()}`;
}

function valueText(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

export default async function TeacherResultsPage({ searchParams }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const rawQuery = await searchParams;
  const parsed = teacherResultsOverviewQuerySchema.safeParse({
    page: firstValue(rawQuery.page),
    pageSize: firstValue(rawQuery.pageSize),
    classroomId: firstValue(rawQuery.classroomId),
  });
  const query = parsed.success
    ? parsed.data
    : teacherResultsOverviewQuerySchema.parse({});
  const [results, classrooms] = await Promise.all([
    listTeacherResultsOverview(teacher.id, query),
    listTeacherClassrooms(teacher.id),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        description="按作业查看提交进度与成绩概览，并进入详细的题目、知识点和学生统计。"
        title="成绩统计"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="text-xs font-medium">班级</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            defaultValue={query.classroomId ?? ""}
            name="classroomId"
          >
            <option value="">全部班级</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>
        <input name="pageSize" type="hidden" value={query.pageSize} />
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          type="submit"
        >
          筛选
        </button>
        <Link
          className="rounded-md border px-4 py-2 text-sm"
          href="/teacher/results"
        >
          重置
        </Link>
      </form>

      {results.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="text-sm font-medium underline"
              href="/teacher/assignments"
            >
              查看作业管理
            </Link>
          }
          description="发布作业后，这里会显示真实的提交与成绩统计。"
          icon={BarChart3}
          title="暂无可统计作业"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-muted-foreground border-b bg-gray-50/70">
              <tr>
                <th className="px-5 py-3 font-medium">作业</th>
                <th className="px-4 py-3 font-medium">提交进度</th>
                <th className="px-4 py-3 font-medium">平均分</th>
                <th className="px-4 py-3 font-medium">平均正确率</th>
                <th className="px-4 py-3 font-medium">最高 / 最低</th>
                <th className="px-4 py-3 font-medium">待处理</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {results.items.map((item) => (
                <tr className="border-b last:border-0" key={item.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {item.classroom.name}
                      {item.dueAt
                        ? ` · ${item.dueAt.toLocaleDateString("zh-CN")} 截止`
                        : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {item.submittedCount} / {item.studentCount}
                  </td>
                  <td className="px-4 py-4">{valueText(item.averageScore)}</td>
                  <td className="px-4 py-4">
                    {valueText(item.averagePercentage, "%")}
                  </td>
                  <td className="px-4 py-4">
                    {valueText(item.highestScore)} / {valueText(item.lowestScore)}
                  </td>
                  <td className="px-4 py-4">
                    {item.pendingReviewCount > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                        {item.pendingReviewCount} 份
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      className="font-medium underline"
                      href={`/teacher/assignments/${item.id}/results`}
                    >
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
        <nav aria-label="成绩统计分页" className="flex justify-center gap-3">
          {query.page > 1 ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm"
              href={pageHref(query, query.page - 1)}
            >
              上一页
            </Link>
          ) : null}
          <span className="px-2 py-2 text-sm text-gray-500">
            第 {query.page} / {results.pagination.totalPages} 页
          </span>
          {query.page < results.pagination.totalPages ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm"
              href={pageHref(query, query.page + 1)}
            >
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
