import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { CourseGradebooksWorkspace } from "@/components/courses/course-gradebooks-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

export default async function GradebooksPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const id = courseIdSchema.safeParse((await params).courseId);
  if (!id.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title="课程成绩台账"
        description="按教学班查看、维护和发布成绩，下载完整成绩单。"
        actions={
          <TeacherBackLink href={`/teacher/courses/${id.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      <CourseGradebooksWorkspace key={id.data} courseId={id.data} />
    </section>
  );
}
