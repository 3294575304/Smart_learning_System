import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { BatchMappingPanel } from "@/components/question-mapping/batch-mapping-panel";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseQuestionMappingPathSchema } from "@/services/question-mapping/schemas";
import { listUnboundTeacherQuestions } from "@/services/question-mapping/service";

type Props = { params: Promise<{ courseId: string }> };

export default async function QuestionMappingPage({ params }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const path = courseQuestionMappingPathSchema.safeParse(await params);
  if (!path.success) notFound();
  try {
    const result = await listUnboundTeacherQuestions(
      teacher.id,
      path.data.courseId,
    );
    return (
      <section className="space-y-6">
        <header>
          <TeacherBackLink href={`/teacher/courses/${path.data.courseId}`}>
            返回课程
          </TeacherBackLink>
          <h1 className="mt-3 text-2xl font-semibold">
            {result.course.name} · 一键关联绑定题目
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            为未绑定题目匹配课程知识点。逐题选择“仅关联最合适的”或“关联所有匹配项”，预览后由教师确认；已有人工绑定不会被覆盖。
          </p>
        </header>
        <BatchMappingPanel
          courseId={path.data.courseId}
          totalQuestions={result.total}
          questionLimit={result.limit}
          catalog={result.catalog}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
