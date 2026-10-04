import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { CourseRosterManager } from "@/components/courses/course-roster-manager";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { courseIdSchema } from "@/services/courses/schemas";
import { listCourseRoster } from "@/services/course-rosters/service";

export default async function CourseStudentsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER),
    id = courseIdSchema.safeParse((await params).courseId);
  if (!id.success) notFound();
  let data;
  try {
    data = await listCourseRoster(teacher.id, id.data, {});
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <PageHeader
        title="学生名单管理"
        description={`${data.course.name} · 查看在读与待认领学生，维护班级名单。`}
        actions={
          <div className="flex gap-2">
            <TeacherBackLink href={`/teacher/courses/${id.data}`}>
              返回课程
            </TeacherBackLink>
            <Link
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
              href={`/teacher/courses/${id.data}/students/import`}
            >
              批量导入名单
            </Link>
          </div>
        }
      />
      <CourseRosterManager
        key={id.data}
        courseId={id.data}
        initialData={data}
      />
    </section>
  );
}
