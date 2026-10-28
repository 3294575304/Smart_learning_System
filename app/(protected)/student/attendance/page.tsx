import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentTaskScope } from "@/components/dashboard/student-task-scope";
import { studentTaskScopeSchema } from "@/services/student-experience/task-scope";
import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentAttendance } from "@/services/attendance/service";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const scopeResult = studentTaskScopeSchema.safeParse(raw);
  if (!scopeResult.success) notFound();
  const { courseId: requestedCourseId, classroomId } = scopeResult.data;
  let data: Awaited<ReturnType<typeof getStudentAttendance>>;
  try {
    data = await getStudentAttendance(
      student.id,
      requestedCourseId,
      classroomId,
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const courseId = data.course?.id;
  const classrooms = (
    await listStudentTaskClassrooms(student.id, courseId)
  ).filter((item) => item.courseName !== null);
  return (
    <section className="space-y-4">
      <PageHeader
        actions={
          <StudentBackLink
            href={
              courseId
                ? `/student/courses/${courseId}/learning-center${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`
                : "/student/tasks"
            }
          >
            {courseId ? "返回我的课程" : "返回学习任务"}
          </StudentBackLink>
        }
        title="签到与出勤"
        description={
          data.course
            ? `查看「${data.course.name}」的课堂签到、教师纠正记录和课程出勤率。`
            : "集中处理各门课程的课堂签到，并查看出勤记录、教师纠正记录和总体出勤率。"
        }
        eyebrow={data.course?.name}
      />
      <StudentTaskScope
        classrooms={classrooms}
        courseId={courseId}
        selectedId={classroomId}
        summary={`共 ${data.records.length} 条出勤记录`}
      />
      <StudentAttendanceView
        key={`${courseId ?? "all"}:${classroomId ?? "all"}`}
        initialRecords={data.records}
        rate={data.summary.rate}
        denominator={data.summary.denominator}
        classroomId={classroomId}
        courseId={courseId}
      />
    </section>
  );
}
