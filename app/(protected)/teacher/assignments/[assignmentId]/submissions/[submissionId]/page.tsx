import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { SubmissionAttachments } from "@/components/assignments/submission-attachments";
import {
  GradingStatus,
  QuestionType,
  Role,
  SubmissionStatus,
} from "@prisma/client";
import { notFound } from "next/navigation";

import { CompleteGradingButton } from "@/components/assignment-results/complete-grading-button";
import { ManualGradeForm } from "@/components/assignment-results/manual-grade-form";
import { ProgrammingAttemptActions } from "@/components/assignment-results/programming-attempt-actions";
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
        (answer.type === QuestionType.SHORT_ANSWER ||
          answer.type === QuestionType.PYTHON_PROGRAMMING) &&
        answer.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED,
    ).length;
    const pendingProgrammingCount = submission.answers.filter(
      (answer) =>
        answer.type === QuestionType.PYTHON_PROGRAMMING &&
        answer.programmingAttempt?.status !== "SUCCEEDED",
    ).length;
    return (
      <section className="space-y-6">
        <header>
          <TeacherBackLink
            href={`/teacher/assignments/${assignmentId.data}/submissions`}
          >
            返回提交列表
          </TeacherBackLink>
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

        {submission.gradingBlockedReason ? (
          <p
            role="status"
            className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-600"
          >
            {submission.gradingBlockedReason}
          </p>
        ) : submission.status === SubmissionStatus.PUBLISHED ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            该提交成绩已公布，普通评分只读；编程题重判或撤销须填写原因并保留审计。
          </div>
        ) : submission.status === SubmissionStatus.GRADED ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            整份批改已经完成，等待作业级正式发布成绩。
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            仍有 {pendingManualCount} 道题待人工评分或复核、
            {pendingProgrammingCount}{" "}
            道编程题待完成判题。全部单题完成后，再完成整份批改。
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
              const isProgramming =
                answer.type === QuestionType.PYTHON_PROGRAMMING;
              const canEdit =
                (isManual ||
                  (isProgramming &&
                    answer.programmingAttempt?.status === "SUCCEEDED" &&
                    (answer.gradingStatus ===
                      GradingStatus.MANUAL_REVIEW_REQUIRED ||
                      answer.gradingStatus === GradingStatus.GRADED))) &&
                submission.status === SubmissionStatus.PENDING_REVIEW &&
                submission.canManageGrading;
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
                          : isProgramming &&
                              answer.gradingStatus ===
                                GradingStatus.MANUAL_REVIEW_REQUIRED
                            ? `待复核 / ${answer.maxScore}`
                            : isProgramming && answer.manualScore !== null
                              ? `${answer.manualScore} / ${answer.maxScore}`
                              : isProgramming && answer.automaticScore === null
                                ? `判题中 / ${answer.maxScore}`
                                : `${answer.automaticScore ?? 0} / ${answer.maxScore}`}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {gradingStatusLabels[answer.gradingStatus]}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-md bg-sky-50/70 p-3">
                      <dt className="text-muted-foreground">学生答案</dt>
                      <dd className="mt-1 whitespace-pre-wrap">
                        {answer.studentAnswer}
                      </dd>
                    </div>
                    {answer.type === "SHORT_ANSWER" && (
                      <SubmissionAttachments
                        submissionId={submission.id}
                        questionId={answer.assignmentQuestionId}
                      />
                    )}
                    <div className="rounded-md bg-sky-50/70 p-3">
                      <dt className="text-muted-foreground">
                        正确答案 / 参考答案
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap">
                        {answer.correctAnswer}
                      </dd>
                    </div>
                  </dl>
                  {!isManual && !isProgramming ? (
                    <p className="mt-3 text-sm">
                      自动判分：
                      {answer.isCorrect ? "回答正确" : "回答错误"}
                    </p>
                  ) : null}
                  {isProgramming &&
                  answer.gradingStatus ===
                    GradingStatus.MANUAL_REVIEW_REQUIRED ? (
                    <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                      运行错误待复核：自动用例得分 {answer.automaticScore ?? 0}{" "}
                      / {answer.maxScore}，尚未定分。
                      请结合下方评分要点与学生代码酌情给分，并填写具体依据。空白或无关代码不应获得过程分。
                    </p>
                  ) : null}
                  {isProgramming && answer.manualScore !== null ? (
                    <p className="mt-3 text-sm">
                      自动用例得分：{answer.automaticScore}；教师复核最终得分：
                      {answer.manualScore}
                    </p>
                  ) : null}
                  {isProgramming && submission.canManageGrading ? (
                    <ProgrammingAttemptActions
                      attempt={answer.programmingAttempt}
                    />
                  ) : null}
                  {canEdit ? (
                    <ManualGradeForm
                      answerId={answer.id}
                      assignmentId={assignmentId.data}
                      initialFeedback={answer.teacherFeedback ?? ""}
                      initialScore={
                        answer.manualScore ??
                        (isProgramming ? answer.automaticScore : null)
                      }
                      maxScore={answer.maxScore}
                      submissionId={submissionId.data}
                    />
                  ) : answer.teacherFeedback ? (
                    <p className="mt-4 rounded-md border-l-4 border-sky-200 bg-sky-50/70 p-3 text-sm">
                      教师反馈：{answer.teacherFeedback}
                    </p>
                  ) : null}
                </article>
              );
            })
          )}
        </div>

        {submission.status === SubmissionStatus.PENDING_REVIEW &&
        submission.canManageGrading ? (
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
