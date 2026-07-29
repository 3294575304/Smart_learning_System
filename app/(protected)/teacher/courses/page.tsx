import { CourseStatus, Role } from "@prisma/client";
import { BookOpenCheck, Plus, School } from "lucide-react";
import Link from "next/link";

import { CourseForm } from "@/components/courses/course-form";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherCourseTemplates,
  listTeacherCourses,
} from "@/services/courses/service";

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "启用",
  ARCHIVED: "归档",
};

const COURSE_STATUS_STYLES: Record<CourseStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

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
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">我的课程</h2>
            <span className="text-muted-foreground text-sm">
              共 {courses.length} 门
            </span>
          </div>
          {courses.length === 0 ? (
            <EmptyState
              description="先基于课程模板创建一门课程，再把班级关联进来。"
              icon={School}
              title="暂无课程"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {courses.map((course) => (
                <Link
                  className="bg-card rounded-xl border p-5 transition-colors hover:bg-gray-50"
                  href={`/teacher/courses/${course.id}`}
                  key={course.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{course.name}</h3>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {course.description ?? "暂无课程说明"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${COURSE_STATUS_STYLES[course.status]}`}
                    >
                      {COURSE_STATUS_LABELS[course.status]}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground text-xs">课程号</p>
                      <p className="mt-1 font-medium">{course.courseNo}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">学期</p>
                      <p className="mt-1 font-medium">{course.term}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">关联班级</p>
                      <p className="mt-1 font-medium">{course.classroomCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">学生人数</p>
                      <p className="mt-1 font-medium">{course.activeStudentCount}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                      {course.template.name}
                    </span>
                    <span className="text-muted-foreground">
                      {course.activeClassroomCount} 个开课班级
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

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
