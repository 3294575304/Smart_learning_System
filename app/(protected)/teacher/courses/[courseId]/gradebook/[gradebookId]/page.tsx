import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { GradebookWorkspace } from "@/components/courses/gradebook-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { gradebookIdSchema } from "@/services/gradebook/schemas";
import { getTeacherCourseClassroomForPage } from "@/services/courses/page-context";
import { withClassroomQuery } from "@/lib/course-classroom";

export default async function GradebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; gradebookId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const values = await params;
  const courseId = courseIdSchema.safeParse(values.courseId);
  const gradebookId = gradebookIdSchema.safeParse(values.gradebookId);
  if (!courseId.success || !gradebookId.success) notFound();
  const classroom = await getTeacherCourseClassroomForPage(
    teacher.id,
    courseId.data,
    (await searchParams).classroomId,
  );
  return (
    <section className="space-y-6">
      <PageHeader
        title="班级成绩台账"
        description="查看班级成绩，按考核项目录入、核对并发布。"
        actions={
          <TeacherBackLink
            href={withClassroomQuery(
              `/teacher/courses/${courseId.data}/gradebook`,
              classroom?.id,
            )}
          >
            返回台账列表
          </TeacherBackLink>
        }
      />
      <GradebookWorkspace
        key={gradebookId.data}
        gradebookId={gradebookId.data}
        courseId={courseId.data}
      />
    </section>
  );
}
