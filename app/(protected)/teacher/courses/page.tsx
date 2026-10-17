import { Role } from "@prisma/client";
import { BookOpenCheck, Plus } from "lucide-react";
import { CourseForm } from "@/components/courses/course-form";
import { TeacherCourseList } from "@/components/courses/teacher-course-list";
import { EmptyState } from "@/components/dashboard/empty-state";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherCourseTemplates,
  listTeacherCourses,
} from "@/services/courses/service";

export default async function TeacherCoursesPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const [courses, templates] = await Promise.all([
    listTeacherCourses(teacher.id),
    listTeacherCourseTemplates(),
  ]);
  const defaultTemplateId =
    templates.find((template) => template.code === "python-programming-v1")
      ?.id ?? templates[0]?.id;
  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">课程管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          管理课程与授课班级，进入课程继续日常教学。
        </p>
      </header>
      <details className="group rounded-xl border bg-white" id="new-course">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
          <span className="font-medium">
            创建课程{" "}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {templates.length} 个可用模板
            </span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-white">
            <Plus
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-45"
            />
            <span className="group-open:hidden">展开</span>
            <span className="hidden group-open:inline">收起</span>
          </span>
        </summary>
        <div className="border-t px-4 py-4 sm:px-5">
          <div className="max-w-3xl">
            {templates.length ? (
              <CourseForm
                defaultTemplateId={defaultTemplateId}
                mode="create"
                templates={templates}
              />
            ) : (
              <EmptyState
                compact
                description="请联系管理员启用课程模板。"
                icon={BookOpenCheck}
                title="暂无可用模板"
              />
            )}
          </div>
          {templates.length > 0 && (
            <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-xs text-sky-700">
                查看模板说明
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {templates.map((template) => (
                  <p
                    key={template.id}
                    className="rounded-lg bg-sky-50 p-3 text-xs leading-5 text-slate-600"
                  >
                    <strong className="text-slate-800">{template.name}</strong>{" "}
                    · 版本 {template.version}
                    <br />
                    {template.description ?? "暂无说明"}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      </details>
      <TeacherCourseList initialCourses={courses} />
    </section>
  );
}
