import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningAnalysisCard } from "@/components/learning-analysis/learning-analysis-card";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentSubmissionResult } from "@/services/assignments/service";

interface Props {
  params: Promise<{ submissionId: string }>;
}
export default async function ResultPage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  try {
    const result = await getStudentSubmissionResult(
      student.id,
      (await params).submissionId,
    );
    return (
      <section className="space-y-6">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href={`/student/assignments/${result.assignmentId}`}
          >
            ← 返回作业详情
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {result.assignmentTitle} · 提交结果
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            第 {result.attemptNumber} 次提交 ·{" "}
            {result.submittedAt?.toLocaleString("zh-CN")}
          </p>
        </div>
        {result.isPublished ? (
          <div className="rounded-xl border bg-white p-6">
            <p className="text-sm text-gray-500">正式成绩</p>
            <p className="mt-2 text-3xl font-semibold">
              {result.score} / {result.maxScore}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              正确率折算：{result.percentage ?? 0}%
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <p className="font-medium text-amber-900">作业已提交成功</p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              教师尚未正式发布成绩。发布前不会展示总分、逐题得分、教师反馈、正确答案或详细解析。
            </p>
          </div>
        )}
        {result.isPublished ? (
          <div className="space-y-4">
            {result.answers.map((answer) => (
              <article
                className="rounded-xl border bg-white p-5"
                key={answer.assignmentQuestionId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {answer.sortOrder}. {answer.title}
                    </p>
                    <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
                      {answer.content}
                    </p>
                  </div>
                  <span className="font-medium">
                    {answer.score ?? 0} / {answer.maxScore}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-md bg-gray-50 p-3">
                    <dt className="text-muted-foreground">你的答案</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {answer.studentAnswer}
                    </dd>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3">
                    <dt className="text-muted-foreground">正确 / 参考答案</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {answer.correctAnswer}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 rounded-md border-l-4 border-blue-300 bg-blue-50 p-3 text-sm">
                  <p className="font-medium">答案解析</p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {answer.explanation}
                  </p>
                </div>
                {answer.teacherFeedback ? (
                  <p className="mt-3 rounded-md border-l-4 border-amber-300 bg-amber-50 p-3 text-sm">
                    教师反馈：{answer.teacherFeedback}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-3 text-xs">
                  判定：
                  {answer.isCorrect ? "正确" : "未得满分"}
                </p>
              </article>
            ))}
          </div>
        ) : null}
        {result.isPublished ? (
          <LearningAnalysisCard submissionId={result.id} />
        ) : null}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
