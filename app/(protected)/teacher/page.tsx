import { Role } from "@prisma/client";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherWorkspaceScope } from "@/components/dashboard/teacher-workspace-scope";
import { TeacherWorkspaceCards } from "@/components/dashboard/teacher-workspace-cards";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherDashboard } from "@/services/dashboard/teacher-dashboard";
import { teacherDashboardQuerySchema } from "@/services/dashboard/teacher-dashboard-schemas";

import styles from "@/components/dashboard/teacher-workspace.module.css";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeacherPage({ searchParams }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const query = teacherDashboardQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  let dashboard;
  try {
    dashboard = await getTeacherDashboard(teacher.id, query.data);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  if (query.data.classroomId && dashboard.workspace)
    redirect(`/teacher?courseId=${dashboard.workspace.course.id}`);
  const workspace = dashboard.workspace;
  if (!workspace)
    return (
      <section className="space-y-5">
        <PageHeader
          title="课程工作台"
          description="选择课程，集中处理教学事项与查看班级学情。"
        />
        <EmptyState
          icon={BookOpenCheck}
          title="先建立一门课程"
          description="创建课程班级后，工作台会展示该课程的待办和知识掌握情况。"
          action={
            <Link className="text-sky-700 underline" href="/teacher/courses">
              进入课程管理
            </Link>
          }
        />
      </section>
    );
  const base = `/teacher/courses/${workspace.course.id}`;
  // Keep deadline labels identical during SSR and the client's first render.
  const renderedAt = Date.now();
  return (
    <section className="teacher-dashboard space-y-4">
      <header
        className={`${styles.toolbar} grid items-center gap-4 border p-4 lg:grid-cols-[minmax(0,1fr)_auto]`}
      >
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            课程工作台
          </h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {teacher.displayName}，查看学情与处理当前课程教学事项。
          </p>
        </div>
        <section
          aria-label="课程范围"
          className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,18rem)_auto]"
        >
          <TeacherWorkspaceScope
            courses={dashboard.courses}
            courseId={workspace.course.id}
          />
          <Link
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            href={base}
          >
            课程详情
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      </header>
      <TeacherWorkspaceCards
        key={workspace.course.id}
        renderedAt={renderedAt}
        workspace={workspace}
      />
    </section>
  );
}
