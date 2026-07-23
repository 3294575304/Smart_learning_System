import {
  GradingStatus,
  QuestionType,
  Role,
  SubmissionStatus,
} from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompleteGradingButton } from "@/components/assignment-results/complete-grading-button";
import { ManualGradeForm } from "@/components/assignment-results/manual-grade-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  assignmentResultStatusLabels,
  gradingStatusLabels,
} from "@/services/assignment-results/service";
import { getTeacherSubmissionForGrading } from "@/services/assignments/manual-grading";
import {
  assignmentIdSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";

interface Props {
  params: Promise<{ assignmentId: string; submissionId: string }>;
}

export default async function SubmissionGradingPage({ params }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const raw = await params;
  const assignmentId = assignmentIdSchema.safeParse(raw.assignmentId);
  const submissionId = submissionIdSchema.safeParse(raw.submissionId);
  if (!assignmentId.success || !submissionId.success) notFound();

  try {
    const submission = await getTeacherSubmissionForGrading(
      teacher.id,
      assignmentId.data,
      submissionId.data,
    );
    const pendingManualCount = submission.answers.filter(
      (answer) =>
        answer.type === QuestionType.SHORT_ANSWER &&
        answer.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED,
    ).length;
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href={`/teacher/assignments/${assignmentId.data}/submissions`}
          >
            返回提交列表
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">提交批改详情</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {submission.assignment.title} · {submission.student.displayName}{" "}
                · 第 {submission.attemptNumber} 次提交
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {submission.student.studentNo ?? "无学号"} ·{" "}
                {submission.student.email}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium">
                {assignmentResultStatusLabels[submission.status]}
              </p>
              <p className="text-muted-foreground mt-1">
                提交时间：
                {submission.submittedAt?.toLocaleString("zh-CN") ?? "—"}
              </p>
            </div>
          </div>
        </header>

        {submission.status === SubmissionStatus.PUBLISHED ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            该提交成绩已经正式发布，当前页面为只读状态。
          </div>
        ) : submission.status === SubmissionStatus.GRADED ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            整份批改已经完成，等待作业级正式发布成绩。
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            仍有 {pendingManualCount}{" "}
            道主观题待评分。全部单题保存后，再完成整份批改。
          </div>
        )}

        <div className="space-y-5">
          {submission.answers.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed bg-white p-10 text-center">
              该提交没有可显示的作答内容。
            </div>
          ) : (
            submission.answers.map((answer) => {
              const isManual = answer.type === QuestionType.SHORT_ANSWER;
              const canEdit =
                isManual &&
                submission.status === SubmissionStatus.PENDING_REVIEW;
              return (
                <article
                  className="rounded-xl border bg-white p-5"
                  key={answer.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold">
                        {answer.sortOrder}. {answer.title}
                      </h2>
                      <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
                        {answer.content}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium">
                        {isManual
                          ? `${answer.manualScore ?? "待批"} / ${answer.maxScore}`
                          : `${answer.automaticScore ?? 0} / ${answer.maxScore}`}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {gradingStatusLabels[answer.gradingStatus]}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-md bg-gray-50 p-3">
                      <dt className="text-muted-foreground">学生答案</dt>
                      <dd className="mt-1 whitespace-pre-wrap">
                        {answer.studentAnswer}
                      </dd>
                    </div>
                    <div className="rounded-md bg-gray-50 p-3">
                      <dt className="text-muted-foreground">
                        正确答案 / 参考答案
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap">
                        {answer.correctAnswer}
                      </dd>
                    </div>
                  </dl>
                  {!isManual ? (
                    <p className="mt-3 text-sm">
                      自动判分：
                      {answer.isCorrect ? "回答正确" : "回答错误"}
                    </p>
                  ) : null}
                  {canEdit ? (
                    <ManualGradeForm
                      answerId={answer.id}
                      assignmentId={assignmentId.data}
                      initialFeedback={answer.teacherFeedback ?? ""}
                      initialScore={answer.manualScore}
                      maxScore={answer.maxScore}
                      submissionId={submissionId.data}
                    />
                  ) : answer.teacherFeedback ? (
                    <p className="mt-4 rounded-md border-l-4 border-gray-300 bg-gray-50 p-3 text-sm">
                      教师反馈：{answer.teacherFeedback}
                    </p>
                  ) : null}
                </article>
              );
            })
          )}
        </div>

        {submission.status === SubmissionStatus.PENDING_REVIEW ? (
          <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
            <div>
              <p className="font-medium">完成整份批改</p>
              <p className="text-muted-foreground mt-1 text-sm">
                系统将重新核验客观题、主观题和总分；未完成评分时会拒绝操作。
              </p>
            </div>
            <CompleteGradingButton
              assignmentId={assignmentId.data}
              submissionId={submissionId.data}
            />
          </footer>
        ) : null}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
