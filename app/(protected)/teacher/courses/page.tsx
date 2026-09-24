import { Role } from "@prisma/client";
import { BookOpenCheck, Plus } from "lucide-react";
import Link from "next/link";

import { CourseForm } from "@/components/courses/course-form";
import { TeacherCourseList } from "@/components/courses/teacher-course-list";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherCourseTemplates,
  listTeacherCourses,
} from "@/services/courses/service";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeacherCoursesPage({}: PageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const [courses, templates] = await Promise.all([
    listTeacherCourses(teacher.id),
    listTeacherCourseTemplates(),
  ]);
  const defaultTemplateId =
    templates.find((template) => template.code === "python-programming-v1")
      ?.id ?? templates[0]?.id;

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2"
            href="#new-course"
          >
            <Plus className="h-4 w-4" />
            创建课程
          </Link>
        }
        description="管理课程与班级，组织日常教学。"
        title="课程管理"
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <TeacherCourseList initialCourses={courses} />

        <aside className="space-y-4">
          <details className="bg-card rounded-xl border p-5">
            <summary className="cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
              可用课程模板 · {templates.length}
            </summary>
            {templates.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  compact
                  description="管理员需要先启用至少一个课程模板。"
                  icon={BookOpenCheck}
                  title="暂无可用模板"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {templates.map((template) => (
                  <article className="rounded-lg border p-4" key={template.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">
                          {template.name}
                        </h3>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {template.code} · 版本 {template.version}
                        </p>
                      </div>
                      {template.isBuiltin ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                          内置
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                      {template.description ?? "暂无模板说明"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </details>

          <section
            id="new-course"
            className="bg-card scroll-mt-6 rounded-xl border p-5"
          >
            <h2 className="font-semibold">创建课程</h2>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              选择模板，填写课程基本信息。
            </p>
            {templates.length === 0 ? (
              <EmptyState
                compact
                description="当前没有可用模板，无法创建课程。"
                icon={BookOpenCheck}
                title="无法创建课程"
              />
            ) : (
              <CourseForm
                defaultTemplateId={defaultTemplateId}
                mode="create"
                templates={templates}
              />
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
