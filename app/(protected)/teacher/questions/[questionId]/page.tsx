import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuestionActions } from "@/components/questions/question-actions";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { questionIdSchema } from "@/services/questions/schemas";
import { getTeacherQuestion } from "@/services/questions/service";

interface QuestionDetailPageProps {
  params: Promise<{ questionId: string }>;
}

export default async function QuestionDetailPage({
  params,
}: QuestionDetailPageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsedId = questionIdSchema.safeParse((await params).questionId);
  if (!parsedId.success) notFound();
  let question;
  try {
    question = await getTeacherQuestion(teacher.id, parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const correctLabels =
    question.answer.kind === "CHOICE"
      ? new Set(question.answer.correctOptionLabels)
      : new Set<string>();
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/teacher/questions"
          >
            ← 返回题库
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{question.title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {QUESTION_TYPE_LABELS[question.type]} · 难度 {question.difficulty} ·{" "}
            {question.visibility === "PUBLIC" ? "公开" : "私有"} · 创建者{" "}
            {question.creator.displayName}
          </p>
        </div>
        <QuestionActions
          canDelete={question.canDelete}
          canEdit={question.canEdit}
          questionId={question.id}
        />
      </div>
      {!question.canEdit ? (
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
          这是公共题目，只能查看或复制，不能直接修改。
        </div>
      ) : null}
      {question.assignmentReferenceCount > 0 ? (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          该题已被 {question.assignmentReferenceCount}{" "}
          份作业引用。编辑不会改变历史作业快照，删除时将进行归档。
        </div>
      ) : null}
      <div className="space-y-6 rounded-xl border bg-white p-6">
        <div>
          <h2 className="font-semibold">题干</h2>
          <p className="mt-2 whitespace-pre-wrap">{question.content}</p>
        </div>
        {question.options.length > 0 ? (
          <div>
            <h2 className="font-semibold">选项</h2>
            <div className="mt-2 space-y-2">
              {question.options.map((option) => (
                <div
                  className={`rounded-md border p-3 ${correctLabels.has(option.label) ? "border-green-500 bg-green-50" : ""}`}
                  key={option.id}
                >
                  <span className="font-medium">{option.label}.</span>{" "}
                  {option.content}
                  {correctLabels.has(option.label) ? (
                    <span className="ml-2 text-xs text-green-700">
                      正确答案
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {question.answer.kind === "BOOLEAN" ? (
          <div>
            <h2 className="font-semibold">标准答案</h2>
            <p className="mt-2">{question.answer.value ? "正确" : "错误"}</p>
          </div>
        ) : null}
        {question.answer.kind === "TEXT" ? (
          <div>
            <h2 className="font-semibold">可接受答案</h2>
            <p className="mt-2">
              {question.answer.acceptableAnswers.join("；")}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {question.answer.caseSensitive ? "区分大小写" : "不区分大小写"}
            </p>
          </div>
        ) : null}
        {question.answer.kind === "REFERENCE" ? (
          <div>
            <h2 className="font-semibold">参考答案</h2>
            <p className="mt-2 whitespace-pre-wrap">{question.answer.value}</p>
          </div>
        ) : null}
        <div>
          <h2 className="font-semibold">答案解析</h2>
          <p className="mt-2 whitespace-pre-wrap">{question.explanation}</p>
        </div>
        <div>
          <h2 className="font-semibold">知识点与标签</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {question.knowledgePoints.map((point) => (
              <span
                className="rounded-full bg-blue-50 px-2 py-1 text-sm text-blue-700"
                key={point.id}
              >
                {point.name}
              </span>
            ))}
            {question.tags.map((tag) => (
              <span
                className="rounded-full bg-gray-100 px-2 py-1 text-sm"
                key={tag}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
