import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentAttendance } from "@/services/attendance/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const rawCourseId = Array.isArray(raw.courseId)
    ? raw.courseId[0]
    : raw.courseId;
  const parsedCourseId =
    rawCourseId !== undefined ? courseIdSchema.safeParse(rawCourseId) : null;
  if (parsedCourseId && !parsedCourseId.success) notFound();
  let data: Awaited<ReturnType<typeof getStudentAttendance>>;
  try {
    data = await getStudentAttendance(
      student.id,
      parsedCourseId?.success ? parsedCourseId.data : undefined,
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const courseId = data.course?.id;
  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            href={
              courseId
                ? `/student/courses/${courseId}/learning-center`
                : "/student/tasks"
            }
          >
            {courseId ? "返回课程学习中心" : "返回学习任务"}
          </Link>
        }
        title="签到与出勤"
        description={
          data.course
            ? `查看「${data.course.name}」的课堂签到、教师纠正记录和课程出勤率。`
            : "集中处理各门课程的课堂签到，并查看出勤记录、教师纠正记录和总体出勤率。"
        }
        eyebrow={data.course?.name}
      />
      <StudentAttendanceView
        initialRecords={data.records}
        rate={data.summary.rate}
        denominator={data.summary.denominator}
        courseId={courseId}
      />
    </section>
  );
}
