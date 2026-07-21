import { AssignmentStatus, Role } from "@prisma/client";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  assignmentListQuerySchema,
  type AssignmentListQuery,
} from "@/services/assignments/schemas";
import { listTeacherAssignments } from "@/services/assignments/service";
import { listTeacherClassrooms } from "@/services/classrooms/service";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
};

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValues(values: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function queryHref(query: AssignmentListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
    sort: query.sort,
  });
  if (query.status) params.set("status", query.status);
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.keyword) params.set("keyword", query.keyword);
  return `/teacher/assignments?${params.toString()}`;
}

function displayStatus(input: {
  status: AssignmentStatus;
  publishedAt: Date | null;
  dueAt: Date | null;
}): string {
  if (input.status !== AssignmentStatus.PUBLISHED) {
    return STATUS_LABELS[input.status];
  }
  const now = new Date();
  if (input.publishedAt && input.publishedAt > now) return "未开始";
  if (input.dueAt && input.dueAt <= now) return "已截止";
  return "进行中";
}

export default async function TeacherAssignmentsPage({ searchParams }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsed = assignmentListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : assignmentListQuerySchema.parse({});
  const [assignments, classrooms] = await Promise.all([
    listTeacherAssignments(teacher.id, query),
    listTeacherClassrooms(teacher.id),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            href="/teacher/assignments/new"
          >
            <Plus className="h-4 w-4" />
            创建作业
          </Link>
        }
        description="筛选、排序和管理作业草稿，发布后可进入成绩统计。"
        title="作业管理"
      />

      <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium">搜索</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            defaultValue={query.keyword}
            maxLength={120}
            name="keyword"
            placeholder="搜索作业名称"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium">状态</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            defaultValue={query.status ?? ""}
            name="status"
          >
            <option value="">全部状态</option>
            {Object.values(AssignmentStatus).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
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
        <label className="space-y-1">
          <span className="text-xs font-medium">排序</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            defaultValue={query.sort}
            name="sort"
          >
            <option value="CREATED_DESC">最新创建</option>
            <option value="PUBLISHED_DESC">最新发布</option>
            <option value="DUE_ASC">截止时间升序</option>
            <option value="DUE_DESC">截止时间降序</option>
          </select>
        </label>
        <input name="pageSize" type="hidden" value={query.pageSize} />
        <div className="flex items-end gap-2 xl:col-start-5">
          <button
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            type="submit"
          >
            应用筛选
          </button>
          <Link
            className="rounded-md border px-4 py-2 text-sm"
            href="/teacher/assignments"
          >
            重置
          </Link>
        </div>
      </form>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {assignments.pagination.total} 份作业</span>
        <span>
          第 {assignments.pagination.page} /{" "}
          {Math.max(assignments.pagination.totalPages, 1)} 页
        </span>
      </div>

      {assignments.items.length === 0 ? (
        <EmptyState
          action={
            assignments.pagination.total === 0 &&
            !query.keyword &&
            !query.status &&
            !query.classroomId ? (
              <Link
                className="text-sm font-medium underline"
                href="/teacher/assignments/new"
              >
                创建第一份作业
              </Link>
            ) : (
              <Link
                className="text-sm font-medium underline"
                href="/teacher/assignments"
              >
                清除筛选
              </Link>
            )
          }
          description="当前条件下没有可显示的作业。"
          icon={ClipboardList}
          title="暂无作业"
        />
      ) : (
        <div className="space-y-3">
          {assignments.items.map((assignment) => (
            <article
              className="rounded-xl border bg-white p-5"
              key={assignment.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{assignment.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {assignment.classroom.name} · {assignment.questions.length}{" "}
                    题 · {assignment.totalPoints} 分
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    发布：
                    {assignment.publishedAt
                      ? assignment.publishedAt.toLocaleString("zh-CN")
                      : "未设置"}
                    <span className="mx-2">·</span>
                    截止：
                    {assignment.dueAt
                      ? assignment.dueAt.toLocaleString("zh-CN")
                      : "未设置"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLES[assignment.status]}`}
                  >
                    {displayStatus(assignment)}
                  </span>
                  {assignment.status === AssignmentStatus.DRAFT ? (
                    <Link
                      className="text-sm font-medium underline"
                      href={`/teacher/assignments/${assignment.id}/edit`}
                    >
                      编辑
                    </Link>
                  ) : (
                    <Link
                      className="text-sm font-medium underline"
                      href={`/teacher/assignments/${assignment.id}/results`}
                    >
                      成绩统计
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {assignments.pagination.totalPages > 1 ? (
        <nav
          aria-label="作业分页"
          className="flex items-center justify-center gap-3"
        >
          {query.page > 1 ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm"
              href={queryHref(query, query.page - 1)}
            >
              上一页
            </Link>
          ) : (
            <span className="rounded-md border px-3 py-2 text-sm opacity-40">
              上一页
            </span>
          )}
          {query.page < assignments.pagination.totalPages ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm"
              href={queryHref(query, query.page + 1)}
            >
              下一页
            </Link>
          ) : (
            <span className="rounded-md border px-3 py-2 text-sm opacity-40">
              下一页
            </span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
