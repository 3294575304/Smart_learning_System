import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuestionForm } from "@/components/questions/question-form";
import { QuestionGraphBindingPanel } from "@/components/questions/question-graph-binding-panel";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { questionIdSchema } from "@/services/questions/schemas";
import {
  getTeacherQuestion,
  listKnowledgePointOptions,
} from "@/services/questions/service";
import { listTeacherBindingCourses } from "@/services/question-graph-bindings/service";

interface EditQuestionPageProps {
  params: Promise<{ questionId: string }>;
}

export default async function EditQuestionPage({
  params,
}: EditQuestionPageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsedId = questionIdSchema.safeParse((await params).questionId);
  if (!parsedId.success) notFound();
  try {
    const [question, knowledgePoints, courses] = await Promise.all([
      getTeacherQuestion(teacher.id, parsedId.data),
      listKnowledgePointOptions(),
      listTeacherBindingCourses(teacher.id),
    ]);
    if (!question.canEdit) notFound();
    return (
      <section className="space-y-6">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href={`/teacher/questions/${question.id}`}
          >
            ← 返回题目详情
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">编辑题目</h1>
          {question.assignmentReferenceCount > 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              该题已有作业引用，本次修改不会影响历史作业快照。
            </p>
          ) : null}
        </div>
        <QuestionForm
          knowledgePoints={knowledgePoints}
          mode="edit"
          question={question}
        />
        <QuestionGraphBindingPanel courses={courses} questionId={question.id} />
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
