import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { CourseClassroomManager } from "@/components/courses/course-classroom-manager";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

export default async function TeacherCourseClassroomsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsedId = courseIdSchema.safeParse((await params).courseId);
  if (!parsedId.success) notFound();

  let course;
  try {
    course = await getTeacherCourse(teacher.id, parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="课程班级"
        description={`${course.name} · ${course.courseNo} · ${course.term}。逐个创建班级，按班级分别管理名单和教学记录。`}
        actions={
          <TeacherBackLink href={`/teacher/courses/${course.id}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      <CourseClassroomManager
        courseId={course.id}
        courseName={course.name}
        courseNo={course.courseNo}
        term={course.term}
        courseStatus={course.status}
        linkedClassrooms={course.linkedClassrooms}
      />
    </section>
  );
}
