import { hundredPointScore } from "@/services/assignments/presentation";
import { StudentRevokedAssignment } from "@/components/assignments/student-revoked-assignment";
import { AssignmentRevokedError } from "@/services/assignments/errors";
import {
  studentTaskHref,
  studentTaskScopeSchema,
} from "@/services/student-experience/task-scope";
import { assertAssignmentTaskScope } from "@/services/student-experience/task-scope-access";
import { QuestionText } from "@/components/assignments/question-text";
import { Paperclip } from "lucide-react";
import { Role } from "@prisma/client";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { LearningAnalysisCard } from "@/components/learning-analysis/learning-analysis-card";
import { ProgrammingAttemptStatus } from "@/components/assignments/programming-attempt-status";
import { StatusChip } from "@/components/ui/status-chip";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentSubmissionResult } from "@/services/assignments/service";
import { ExamScoreReview } from "@/components/exams/exam-score-review";
import { getStudentExamReview } from "@/services/exams/score-reviews";
import { examListReturn } from "@/services/student-experience/activity-query";
import { StudentBackLink } from "@/components/dashboard/student-back-link";

interface Props {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const examReceiptLabels = {
  MANUAL: "主动交卷",
  TIME_UP: "到时自动收卷",
  SWITCH_LIMIT: "切屏超限自动交卷",
} as const;

export default async function ResultPage({ params, searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const query = await searchParams;
  const scope = studentTaskScopeSchema.safeParse(query);
  if (!scope.success) notFound();
  const returnParams = new URLSearchParams({ view: "records", ...scope.data });
  for (const key of ["page", "pageSize"]) {
    const value = query[key];
    if (typeof value === "string" && value.length < 100)
      returnParams.set(key, value);
  }
  try {
    const result = await getStudentSubmissionResult(
      student.id,
      (await params).submissionId,
    );
    await assertAssignmentTaskScope(result.assignmentId, scope.data);
    const canReviewExam = Boolean(result.examReceipt && result.isPublished);
    const examReview = canReviewExam
      ? await getStudentExamReview(student.id, result.id)
      : null;
    const percentage = hundredPointScore(result.score, result.maxScore);
    const feedback = result.answers.filter((answer) => answer.teacherFeedback);
    const examBack = result.examReceipt
      ? examListReturn(query.returnTo, {
          ...scope.data,
          focus: result.assignmentId,
        })
      : null;
    const answers = result.isPublished
      ? result.answers
      : result.submittedAnswers;
    const grades = new Map(
      result.answers.map((answer) => [answer.assignmentQuestionId, answer]),
    );
    return (
      <section className="space-y-6">
        <div>
          {examBack ? (
            <StudentBackLink href={examBack}>返回我的考试</StudentBackLink>
          ) : (
            <Link
              className="inline-flex rounded-lg border bg-white px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
              href={`/student/assignments?${returnParams}`}
            >
              ← 返回作业与成绩
            </Link>
          )}
          <h1 className="mt-2 text-2xl font-semibold break-words">
            {result.assignmentTitle} ·{" "}
            {result.examReceipt ? "交卷回执" : "提交结果"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            第 {result.attemptNumber} 次提交 ·{" "}
            {result.submittedAt?.toLocaleString("zh-CN")}
          </p>
        </div>
        {result.examReceipt && (
          <section
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
            aria-labelledby="exam-receipt"
          >
            <h2 id="exam-receipt" className="font-semibold">
              考试已收卷
            </h2>
            <p className="mt-2 text-sm">
              {result.examReceipt.reason
                ? examReceiptLabels[result.examReceipt.reason]
                : "历史记录未记录交卷方式"}{" "}
              · 已收到 {result.examReceipt.answeredCount} 题作答
            </p>
            <p className="mt-1 text-sm">
              {result.examReceipt.lastSavedAt &&
                `账号最近保存 ${result.examReceipt.lastSavedAt.toLocaleString("zh-CN")} · `}
              收卷以服务端收到的答案为准。
            </p>
          </section>
        )}
        {result.isPublished ? (
          <section
            aria-labelledby="published-score"
            className="border-line bg-card rounded-2xl border shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-col gap-6 p-6 sm:p-7 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    className="text-ink text-lg font-semibold"
                    id="published-score"
                  >
                    正式成绩
                  </h2>
                  <StatusChip tone="ok">成绩已发布</StatusChip>
                </div>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="text-brand text-5xl leading-none font-bold tabular-nums">
                    {percentage === null ? "—" : percentage}
                  </span>
                  <span className="text-ink-muted text-base font-medium">
                    / 100
                  </span>
                </p>
                <p className="text-ink-soft mt-2 text-xs">
                  百分制展示 · 原始得分 {result.score ?? "—"}／
                  {result.maxScore ?? "—"}
                </p>
              </div>
              <dl className="border-line-soft grid grid-cols-3 gap-5 border-t pt-5 sm:gap-7 lg:min-w-[21rem] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
                <div>
                  <dt className="text-ink-muted text-[11px]">题目数</dt>
                  <dd className="text-ink mt-1 text-lg font-semibold tabular-nums">
                    {result.answers.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted text-[11px]">满分题</dt>
                  <dd className="text-ink mt-1 text-lg font-semibold tabular-nums">
                    {
                      result.answers.filter(
                        (answer) => answer.isCorrect === true,
                      ).length
                    }
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted text-[11px]">待批改</dt>
                  <dd className="text-ink mt-1 text-lg font-semibold tabular-nums">
                    {
                      result.answers.filter((answer) => answer.score === null)
                        .length
                    }
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        ) : (
          <div className="bg-warn-soft rounded-xl border border-amber-200 p-6">
            <p className="text-warn font-medium">
              {result.status === "GRADED"
                ? "批改已完成，等待公布成绩"
                : result.examReceipt
                  ? "成绩待公布"
                  : "作业已提交成功"}
            </p>
            <p className="text-ink-body mt-2 text-sm leading-6">
              可以回看本次提交的答案。成绩和反馈将在教师公布后显示。
            </p>
          </div>
        )}
        {result.isPublished && feedback.length > 0 ? (
          <section
            aria-labelledby="teacher-feedback"
            className="border-line bg-card rounded-xl border px-5 py-4 shadow-[var(--shadow-card)]"
          >
            <h2
              className="text-ink text-sm font-semibold"
              id="teacher-feedback"
            >
              教师反馈
            </h2>
            <ul className="text-ink-body mt-3 space-y-3">
              {feedback.map((answer) => (
                <li key={answer.assignmentQuestionId}>
                  {result.answers.length > 1 && (
                    <p className="text-brand-strong mb-1 text-xs font-medium">
                      第 {answer.sortOrder} 题
                    </p>
                  )}
                  <QuestionText text={answer.teacherFeedback ?? ""} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {canReviewExam && (
          <ExamScoreReview submissionId={result.id} initial={examReview} />
        )}
        {result.programmingAttempts.length > 0 ? (
          <div className="space-y-4">
            {result.programmingAttempts.map((attempt) => (
              <ProgrammingAttemptStatus
                assignmentQuestionId={attempt.assignmentQuestionId}
                attemptId={attempt.id}
                displayMaxScore={
                  grades.get(attempt.assignmentQuestionId)?.maxScore
                }
                key={attempt.id}
              />
            ))}
          </div>
        ) : null}
        {answers.length > 0 && (
          <section className="space-y-4" aria-labelledby="submitted-answers">
            <h2 id="submitted-answers" className="font-semibold text-slate-900">
              我的作答
            </h2>
            {answers.map((answer) => {
              const graded = grades.get(answer.assignmentQuestionId);
              const files = result.attachments.filter(
                (file) =>
                  file.assignmentQuestionId === answer.assignmentQuestionId,
              );
              // 每题只给一个结论标记，避免「得分 + 文字 + 颜色」三处重复表达同一件事。
              const scoreChip = graded
                ? graded.score === null
                  ? { tone: "warn" as const, label: "待批改" }
                  : graded.isCorrect === true
                    ? { tone: "ok" as const, label: "满分" }
                    : graded.score === 0
                      ? { tone: "bad" as const, label: "未得分" }
                      : { tone: "warn" as const, label: "部分得分" }
                : null;
              return (
                <article
                  id={
                    result.examReceipt
                      ? `exam-question-${answer.sortOrder}`
                      : undefined
                  }
                  className="border-line bg-card min-w-0 scroll-mt-24 rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-6"
                  key={answer.assignmentQuestionId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-brand-soft text-brand mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums"
                      >
                        {answer.sortOrder}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-ink text-[15px] font-semibold [overflow-wrap:anywhere] break-words">
                          {answers.length === 1 &&
                          answer.title === result.assignmentTitle
                            ? "任务要求"
                            : answer.title}
                        </h3>
                        {scoreChip ? (
                          <div className="mt-1.5">
                            <StatusChip tone={scoreChip.tone}>
                              {scoreChip.label}
                            </StatusChip>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {graded && (
                      <p className="text-ink-body shrink-0 text-[13px] font-semibold tabular-nums">
                        {graded.score === null
                          ? "待批改"
                          : `${graded.score} / ${graded.maxScore}`}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 text-slate-700">
                    <QuestionText text={answer.content} />
                  </div>
                  {answer.images?.map((image) => (
                    <Image
                      alt={`第 ${answer.sortOrder} 题附图`}
                      className="mt-3 max-h-[32rem] max-w-full rounded border object-contain"
                      key={image.id}
                      src={image.url}
                      width={800}
                      height={600}
                      unoptimized
                    />
                  ))}
                  <dl
                    className={`mt-4 grid gap-3 text-sm ${graded ? "md:grid-cols-2" : ""}`}
                  >
                    <div className="min-w-0 rounded-lg border border-sky-100 bg-sky-50/60 p-3">
                      <dt className="text-brand-strong text-[11px] font-medium">
                        你的答案
                      </dt>
                      <dd className="mt-2">
                        <QuestionText text={answer.studentAnswer} />
                      </dd>
                    </div>
                    {graded && (
                      <div className="bg-ok-soft min-w-0 rounded-lg border border-emerald-100 p-3">
                        <dt className="text-ok text-[11px] font-medium">
                          正确 / 参考答案
                        </dt>
                        <dd className="mt-2">
                          <QuestionText text={graded.correctAnswer} />
                        </dd>
                      </div>
                    )}
                  </dl>
                  {files.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium">作业附件</p>
                      <ul className="mt-1 space-y-1">
                        {files.map((file) => (
                          <li key={file.id}>
                            <a
                              className="inline-flex min-h-9 max-w-full items-center gap-2 text-sm [overflow-wrap:anywhere] text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-700"
                              href={`/api/submissions/${result.id}/attachments/${file.id}`}
                            >
                              <Paperclip
                                aria-hidden="true"
                                className="size-4 shrink-0"
                              />
                              <span>
                                {file.originalName}（
                                {Math.ceil(file.sizeBytes / 1024)} KB）
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {graded?.explanation.trim() && (
                    <div className="mt-3 rounded-lg border-l-4 border-sky-200 bg-sky-50/60 p-3">
                      <p className="text-brand-strong mb-2 text-[13px] font-semibold">
                        答案解析
                      </p>
                      <QuestionText text={graded.explanation} />
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
        {result.isPublished ? (
          <LearningAnalysisCard
            knowledgePointLabels={Object.fromEntries(
              result.answers.flatMap((answer) =>
                answer.knowledgePoints.map((knowledgePoint) => [
                  knowledgePoint.id,
                  knowledgePoint.name,
                ]),
              ),
            )}
            submissionId={result.id}
          />
        ) : null}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof AssignmentRevokedError)
      return (
        <StudentRevokedAssignment
          backHref={studentTaskHref("/student/assignments", scope.data)}
        />
      );
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
