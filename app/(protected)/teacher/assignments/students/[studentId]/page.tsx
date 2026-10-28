import { Role } from "@prisma/client";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherStudentAssignments } from "@/services/assignments/student-service";
import {
  safeStudentReturn,
  studentFilterLabels,
  teacherStudentDetailQuerySchema,
} from "@/services/assignments/student-query";
import { PageIndex } from "@/components/dashboard/page-index";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";

export default async function StudentAssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const id = z
    .string()
    .cuid()
    .safeParse((await params).studentId);
  const parsed = teacherStudentDetailQuerySchema.safeParse(await searchParams);
  if (!id.success || !parsed.success) notFound();
  const query = parsed.data;
  const returnTo = safeStudentReturn(query.returnTo);
  const data = await getTeacherStudentAssignments(
    teacher.id,
    id.data,
    query,
  ).catch((error: unknown) => {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  });
  const pageHref = (page: number) => {
    const values = new URLSearchParams({
      classroomId: query.classroomId,
      section: query.section,
      submissionFilter: query.submissionFilter,
      assignmentKeyword: query.assignmentKeyword,
      page: String(page),
      pageSize: String(query.pageSize),
      returnTo,
    });
    if (query.courseId) values.set("courseId", query.courseId);
    return `/teacher/assignments/students/${id.data}?${values}`;
  };
  const statuses: Record<string, string> = {
    SUBMITTED: "已提交",
    PENDING_REVIEW: "待批改",
    GRADED: "已批改 · 待发布",
    PUBLISHED: "成绩已发布",
  };
  return (
    <section className="min-w-0 space-y-5">
      <TeacherBackLink href={returnTo}>返回学生查询</TeacherBackLink>
      <header>
        <h1 className="text-2xl font-semibold">{data.name}的作业</h1>
        <p className="mt-2 text-sm text-slate-500">
          学号：{data.studentNo ?? "未设置"} · {data.classroomName} ·{" "}
          {query.section === "ALL"
            ? "全部已开放作业"
            : query.section === "CURRENT"
              ? "当前作业"
              : "历史作业"}
          {!data.active ? " · 历史成员，仅展示已有作答" : ""}
        </p>
      </header>
      <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
        <input type="hidden" name="classroomId" value={query.classroomId} />
        <input type="hidden" name="section" value={query.section} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {query.courseId && (
          <input type="hidden" name="courseId" value={query.courseId} />
        )}
        <label className="min-w-0 space-y-1.5 text-xs font-medium">
          作业名称
          <input
            name="assignmentKeyword"
            defaultValue={query.assignmentKeyword}
            maxLength={120}
            className="h-10 w-full rounded-lg border px-3 text-sm"
            placeholder="搜索该学生的作业"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium">
          提交情况
          <select
            name="submissionFilter"
            defaultValue={query.submissionFilter}
            className="h-10 w-full rounded-lg border px-3 text-sm"
          >
            {Object.entries(studentFilterLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label.replace("存在", "")}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white">
            查询
          </button>
          <a
            className="inline-flex h-10 items-center rounded-lg border px-4 text-sm"
            href={`/teacher/assignments/students/${id.data}?${new URLSearchParams({ classroomId: query.classroomId, section: query.section, returnTo, ...(query.courseId ? { courseId: query.courseId } : {}) })}`}
          >
            重置
          </a>
        </div>
      </form>
      <p className="text-sm text-slate-500">
        共 {data.pagination.total} 份作业。
        {data.active
          ? "入班前已截止的作业也计入应交；待评分不记零。"
          : "历史成员不推测应交、缺交或完成率，不新增批改权限。"}
      </p>
      {!data.items.length ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          当前条件下没有作业，请调整筛选。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                {[
                  "作业名称",
                  "截止时间",
                  "提交情况",
                  "批改与发布",
                  "成绩（百分制）",
                  "操作",
                ].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="max-w-xs px-4 py-4 font-medium break-words">
                    {item.title}
                    {item.makeupLabel ? (
                      <span className="ml-2 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                        {item.makeupLabel}
                      </span>
                    ) : null}
                    {item.historical && (
                      <span className="ml-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                        历史作业
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {item.dueAt?.toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    }) ?? "未设置"}
                  </td>
                  <td className="px-4 py-4">
                    {item.submissionId
                      ? "已提交"
                      : item.overdue
                        ? "逾期未交"
                        : "未交（未截止）"}
                  </td>
                  <td className="px-4 py-4">
                    {item.status ? (statuses[item.status] ?? "待处理") : "—"}
                  </td>
                  <td className="px-4 py-4 tabular-nums">
                    {item.percentage === null
                      ? item.submissionId
                        ? "待评分"
                        : "—"
                      : `${item.percentage.toFixed(2)} / 100`}
                  </td>
                  <td className="px-4 py-4">
                    <a
                      className="text-sky-700 hover:underline"
                      href={`/teacher/assignments/${item.id}/results?${new URLSearchParams({ studentId: id.data, returnTo: pageHref(query.page), ...(item.submissionId ? { submissionId: item.submissionId } : {}) })}`}
                    >
                      {item.submissionId ? "查看作答" : "查看提交情况"}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PageIndex
        nativeNavigation
        ariaLabel="学生作业明细分页"
        page={query.page}
        totalPages={data.pagination.totalPages}
        hrefForPage={pageHref}
      />
    </section>
  );
}
