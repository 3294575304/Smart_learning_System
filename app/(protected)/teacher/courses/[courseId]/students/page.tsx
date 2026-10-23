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
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
import { withClassroomQuery } from "@/lib/course-classroom";

export default async function CourseStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER),
    id = courseIdSchema.safeParse((await params).courseId);
  if (!id.success) notFound();
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    id.data,
    (await searchParams).classroomId,
  );
  let data;
  try {
    data = await listCourseRoster(teacher.id, id.data, {
      classroomId: classroom?.id,
    });
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
              href={withClassroomQuery(
                `/teacher/courses/${id.data}/students/import`,
                classroom?.id,
              )}
            >
              批量导入名单
            </Link>
          </div>
        }
      />
      <CourseRosterManager
        key={`${id.data}:${classroom?.id ?? "all"}`}
        courseId={id.data}
        initialClassroomId={classroom?.id}
        initialData={data}
      />
    </section>
  );
}
