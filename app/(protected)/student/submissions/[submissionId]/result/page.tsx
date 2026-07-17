import { GradingStatus, Role } from "@prisma/client";
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
    const pending = result.answers.some(
      (answer) => answer.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED,
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
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm text-gray-500">当前总分</p>
          <p className="mt-2 text-3xl font-semibold">
            {result.score ?? 0} / {result.maxScore ?? 0}
          </p>
          {pending ? (
            <p className="mt-2 text-sm text-amber-700">
              简答题待人工批改，当前总分为客观题得分。
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              正确率折算：{result.percentage ?? 0}%
            </p>
          )}
        </div>
        <div className="space-y-3">
          {result.answers.map((answer) => (
            <article
              className="flex items-center justify-between rounded-xl border bg-white p-4"
              key={answer.assignmentQuestionId}
            >
              <div>
                <p className="font-medium">
                  {answer.sortOrder}. {answer.title}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {answer.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED
                    ? "待人工批改"
                    : answer.isCorrect
                      ? "回答正确"
                      : "回答错误"}
                </p>
              </div>
              <span className="font-medium">
                {answer.score ?? "待批"} / {answer.maxScore}
              </span>
            </article>
          ))}
        </div>
        <LearningAnalysisCard submissionId={result.id} />
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
