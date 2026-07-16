import Link from "next/link";
import { SubmissionStatus } from "@prisma/client";

import {
  assignmentResultStatusLabels,
  gradingStatusLabels,
} from "@/services/assignment-results/service";
import type { SelectedStudentDetail } from "@/services/assignment-results/types";

interface StudentAnswerDetailProps {
  assignmentId: string;
  page: number;
  pageSize: number;
  detail: SelectedStudentDetail;
}

function formatScore(score: number | null, maxScore: number | null): string {
  if (score === null || maxScore === null) return "待批改";
  return `${score} / ${maxScore}`;
}

function formatAttemptScore(attempt: {
  status: SubmissionStatus;
  score: number | null;
  maxScore: number | null;
}): string {
  if (
    attempt.status !== SubmissionStatus.GRADED &&
    attempt.status !== SubmissionStatus.PUBLISHED
  ) {
    return "待批改";
  }
  return formatScore(attempt.score, attempt.maxScore);
}

function attemptHref(
  assignmentId: string,
  studentId: string,
  submissionId: string,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    studentId,
    submissionId,
  });
  return `/teacher/assignments/${assignmentId}/results?${params.toString()}#student-detail`;
}

export function StudentAnswerDetail({
  assignmentId,
  page,
  pageSize,
  detail,
}: StudentAnswerDetailProps) {
  return (
    <section
      className="bg-card scroll-mt-6 rounded-xl border p-5"
      id="student-detail"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">学生详细作答记录</h2>
          <p className="mt-2 font-medium">{detail.student.displayName}</p>
          <p className="text-muted-foreground text-sm">
            {detail.student.studentNo ?? "无学号"} · {detail.student.email}
          </p>
        </div>
        <Link
          className="text-muted-foreground text-sm underline"
          href={`/teacher/assignments/${assignmentId}/results?page=${page}&pageSize=${pageSize}`}
        >
          关闭详情
        </Link>
      </div>

      {detail.attempts.length === 0 ? (
        <div className="text-muted-foreground mt-5 rounded-lg border border-dashed p-8 text-center text-sm">
          该学生尚未提交作业。
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="提交次数">
            {detail.attempts.map((attempt) => {
              const selected = detail.selectedSubmission?.id === attempt.id;
              return (
                <Link
                  className={
                    selected
                      ? "bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm"
                      : "rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                  }
                  href={attemptHref(
                    assignmentId,
                    detail.student.id,
                    attempt.id,
                    page,
                    pageSize,
                  )}
                  key={attempt.id}
                >
                  第 {attempt.attemptNumber} 次 · {formatAttemptScore(attempt)}
                </Link>
              );
            })}
          </div>

          {detail.selectedSubmission ? (
            <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                状态：
                {assignmentResultStatusLabels[detail.selectedSubmission.status]}
              </span>
              <span>
                提交时间：
                {detail.selectedSubmission.submittedAt?.toLocaleString(
                  "zh-CN",
                ) ?? "—"}
              </span>
              <span>
                成绩：
                {formatAttemptScore(detail.selectedSubmission)}
              </span>
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {detail.answers.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
                暂无可展示的作答内容。
              </div>
            ) : (
              detail.answers.map((answer) => (
                <article className="rounded-lg border p-4" key={answer.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">
                        {answer.sortOrder}. {answer.title}
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                        {answer.content}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium">
                        {formatScore(answer.score, answer.maxScore)}
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
                      <dt className="text-muted-foreground">正确/参考答案</dt>
                      <dd className="mt-1 whitespace-pre-wrap">
                        {answer.correctAnswer}
                      </dd>
                    </div>
                  </dl>
                  <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span>
                      判定：
                      {answer.isCorrect === null
                        ? "待判定"
                        : answer.isCorrect
                          ? "正确"
                          : "错误"}
                    </span>
                    <span>
                      知识点：
                      {answer.knowledgePoints.length > 0
                        ? answer.knowledgePoints.join("、")
                        : "未关联"}
                    </span>
                  </div>
                  {answer.teacherFeedback ? (
                    <p className="mt-3 rounded-md border-l-4 border-gray-300 bg-gray-50 p-3 text-sm">
                      教师反馈：{answer.teacherFeedback}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
