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
            className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            href="#new-course"
          >
            <Plus className="h-4 w-4" />
            创建课程
          </Link>
        }
        description="查看课程模板、创建课程并把自己的班级关联到课程下。"
        title="课程管理"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TeacherCourseList initialCourses={courses} />

        <aside className="space-y-4">
          <section className="bg-card rounded-xl border p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">可用课程模板</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  只有启用的模板才能创建课程。
                </p>
              </div>
              <span className="text-muted-foreground text-sm">
                {templates.length} 个
              </span>
            </div>
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
          </section>

          <section id="new-course" className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">创建课程</h2>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              先选模板，再填写课程号、学期和基础名称。
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
