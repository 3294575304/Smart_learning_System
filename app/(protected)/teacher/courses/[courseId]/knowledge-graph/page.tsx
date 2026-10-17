import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { KnowledgeGraphWorkspace } from "@/components/courses/knowledge-graph-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requirePageRole(Role.TEACHER);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title="Python 课程知识图谱"
        description="基于正式教学大纲生成、审核并显式发布不可变图谱版本。"
        actions={
          <TeacherBackLink href={`/teacher/courses/${parsed.data}`}>
            返回课程
          </TeacherBackLink>
        }
      />
      <KnowledgeGraphWorkspace courseId={parsed.data} />
    </section>
  );
}
