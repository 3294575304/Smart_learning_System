import { CourseStatus, Role } from "@prisma/client";
import { ArrowLeft, School, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseClassroomManager } from "@/components/courses/course-classroom-manager";
import { CourseWorkspaceNavigation } from "@/components/courses/course-workspace-navigation";
import { CourseForm } from "@/components/courses/course-form";
import { CourseStudentRosterImportCard } from "@/components/courses/course-student-roster-import-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

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

export default async function TeacherCourseDetailPage({ params }: PageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { courseId } = await params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    notFound();
  }

  let course;
  try {
    course = await getTeacherCourse(teacher.id, parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/teacher/courses"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            课程列表
          </Link>
        }
        description={`${course.courseNo} · ${course.term}`}
        title={course.name}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          hint="当前课程下所有已关联班级"
          icon={School}
          label="关联班级"
          value={course.linkedClassrooms.length}
        />
        <StatCard
          hint="仍在启用状态的班级数量"
          icon={School}
          label="开课班级"
          value={course.activeClassroomCount}
        />
        <StatCard
          hint="所有关联班级的在读人数"
          icon={Users}
          label="学生人数"
          value={course.activeStudentCount}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <CourseWorkspaceNavigation courseId={course.id} />

          <CourseStudentRosterImportCard
            courseId={course.id}
            linkedClassrooms={course.linkedClassrooms}
          />

          <div className="bg-card rounded-xl border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">课程概览</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  课程号 {course.courseNo} · 学期 {course.term}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${COURSE_STATUS_STYLES[course.status]}`}
              >
                {COURSE_STATUS_LABELS[course.status]}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-xs">模板</p>
                <p className="mt-1 font-medium">
                  {course.template.name}
                  <span className="text-muted-foreground mt-1 block text-xs break-all">
                    {course.template.code}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">版本</p>
                <p className="mt-1 font-medium">{course.template.version}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">创建时间</p>
                <p className="mt-1 font-medium">
                  {course.createdAt.toLocaleString("zh-CN")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">更新时间</p>
                <p className="mt-1 font-medium">
                  {course.updatedAt.toLocaleString("zh-CN")}
                </p>
              </div>
            </div>
          </div>

          <details className="bg-card group rounded-xl border p-5">
            <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
              编辑课程基础信息
            </summary>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              这里只修改课程号、学期、名称和描述，不影响班级关联。
            </p>
            <CourseForm
              courseId={course.id}
              defaultValues={{
                courseNo: course.courseNo,
                term: course.term,
                name: course.name,
                description: course.description ?? "",
              }}
              mode="edit"
              template={course.template}
            />
          </details>
        </section>

        <CourseClassroomManager
          classrooms={course.classrooms}
          courseId={course.id}
          linkedClassrooms={course.linkedClassrooms}
        />
      </div>
    </section>
  );
}
