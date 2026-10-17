import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { AssessmentSchemeWorkspace } from "@/components/courses/assessment-scheme-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

export default async function AssessmentSchemePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title="课程考核方案"
        description="从正式教学大纲提取考核权重、课程目标比例和评分标准，审核后发布不可变版本。"
        actions={
          <TeacherBackLink href={`/teacher/courses/${courseId.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      <AssessmentSchemeWorkspace courseId={courseId.data} />
    </section>
  );
}
