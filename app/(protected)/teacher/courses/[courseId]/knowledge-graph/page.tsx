import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { KnowledgeGraphWorkspace } from "@/components/courses/knowledge-graph-workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { graphConceptQuestionsPathSchema } from "@/services/question-graph-bindings/schemas";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ conceptId?: string | string[] }>;
}) {
  await requirePageRole(Role.TEACHER);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();
  const { conceptId } = await searchParams;
  const point = graphConceptQuestionsPathSchema.safeParse({
    courseId: parsed.data,
    conceptId,
  });
  if (conceptId !== undefined && !point.success) notFound();
  return (
    <section className="space-y-6">
      <PageHeader
        title={point.success ? "知识点关联题目" : "课程知识图谱"}
        description={
          point.success
            ? "查看这个知识点在正式图谱中关联的有效题目。"
            : "基于正式教学大纲生成、审核并显式发布不可变图谱版本。"
        }
        actions={
          <TeacherBackLink
            href={`/teacher/courses/${parsed.data}${point.success ? "/content-coverage" : ""}`}
          >
            {point.success ? "返回内容覆盖自检" : "返回课程"}
          </TeacherBackLink>
        }
      />
      <KnowledgeGraphWorkspace
        courseId={parsed.data}
        conceptId={point.success ? point.data.conceptId : undefined}
      />
    </section>
  );
}
