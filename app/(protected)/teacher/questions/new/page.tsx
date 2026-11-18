import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCoverageQuestionContext } from "@/services/courses/content-coverage";
import { graphConceptQuestionsPathSchema } from "@/services/question-graph-bindings/schemas";

import { QuestionForm } from "@/components/questions/question-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listKnowledgePointOptions,
  listTeacherQuestionCategoryOptions,
} from "@/services/questions/service";

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const params = await searchParams;
  const fromCoverage = params.conceptId !== undefined;
  const scope = graphConceptQuestionsPathSchema.safeParse(params);
  if (fromCoverage && !scope.success) notFound();
  const [knowledgePoints, categories, context] = await Promise.all([
    listKnowledgePointOptions(),
    listTeacherQuestionCategoryOptions(teacher.id),
    scope.success
      ? getCoverageQuestionContext(
          teacher.id,
          scope.data.courseId,
          scope.data.conceptId,
        )
      : null,
  ]);
  if (fromCoverage && !context) notFound();
  const coverageCourseId =
    context && scope.success ? scope.data.courseId : undefined;
  return (
    <section className="space-y-6">
      <div>
        <TeacherBackLink
          href={
            coverageCourseId
              ? `/teacher/courses/${coverageCourseId}#course-content-coverage`
              : "/teacher/questions"
          }
        >
          {coverageCourseId ? "返回内容覆盖自检" : "返回题库"}
        </TeacherBackLink>
        <h1 className="mt-2 text-2xl font-semibold">创建题目</h1>
        {context && (
          <p className="mt-2 text-sm text-slate-600">
            {context.courseName} · {context.node.code} {context.node.name}
            。保存后请在课程知识图谱绑定区确认关联。
          </p>
        )}
      </div>
      <QuestionForm
        categories={categories}
        knowledgePoints={knowledgePoints}
        mode="create"
        coverage={
          context && coverageCourseId
            ? {
                courseId: coverageCourseId,
                categoryId: context.categoryId,
                nodeCode: context.node.code,
              }
            : undefined
        }
      />
      {!context && (
        <p className="rounded-lg border p-4 text-sm text-gray-600">
          创建题目后，可在编辑页将它绑定到任一由你管理且已发布正式知识图谱的课程。
        </p>
      )}
    </section>
  );
}
