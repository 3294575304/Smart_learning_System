import { DraftManagementMenu } from "@/components/assignments/draft-management-menu";
import { assignmentDraftAction } from "@/services/assignments/draft-action";
import { AssignmentCategoryBadge } from "@/components/assignments/category-badge";
import { ASSIGNMENT_CATEGORY_LABELS } from "@/services/assignments/category";
import { AssignmentManagementTabs } from "@/components/assignments/management-tabs";
import { AssignmentCourseFilter } from "@/components/assignments/student-filters";
import { TeacherStudentAssignmentsView } from "@/components/assignments/student-query-view";
import {
  studentListHref,
  teacherStudentQuerySchema,
} from "@/services/assignments/student-query";
import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import { AssignmentStatus, Role } from "@prisma/client";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ResourceNotFoundError } from "@/services/auth/policy";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIndex } from "@/components/dashboard/page-index";
import { PageHeader } from "@/components/dashboard/page-header";
import { AutoSubmitSelect } from "@/components/filters/auto-submit-select";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  assignmentListQuerySchema,
  type AssignmentListQuery,
} from "@/services/assignments/schemas";
import { listTeacherAssignments } from "@/services/assignments/service";
import { listTeacherClassrooms } from "@/services/classrooms/service";
import { listTeacherCourses } from "@/services/courses/service";
import {
  ASSIGNMENT_FILTER_LABELS,
  assignmentDisplayStatus,
  assignmentStatusOptions,
  type AssignmentFilterStatus,
} from "@/services/assignments/presentation";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
  REVOKED: "已撤销",
};

const STATUS_STYLES: Record<AssignmentFilterStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
  REVOKED: "bg-rose-50 text-rose-800",
  UPCOMING: "bg-sky-50 text-sky-700",
  IN_PROGRESS: "bg-emerald-50 text-emerald-700",
  EXPIRED: "bg-amber-50 text-amber-700",
};

const actionLinkClassName =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-200 bg-white px-2.5 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:text-sm";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function queryHref(query: AssignmentListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
    sort: query.sort,
    section: query.section,
  });
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.courseId) params.set("courseId", query.courseId);
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
  return ASSIGNMENT_FILTER_LABELS[assignmentDisplayStatus(input)];
}

