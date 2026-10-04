import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { QuestionType, Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { QuestionForm } from "@/components/questions/question-form";
import { QuestionGraphBindingPanel } from "@/components/questions/question-graph-binding-panel";
import { ProgrammingConfigPanel } from "@/components/questions/programming-config-panel";
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
          <TeacherBackLink href={`/teacher/questions/${question.id}`}>
            返回题目详情
          </TeacherBackLink>
          <h1 className="mt-2 text-2xl font-semibold">编辑题目</h1>
          {question.assignmentReferenceCount > 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              该题已有作业引用，本次修改不会影响历史作业快照。
            </p>
          ) : null}
        </div>
        {question.type === "PYTHON_PROGRAMMING" ? (
          <p className="rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
            编程题保留自动判题：测试用例分别计分，运行失败可由教师复核部分得分。参考代码、公开样例和隐藏用例保存为版本化配置；评分要点用于复核依据。
          </p>
        ) : null}
        <QuestionForm
          knowledgePoints={knowledgePoints}
          mode="edit"
          question={question}
        />
        {question.type === QuestionType.PYTHON_PROGRAMMING ? (
          <section id="programming-config" className="scroll-mt-24">
            <ProgrammingConfigPanel questionId={question.id} />
          </section>
        ) : null}
        <QuestionGraphBindingPanel courses={courses} questionId={question.id} />
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
