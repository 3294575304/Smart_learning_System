import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseCheckInWorkspace } from "@/components/courses/course-check-in-workspace";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

export default async function CourseCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();

  let course;
  try {
    course = await getTeacherCourse(teacher.id, parsed.data);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  const requestedClassroomId = (await searchParams).classroomId;
  const activeClassrooms = course.linkedClassrooms.filter(
    (item) => item.status === "ACTIVE",
  );
  const classroom = requestedClassroomId
    ? activeClassrooms.find((item) => item.id === requestedClassroomId)
    : activeClassrooms[0];
  if (requestedClassroomId && !classroom) notFound();

  return (
    <section className="space-y-6">
      <PageHeader
        title="课堂签到"
        description={`${course.name}${classroom ? ` · ${classroom.name}` : ""} · 发布签到并查看本次签到。`}
        actions={
          <TeacherBackLink href={`/teacher/courses/${parsed.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      {classroom ? (
        <CourseCheckInWorkspace
          key={classroom.id}
          courseId={parsed.data}
          classroom={{ id: classroom.id, name: classroom.name }}
        />
      ) : (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-600">
          <p>请先创建课程班级，再发布签到。</p>
          <Link
            className="mt-3 inline-block text-sky-700 underline"
            href={`/teacher/courses/${parsed.data}/classrooms`}
          >
            返回课程班级
          </Link>
        </div>
      )}
    </section>
  );
}