export default async function TeacherAssignmentsPage({ searchParams }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const rawQuery = await searchParams;
  if (
    rawQuery.view !== undefined &&
    rawQuery.view !== "ASSIGNMENTS" &&
    rawQuery.view !== "STUDENTS"
  )
    notFound();
  if (rawQuery.view === "STUDENTS") {
    const studentQuery = teacherStudentQuerySchema.safeParse(rawQuery);
    if (!studentQuery.success) notFound();
    if (
      studentQuery.data.section !== "ALL" ||
      studentQuery.data.submissionFilter !== "ALL"
    ) {
      redirect(studentListHref(studentQuery.data));
    }
    return (
      <TeacherStudentAssignmentsView
        teacherId={teacher.id}
        query={studentQuery.data}
        notice={rawQuery.scopeChanged === "1"}
      />
    );
  }
  const parsed = assignmentListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) notFound();
  const query = parsed.data;
  const [assignments, allClassrooms, courses] = await Promise.all([
    listTeacherAssignments(teacher.id, query).catch((error: unknown) => {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }),
    listTeacherClassrooms(teacher.id, true),
    listTeacherCourses(teacher.id),
  ]);
  const lastPage = Math.max(1, assignments.pagination.totalPages);
  if (query.page > lastPage) redirect(queryHref(query, lastPage));
  const availableClassroomIds = new Set(assignments.availableClassroomIds);
  const sectionClassrooms = allClassrooms.filter((item) =>
    availableClassroomIds.has(item.id),
  );
  const classrooms = query.courseId
    ? sectionClassrooms.filter(
        (classroom) => classroom.course?.id === query.courseId,
      )
    : sectionClassrooms;

  return (
    <section className="min-w-0 space-y-4">
      <PageHeader
        actions={
          <Link
            className="flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800"
            href="/teacher/assignments/new"
          >
            <Plus className="h-4 w-4" />
            创建作业
          </Link>
        }
        description="当前作业用于日常教学；班级结课或关闭后，作业自动转入历史，仍可批改和发布成绩。"
        title="作业管理"
      />

      <AssignmentCourseFilter
        key={JSON.stringify(query)}
        courses={courses}
        classrooms={allClassrooms.map((item) => ({
          id: item.id,
          courseId: item.course?.id ?? null,
        }))}
        courseId={query.courseId}
        classroomId={query.classroomId}
        section={query.section}
        category={query.category}
        notice={rawQuery.scopeChanged === "1"}
      />
      <AssignmentManagementTabs
        view="ASSIGNMENTS"
        section={query.section}
        category={query.category}
        courseId={query.courseId}
        classroomId={query.classroomId}
      />
      {query.section === "HISTORY" ? (
        <p className="text-sm text-slate-500">
          历史作业仅用于归档查看，可继续批改和发布成绩；学生不能继续作答。已撤销的作业会直接删除，不会出现在这里。
        </p>
      ) : null}
      <form
        key={JSON.stringify([
          query.section,
          query.category,
          query.keyword,
          query.status,
          query.classroomId,
          query.sort,
          query.courseId,
        ])}
        aria-label="作业列表筛选"
        className="grid grid-cols-2 gap-3 rounded-xl border bg-white p-4 xl:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_minmax(0,1fr)_8rem_auto] xl:items-end"
      >
        <label className="col-span-2 flex min-w-0 flex-col gap-1.5 xl:col-span-1">
          <span className="text-xs font-medium">搜索</span>
          <input
            className="h-10 w-full min-w-0 rounded-lg border px-3 text-sm"
            defaultValue={query.keyword}
            maxLength={120}
            name="keyword"
            placeholder="搜索作业名称"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium">作业类别</span>
          <AutoSubmitSelect
            className="h-10 w-full min-w-0 rounded-lg border px-3 text-sm"
            name="category"
            defaultValue={query.category ?? ""}
          >
            <option value="">全部类别</option>
            {Object.entries(ASSIGNMENT_CATEGORY_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </AutoSubmitSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium">状态</span>
          <AutoSubmitSelect
            className="h-10 w-full min-w-0 rounded-lg border px-3 text-sm"
            defaultValue={query.status ?? ""}
            name="status"
          >
            <option value="">全部状态</option>
            {(query.section === "HISTORY"
              ? ([
                  "DRAFT",
                  "PUBLISHED",
                  ...assignments.availableHistoryStatuses,
                ] as AssignmentFilterStatus[])
              : assignmentStatusOptions(
                  assignments.availableHistoryStatuses,
                  query.status,
                )
            ).map((status) => (
              <option key={status} value={status}>
                {ASSIGNMENT_FILTER_LABELS[status]}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium">班级</span>
          <AutoSubmitSelect
            className="h-10 w-full min-w-0 rounded-lg border px-3 text-sm"
            defaultValue={query.classroomId ?? ""}
            name="classroomId"
          >
            <option value="">全部班级</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
                {classroom.status !== "ACTIVE"
                  ? ` · ${CLASSROOM_STATUS_LABELS[classroom.status]}`
                  : ""}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium">排序</span>
          <AutoSubmitSelect
            className="h-10 w-full min-w-0 rounded-lg border px-3 text-sm"
            defaultValue={query.sort}
            name="sort"
          >
            <option value="CREATED_DESC">最新创建</option>
            <option value="PUBLISHED_DESC">最新发布</option>
            <option value="DUE_ASC">截止时间升序</option>
            <option value="DUE_DESC">截止时间降序</option>
          </AutoSubmitSelect>
        </label>
        <input name="section" type="hidden" value={query.section} />
        <input name="pageSize" type="hidden" value={query.pageSize} />
        {query.courseId ? (
          <input name="courseId" type="hidden" value={query.courseId} />
        ) : null}
        <div className="col-span-2 flex items-end gap-2 xl:col-span-1">
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800"
            type="submit"
          >
            搜索
          </button>
          <a
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-sky-200 bg-white px-4 text-sm font-medium text-sky-700 transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none xl:w-auto"
            href={queryHref(
              {
                ...query,
                status: undefined,
                category: undefined,
                classroomId: undefined,
                keyword: undefined,
                sort: "CREATED_DESC",
              },
              1,
            )}
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            重置
          </a>
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
            query.keyword ||
            query.status ||
            query.classroomId ||
            query.category ? (
              <a
                className="text-sm font-medium underline"
                href={queryHref(
                  {
                    ...query,
                    keyword: undefined,
                    category: undefined,
                    status: undefined,
                    classroomId: undefined,
                  },
                  1,
                )}
              >
                清除筛选
              </a>
            ) : query.section === "HISTORY" ? (
              <a
                className="text-sm font-medium underline"
                href={queryHref({ ...query, section: "CURRENT" }, 1)}
              >
                查看当前作业
              </a>
            ) : (
              <Link
                className="text-sm font-medium underline"
                href="/teacher/assignments/new"
              >
                创建第一份作业
              </Link>
            )
          }
          description={
            query.section === "HISTORY" &&
            !query.keyword &&
            !query.status &&
            !query.classroomId &&
            !query.category
              ? "班级结课或关闭后，相关作业会自动显示在这里。"
              : "当前条件下没有可显示的作业。"
          }
          icon={ClipboardList}
          title={query.section === "HISTORY" ? "暂无历史作业" : "暂无作业"}
        />
      ) : (
        <div className="space-y-3">
          {assignments.items.map((assignment) => {
            const batchSize = assignment.batchId
              ? assignments.items.filter(
                  (item) => item.batchId === assignment.batchId,
                ).length
              : 0;
            const draftAction =
              assignmentDraftAction(assignment) ??
              (assignment.revocableSubmissionCount !== undefined
                ? "REVOKE"
                : assignment.status === "REVOKED" &&
                    assignment.classroom.status === "ACTIVE"
                  ? "COPY_REVOKED"
                  : null);
            return (
              <article
                className="rounded-xl border bg-white p-5"
                key={assignment.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <h2 className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
                      <Link
                        className="max-w-full min-w-0 [overflow-wrap:anywhere] text-slate-900 hover:text-sky-700 hover:underline"
                        href={`/teacher/assignments/${assignment.id}`}
                      >
                        {assignment.title}
                      </Link>
                      <AssignmentCategoryBadge
                        category={assignment.category ?? "PRACTICE"}
                      />
                      {batchSize > 1 ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200 ring-inset">
                          同批 {batchSize} 个班级
                        </span>
                      ) : null}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {assignment.classroom.name}
                      {assignment.classroom.status !== "ACTIVE"
                        ? `（${CLASSROOM_STATUS_LABELS[assignment.classroom.status]}）`
                        : ""}{" "}
                      · {assignment.questions.length} 题 ·{" "}
                      {assignment.totalPoints} 分
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
                  <div className="ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLES[assignmentDisplayStatus(assignment)]}`}
                    >
                      {query.section === "HISTORY"
                        ? STATUS_LABELS[assignment.status]
                        : displayStatus(assignment)}
                    </span>
                    <Link
                      className={actionLinkClassName}
                      href={`/teacher/assignments/${assignment.id}`}
                      aria-label={`查看作业：${assignment.title}`}
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      详情
                    </Link>
                    {assignment.status === AssignmentStatus.DRAFT &&
                    assignment.classroom.status === "ACTIVE" ? (
                      <Link
                        aria-label={
                          batchSize > 1
                            ? `编辑作业（同时作用于 ${batchSize} 个班级）`
                            : "编辑作业"
                        }
                        className={actionLinkClassName}
                        href={`/teacher/assignments/${assignment.id}/edit`}
                        title={
                          batchSize > 1
                            ? `一次编辑 ${batchSize} 个班级的草稿`
                            : "编辑作业"
                        }
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        <span>编辑</span>
                      </Link>
                    ) : assignment.status !== AssignmentStatus.DRAFT ? (
                      <>
                        <Link
                          aria-label={
                            assignment.status === "REVOKED"
                              ? "查看提交"
                              : "批改提交"
                          }
                          className={actionLinkClassName}
                          href={`/teacher/assignments/${assignment.id}/submissions`}
                          title="批改提交"
                        >
                          <ClipboardCheck
                            aria-hidden="true"
                            className="size-4"
                          />
                          <span>
                            {assignment.status === "REVOKED"
                              ? "提交记录"
                              : "批改"}
                          </span>
                        </Link>
                        <Link
                          aria-label="成绩统计"
                          className={actionLinkClassName}
                          href={`/teacher/assignments/${assignment.id}/results`}
                          title="成绩统计"
                        >
                          <BarChart3 aria-hidden="true" className="size-4" />
                          <span>成绩</span>
                        </Link>
                      </>
                    ) : null}
                    {draftAction && (
                      <DraftManagementMenu
                        id={assignment.id}
                        title={assignment.title}
                        classroom={assignment.classroom.name}
                        action={draftAction}
                        submissionCount={assignment.revocableSubmissionCount}
                        updatedAt={assignment.updatedAt.toISOString()}
                      />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {assignments.pagination.totalPages > 1 ? (
        <PageIndex
          ariaLabel="作业分页"
          hrefForPage={(page) => queryHref(query, page)}
          page={assignments.pagination.page}
          totalPages={assignments.pagination.totalPages}
        />
      ) : null}
    </section>
  );
}
