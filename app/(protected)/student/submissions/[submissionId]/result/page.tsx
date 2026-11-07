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
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentSubmissionResult } from "@/services/assignments/service";

interface Props {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
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
    const percentage = hundredPointScore(result.score, result.maxScore);
    const feedback = result.answers.filter((answer) => answer.teacherFeedback);
    const answers = result.isPublished
      ? result.answers
      : result.submittedAnswers;
    const grades = new Map(
      result.answers.map((answer) => [answer.assignmentQuestionId, answer]),
    );
    return (
      <section className="space-y-6">
        <div>
          <Link
            className="inline-flex rounded-lg border bg-white px-3 py-2 text-sm text-sky-700 hover:bg-sky-50"
            href={`/student/assignments?${returnParams}`}
          >
            ← 返回作业与成绩
          </Link>
          <h1 className="mt-2 text-2xl font-semibold break-words">
            {result.assignmentTitle} · 提交结果
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            第 {result.attemptNumber} 次提交 ·{" "}
            {result.submittedAt?.toLocaleString("zh-CN")}
          </p>
        </div>
        {result.isPublished ? (
          <section
            className="rounded-xl border bg-white p-4 sm:p-6"
            aria-labelledby="published-score"
          >
            <h2
              id="published-score"
              className="text-sm font-medium text-slate-600"
            >
              正式成绩
            </h2>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {percentage === null ? "缺少完整成绩" : `${percentage} 分`}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              百分制 · 原始得分 {result.score ?? "—"}／{result.maxScore ?? "—"}
            </p>
            {feedback.length > 0 && (
              <div className="mt-4 rounded-lg bg-sky-50 p-4">
                <h3 className="text-sm font-semibold text-sky-900">教师反馈</h3>
                <ul className="mt-2 space-y-3 text-slate-800">
                  {feedback.map((answer) => (
                    <li key={answer.assignmentQuestionId}>
                      {result.answers.length > 1 && (
                        <p className="mb-1 text-xs font-medium text-sky-800">
                          第 {answer.sortOrder} 题
                        </p>
                      )}
                      <QuestionText text={answer.teacherFeedback ?? ""} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <p className="font-medium text-amber-900">
              {result.status === "GRADED"
                ? "批改已完成，等待公布成绩"
                : "作业已提交成功"}
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              可以回看本次提交的答案。成绩和反馈将在教师公布后显示。
            </p>
          </div>
        )}
        {result.programmingAttempts.length > 0 ? (
          <div className="space-y-4">
            {result.programmingAttempts.map((attempt) => (
              <ProgrammingAttemptStatus
                assignmentQuestionId={attempt.assignmentQuestionId}
                attemptId={attempt.id}
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
              return (
                <article
                  className="min-w-0 rounded-xl border bg-white p-4 sm:p-5"
                  key={answer.assignmentQuestionId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 font-medium [overflow-wrap:anywhere]">
                      {answers.length === 1 &&
                      answer.title === result.assignmentTitle
                        ? "任务要求"
                        : `${answer.sortOrder}. ${answer.title}`}
                    </h3>
                    {graded && (
                      <div className="text-right text-sm">
                        <p className="font-medium tabular-nums">
                          {graded.score === null
                            ? "待批改"
                            : `${graded.score} / ${graded.maxScore}`}
                        </p>
                        {graded.isCorrect !== null && (
                          <p className="text-xs text-slate-600">
                            {graded.isCorrect ? "满分" : "未得满分"}
                          </p>
                        )}
                      </div>
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
                    <div className="min-w-0 rounded-lg bg-sky-50/70 p-3">
                      <dt className="text-muted-foreground">你的答案</dt>
                      <dd className="mt-2">
                        <QuestionText text={answer.studentAnswer} />
                      </dd>
                    </div>
                    {graded && (
                      <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                        <dt className="text-muted-foreground">
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
                    <div className="mt-3 rounded-lg border-l-4 border-sky-200 bg-sky-50 p-3">
                      <p className="mb-2 text-sm font-medium">答案解析</p>
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
