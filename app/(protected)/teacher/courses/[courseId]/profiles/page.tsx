import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentProfilePathSchema } from "@/services/learner-profiles/schemas";
import { listTeacherCourseLearnerProfiles } from "@/services/learner-profiles/service";

const stateLabels: Record<string, string> = {
  NO_EVIDENCE: "无证据",
  INSUFFICIENT_EVIDENCE: "证据不足",
  CONCLUSIVE: "可形成结论",
};

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ classroomId?: string; page?: string }>;
};

export default async function TeacherCourseProfilesPage({
  params,
  searchParams,
}: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const path = studentProfilePathSchema.safeParse(await params);
  if (!path.success) notFound();
  const query = await searchParams;
  try {
    const result = await listTeacherCourseLearnerProfiles(
      teacher.id,
      path.data.courseId,
      {
        classroomId: query.classroomId,
        page: /^\d+$/.test(query.page ?? "") ? Number(query.page) : 1,
      },
    );
    return (
      <section className="space-y-6">
        <header>
          <TeacherBackLink href={`/teacher/courses/${path.data.courseId}`}>
            返回课程
          </TeacherBackLink>
          <h1 className="mt-3 text-2xl font-semibold">
            {result.course.name} · 班级画像概览
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            按班级查看在读学生；知识掌握度是本课程的学习画像，证据不足时明确提示。
          </p>
        </header>
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
          method="get"
        >
          <label className="text-sm">
            班级范围
            <select
              name="classroomId"
              defaultValue={query.classroomId ?? ""}
              className="ml-3 rounded-lg border p-2"
            >
              <option value="">全部班级</option>
              {result.classrooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm text-white">
            查看画像
          </button>
          <span className="text-sm text-slate-500">
            共 {result.pagination.total} 名学生
          </span>
        </form>
        {result.items.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
            当前课程没有在读学生。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {result.items.map((item) => (
              <article
                className="rounded-xl border bg-white p-5"
                key={item.student.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {item.student.displayName}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {item.student.studentNo ?? "无学号"}
                    </p>
                  </div>
                  <span className="rounded-full border px-2.5 py-1 text-xs">
                    {stateLabels[item.evidenceState] ?? item.evidenceState}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6">{item.summary}</p>
                <p className="text-muted-foreground mt-3 text-xs">
                  稳定概念 {item.conclusiveConceptCount} 个 · 平均掌握度{" "}
                  {item.conclusiveAverageMastery ?? "—"}% · 快照 #
                  {item.revisionNumber}
                </p>
                <a
                  className="mt-4 inline-flex rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white"
                  href={`/teacher/courses/${path.data.courseId}/students/${item.student.id}/profile`}
                >
                  查看证据详情
                </a>
              </article>
            ))}
          </div>
        )}
        <nav className="flex items-center justify-between text-sm">
          <span>
            第 {result.pagination.page} / {result.pagination.totalPages} 页
          </span>
          <div className="flex gap-4">
            {result.pagination.page > 1 && (
              <Link
                href={`?page=${result.pagination.page - 1}&classroomId=${query.classroomId ?? ""}`}
              >
                上一页
              </Link>
            )}
            {result.pagination.page < result.pagination.totalPages && (
              <Link
                href={`?page=${result.pagination.page + 1}&classroomId=${query.classroomId ?? ""}`}
              >
                下一页
              </Link>
            )}
          </div>
        </nav>
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
