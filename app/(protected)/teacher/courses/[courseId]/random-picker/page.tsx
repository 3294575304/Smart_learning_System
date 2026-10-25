import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { RandomStudentPicker } from "@/components/courses/random-student-picker";
import { PageHeader } from "@/components/dashboard/page-header";
import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withClassroomQuery } from "@/lib/course-classroom";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";
import { listTeacherClassroomRandomCandidates } from "@/services/courses/random-picker";

export default async function RandomPickerPage({
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

  let students: Awaited<
    ReturnType<typeof listTeacherClassroomRandomCandidates>
  > = [];
  if (classroom) {
    try {
      students = await listTeacherClassroomRandomCandidates(
        teacher.id,
        parsed.data,
        classroom.id,
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="随机选人"
        description={`${course.name}${classroom ? ` · ${classroom.name}` : ""} · 从当前班级的在读学生中抽取。`}
        actions={
          <TeacherBackLink href={`/teacher/courses/${parsed.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      {!classroom ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-600">
          <p>暂无关联的启用班级。</p>
          <Link
            className="mt-3 inline-block text-sky-700 underline"
            href={`/teacher/courses/${parsed.data}/classrooms`}
          >
            返回课程班级
          </Link>
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-600">
          <p>当前班级暂无可抽取的在读学生。</p>
          <Link
            className="mt-3 inline-block text-sky-700 underline"
            href={withClassroomQuery(
              `/teacher/courses/${parsed.data}/students`,
              classroom.id,
            )}
          >
            查看学生名单
          </Link>
        </div>
      ) : (
        <RandomStudentPicker key={classroom.id} students={students} />
      )}
    </section>
  );
}
