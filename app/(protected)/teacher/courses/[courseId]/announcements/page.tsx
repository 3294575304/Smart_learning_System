import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { CourseAnnouncementManager } from "@/components/courses/course-announcement-manager";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { listCourseAnnouncements } from "@/services/course-announcements/service";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

export default async function CourseAnnouncementsPage({
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

  const initialResult = classroom
    ? await listCourseAnnouncements(teacher.id, {
        courseId: parsed.data,
        classroomId: classroom.id,
        page: 1,
        pageSize: 20,
      })
    : {
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      };

  return (
    <section className="space-y-6">
      <PageHeader
        title="课程通知"
        description={`${course.name} · 发布通知给本班学生，并查看历史与已读情况。`}
        actions={
          <TeacherBackLink href={`/teacher/courses/${parsed.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      <CourseAnnouncementManager
        classrooms={activeClassrooms.map((item) => ({
          id: item.id,
          name: item.name,
        }))}
        courseId={parsed.data}
        initialClassroomId={classroom?.id ?? ""}
        initialResult={initialResult}
      />
    </section>
  );
}
