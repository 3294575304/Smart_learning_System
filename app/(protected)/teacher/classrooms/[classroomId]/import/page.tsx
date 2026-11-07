import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { CourseRosterImportWizard } from "@/components/courses/course-roster-import-wizard";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { classroomIdSchema } from "@/services/classrooms/schemas";
import { getTeacherClassroom } from "@/services/classrooms/service";
import { getTeacherCourse } from "@/services/courses/service";

export default async function ClassroomRosterImportPage({
  params,
}: {
  params: Promise<{ classroomId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const id = classroomIdSchema.safeParse((await params).classroomId);
  if (!id.success) notFound();
  try {
    const classroom = await getTeacherClassroom(teacher.id, id.data, 1);
    if (classroom.status !== "ACTIVE" || !classroom.course) notFound();
    const course = await getTeacherCourse(teacher.id, classroom.course.id);
    if (course.status === "ARCHIVED") notFound();
    const linkedClassrooms = course.linkedClassrooms.filter(
      (item) => item.id === classroom.id,
    );
    if (!linkedClassrooms.length) notFound();
    return (
      <section className="space-y-6">
        <TeacherBackLink
          href={`/teacher/classrooms/${classroom.id}#classroom-roster`}
        >
          返回班级名单
        </TeacherBackLink>
        <PageHeader
          title="学生名单导入"
          description={`${classroom.name} · ${course.name} · 本次导入固定到当前班级。`}
        />
        <CourseRosterImportWizard
          courseId={course.id}
          courseName={course.name}
          courseNo={course.courseNo}
          term={course.term}
          linkedClassrooms={linkedClassrooms}
          lockedClassroomId={classroom.id}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
