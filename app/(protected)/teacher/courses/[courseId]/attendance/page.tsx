import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { AttendanceWorkspace } from "@/components/courses/attendance-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const id = courseIdSchema.safeParse((await params).courseId);
  if (!id.success) notFound();
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    id.data,
    (await searchParams).classroomId,
  );
  const course = await getTeacherCourse(teacher.id, id.data);
  return (
    <section className="space-y-6">
      <PageHeader
        title="出勤台账"
        description="查看历次签到、纠正学生出勤记录，并核对学生出勤汇总。"
        actions={
          <TeacherBackLink href={`/teacher/courses/${id.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      <AttendanceWorkspace
        key={`${id.data}:${classroom?.id ?? "all"}`}
        initialClassroomId={classroom?.id}
        courseId={id.data}
        classrooms={course.linkedClassrooms.map((item) => ({
          id: item.id,
          name: item.name,
        }))}
      />
    </section>
  );
}
