import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuestionGovernanceAction } from "@/components/admin/question-governance-action";
import { adminQuestionIdSchema } from "@/services/admin/questions/schemas";
import { getAdminQuestion } from "@/services/admin/questions/service";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

interface PageProps {
  params: Promise<{ questionId: string }>;
}

export default async function AdminQuestionDetailPage({ params }: PageProps) {
  await requirePageRole(Role.ADMIN);
  const id = adminQuestionIdSchema.safeParse((await params).questionId);
  if (!id.success) notFound();
  let question;
  try {
    question = await getAdminQuestion(id.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm text-gray-500" href="/admin/questions">
            ← 返回公共题库管理
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{question.title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {QUESTION_TYPE_LABELS[question.type]} · 难度 {question.difficulty} ·{" "}
            {question.visibility === "PUBLIC" ? "公共" : "私有"} ·{" "}
            {question.status === "ACTIVE" ? "正常" : "非活动"}
          </p>
        </div>
        <QuestionGovernanceAction question={question} />
      </div>
      <div className="rounded-xl border bg-white p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">创建者</dt>
            <dd className="font-medium">{question.creator.displayName}</dd>
            <dd className="text-gray-500">{question.creator.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">来源</dt>
            <dd className="font-medium">
              {question.source === "ADMIN" ? "管理员来源" : "教师历史来源"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">历史作业引用</dt>
            <dd className="font-medium">
              {question.assignmentReferenceCount} 份
            </dd>
          </div>
        </dl>
      </div>
      <div className="space-y-6 rounded-xl border bg-white p-6">
        <div>
          <h2 className="font-semibold">题干</h2>
          <p className="mt-2 whitespace-pre-wrap">{question.content}</p>
        </div>
        {question.options.length > 0 ? (
          <div>
            <h2 className="font-semibold">选项与答案</h2>
            <div className="mt-2 space-y-2">
              {question.options.map((option) => (
                <p
                  className={
                    option.isCorrect
                      ? "rounded-md border border-green-400 bg-green-50 p-3"
                      : "rounded-md border p-3"
                  }
                  key={option.id}
                >
                  {option.label}. {option.content}
                </p>
              ))}
            </div>
          </div>
        ) : question.correctBoolean !== null ? (
          <p>标准答案：{question.correctBoolean ? "正确" : "错误"}</p>
        ) : question.acceptableAnswers.length > 0 ? (
          <p>可接受答案：{question.acceptableAnswers.join("；")}</p>
        ) : question.referenceAnswer ? (
          <p className="whitespace-pre-wrap">
            参考答案：{question.referenceAnswer}
          </p>
        ) : null}
        <div>
          <h2 className="font-semibold">答案解析</h2>
          <p className="mt-2 whitespace-pre-wrap">{question.explanation}</p>
        </div>
        <div>
          <h2 className="font-semibold">知识点</h2>
          <p className="mt-2">
            {question.knowledgePoints.map((point) => point.name).join("、")}
          </p>
        </div>
      </div>
    </section>
  );
}
