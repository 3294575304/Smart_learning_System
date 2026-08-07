import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceWorkspace } from "@/components/courses/attendance-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";
export default async function AttendancePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const id = courseIdSchema.safeParse((await params).courseId);
  if (!id.success) notFound();
  const course = await getTeacherCourse(teacher.id, id.data);
  return (
    <section className="space-y-6">
      <PageHeader
        title="课堂签到与出勤台账"
        description="服务端判断准时与迟到；结束场次自动结算缺勤，教师纠正保留完整原因和历史。"
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm"
            href={`/teacher/courses/${id.data}`}
          >
            返回课程
          </Link>
        }
      />
      <AttendanceWorkspace
        courseId={id.data}
        classrooms={course.linkedClassrooms.map((item) => ({
          id: item.id,
          name: item.name,
        }))}
      />
    </section>
  );
}
