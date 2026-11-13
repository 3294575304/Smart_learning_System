"use client";

import { useRef, useState } from "react";
import { AssignmentCategoryBadge } from "@/components/assignments/category-badge";
import { AssignmentStateRefresh } from "@/components/assignments/state-refresh";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { QuestionText } from "@/components/assignments/question-text";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { SubmissionAttachments } from "@/components/assignments/submission-attachments";
import { ManualGradeForm } from "./manual-grade-form";
import { CompleteGradingButton } from "./complete-grading-button";
import { ProgrammingAttemptActions } from "./programming-attempt-actions";
import { hundredPointScore } from "@/services/assignments/presentation";
import { personalWorkHref } from "@/services/assignments/personal-work-navigation";
import {
  answerOutcome,
  outcomeLabels,
} from "@/services/assignments/personal-work-presentation";
import type { TeacherSubmissionDetail } from "@/services/assignments/types";

export interface GradingMutationProps {
  mutationBusy: boolean;
  beginMutation: () => boolean;
  endMutation: () => void;
  onUpdated: (submission: TeacherSubmissionDetail) => void;
}

export function SubmissionGradingWorkspace({
  initialSubmission,
  filter: selectedFilter,
  back,
}: {
  initialSubmission: TeacherSubmissionDetail;
  filter: "ALL" | "WRONG";
  back: { href: string; label: string };
}) {
  const [updated, setUpdated] = useState<TeacherSubmissionDetail | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const inFlight = useRef(false);
  const submission =
    updated && updated.snapshotAt >= initialSubmission.snapshotAt
      ? updated
      : initialSubmission;
  const gradingActions: GradingMutationProps = {
    mutationBusy,
    beginMutation() {
      if (inFlight.current) return false;
      inFlight.current = true;
      setMutationBusy(true);
      return true;
    },
    endMutation() {
      inFlight.current = false;
      setMutationBusy(false);
    },
    onUpdated: setUpdated,
  };
  const questions = submission.questions.map((q) => ({
    ...q,
    outcome: answerOutcome(q.answer),
  }));
  const count = (value: string) =>
    questions.filter((q) => q.outcome === value).length;
  const pending =
    count("PENDING_REVIEW") +
    count("PENDING_JUDGE") +
    count("JUDGE_ERROR") +
    count("MISSING");
  // Keep previously confirmed grades visible even when old per-question records are incomplete.
  const finished = ["GRADED", "PUBLISHED"].includes(submission.status);
  const percentage = finished
    ? hundredPointScore(submission.score, submission.maxScore)
    : null;
  const shown = questions.filter(
    (q) =>
      selectedFilter !== "WRONG" || ["WRONG", "PARTIAL"].includes(q.outcome),
  );
  return (
    <section className="min-w-0 space-y-5">
      <AssignmentStateRefresh
        renderedAt={initialSubmission.snapshotAt}
        judging={count("PENDING_JUDGE") > 0}
      />
      <TeacherBackLink href={back.href}>{back.label}</TeacherBackLink>
      <header className="border-line bg-card min-w-0 rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_11.5rem]">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">
              个人作答详情
            </h1>
            <p className="mt-2 text-sm leading-6 [overflow-wrap:anywhere] text-slate-600">
              {submission.assignment.title}
            </p>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-lg font-semibold text-slate-900">
                {submission.student.displayName}
              </p>
              <span className="text-sm text-slate-500 tabular-nums">
                {submission.student.studentNo ?? "无学号"}
              </span>
              <span className="text-xs text-slate-500">
                {finished ? "已批改" : "评分未完成"} ·{" "}
                {submission.status === "PUBLISHED"
                  ? "成绩已公布"
                  : "成绩未公布"}
              </span>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">教学班</dt>
                <dd className="mt-1 leading-6 [overflow-wrap:anywhere] text-slate-700">
                  {submission.assignment.classroomName}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">
                  提交记录 · 第 {submission.attemptNumber} 次 ·{" "}
                  {submission.isLatestEffective ? "最新有效" : "历史只读"}
                </dt>
                <dd className="mt-1 leading-6 text-slate-700 tabular-nums">
                  {(submission.submittedAt
                    ? new Date(submission.submittedAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })
                    : null) ?? "提交时间未记录"}
                </dd>
              </div>
            </dl>
          </div>
          <aside className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
            <AssignmentCategoryBadge
              category={submission.assignment.category ?? "PRACTICE"}
            />
            <div className="bg-brand-soft min-w-0 rounded-lg border border-sky-100 px-4 py-3 sm:w-full">
              <p className="text-brand-strong text-xs">总成绩 · 百分制</p>
              <p className="text-brand mt-1 text-3xl font-bold tabular-nums">
                {percentage === null
                  ? finished
                    ? "—"
                    : "待评分"
                  : percentage.toFixed(2)}
                {percentage !== null && (
                  <span className="text-ink-muted ms-1 text-sm font-normal">
                    / 100
                  </span>
                )}
              </p>
              <p className="text-ink-soft mt-1 text-xs leading-5">
                {finished && submission.score !== null
                  ? `原始得分 ${submission.score} / ${submission.maxScore}`
                  : `满分 ${submission.maxScore}；未评分不记零`}
              </p>
            </div>
          </aside>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm">
          <span className="inline-flex items-baseline gap-2 text-slate-600">
            答对{" "}
            <strong className="text-lg font-semibold text-emerald-700 tabular-nums">
              {count("CORRECT")}
            </strong>
          </span>
          <span className="inline-flex items-baseline gap-2 text-slate-600">
            答错{" "}
            <strong className="text-lg font-semibold text-rose-700 tabular-nums">
              {count("WRONG")}
            </strong>
          </span>
          {count("PARTIAL") > 0 && (
            <span className="inline-flex items-baseline gap-2 text-slate-600">
              部分得分{" "}
              <strong className="text-lg font-semibold text-orange-700 tabular-nums">
                {count("PARTIAL")}
              </strong>
            </span>
          )}
          {pending > 0 && (
            <span className="inline-flex items-baseline gap-2 text-slate-600">
              待处理{" "}
              <strong className="text-lg font-semibold text-slate-700 tabular-nums">
                {pending}
              </strong>
            </span>
          )}
        </div>
        {pending > 0 && (
          <p className="mt-2 text-xs leading-6 text-slate-500">
            {[
              ["待批改", count("PENDING_REVIEW")],
              ["待判题", count("PENDING_JUDGE")],
              ["判题异常", count("JUDGE_ERROR")],
              ["缺少作答记录", count("MISSING")],
            ]
              .filter(([, total]) => Number(total) > 0)
              .map(([label, total]) => `${label} ${total}`)
              .join(" · ")}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="min-w-0 text-xs leading-6 text-slate-500">
            {submission.gradingBlockedReason ??
              (submission.status === "PUBLISHED"
                ? "成绩已公布，普通评分只读。"
                : submission.status === "GRADED"
                  ? "已完成整份批改，等待公布成绩。"
                  : pending > 0
                    ? "请先处理待批改题目。"
                    : "单题评分已齐，可以完成整份批改。")}
          </p>
          <a
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-sky-200 px-3 text-sm font-medium text-sky-800 transition-colors duration-150 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            href={`/teacher/assignments/${submission.assignment.id}/results`}
          >
            作业成绩与公布
          </a>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-2">
        {submission.attempts.length > 1 && (
          <nav aria-label="提交次数" className="flex flex-wrap gap-2">
            {submission.attempts.map((attempt, i) => (
              <a
                key={attempt.id}
                aria-current={attempt.id === submission.id ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 ${attempt.id === submission.id ? "border-sky-500 bg-sky-50 text-sky-800" : "bg-white"}`}
                href={personalWorkHref(
                  submission.assignment.id,
                  attempt.id,
                  back.href,
                  selectedFilter,
                )}
              >
                第 {attempt.attemptNumber} 次 · {i === 0 ? "最新有效" : "历史"}
              </a>
            ))}
          </nav>
        )}
        <nav
          aria-label="作答题目筛选"
          className="flex flex-wrap items-center gap-2"
        >
          {(
            [
              ["ALL", "全部", questions.length],
              ["WRONG", "失分题", count("WRONG") + count("PARTIAL")],
            ] as const
          ).map(([filter, label, total]) => (
            <a
              key={filter}
              aria-current={selectedFilter === filter ? "page" : undefined}
              className={`inline-flex h-10 items-center rounded-full border px-4 text-sm transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 ${selectedFilter === filter ? "border-sky-500 bg-sky-50 text-sky-800" : "bg-white"}`}
              href={personalWorkHref(
                submission.assignment.id,
                submission.id,
                back.href,
                filter,
              )}
            >
              {label} {total}
            </a>
          ))}
        </nav>
      </div>
      {shown.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
          {questions.length
            ? "当前筛选下没有题目。"
            : "该作业没有可显示的冻结题目。"}
          {questions.length > 0 && (
            <a
              className="ml-2 text-sky-700 underline"
              href={personalWorkHref(
                submission.assignment.id,
                submission.id,
                back.href,
              )}
            >
              查看全部
            </a>
          )}
        </div>
      )}
      <div className="min-w-0 space-y-4">
        {shown.map((q) => {
          const answer = q.answer;
          const manual = q.type === "SHORT_ANSWER";
          const programming = q.type === "PYTHON_PROGRAMMING";
          const canEdit =
            !!answer &&
            submission.canManageGrading &&
            submission.status === "PENDING_REVIEW" &&
            (manual ||
              (programming &&
                answer.programmingAttempt?.status === "SUCCEEDED" &&
                ["MANUAL_REVIEW_REQUIRED", "GRADED"].includes(
                  answer.gradingStatus,
                )));
          const settled = ["CORRECT", "WRONG", "PARTIAL"].includes(q.outcome);
          const color =
            q.outcome === "CORRECT"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : ["WRONG", "PARTIAL"].includes(q.outcome)
                ? "border-orange-200 bg-orange-50 text-orange-900"
                : "border-slate-200 bg-slate-50 text-slate-700";
          const outcomeTone: StatusChipTone =
            q.outcome === "CORRECT"
              ? "ok"
              : q.outcome === "WRONG"
                ? "bad"
                : q.outcome === "PARTIAL"
                  ? "warn"
                  : "neutral";
          return (
            <article
              key={q.id}
              id={`question-${q.id}`}
              className="border-line bg-card min-w-0 scroll-mt-4 rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="bg-brand-soft text-brand mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums"
                  >
                    {q.sortOrder}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-ink text-[15px] font-semibold [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {q.title}
                    </h2>
                    <div className="mt-1.5">
                      <StatusChip tone={outcomeTone}>
                        {outcomeLabels[q.outcome]}
                      </StatusChip>
                    </div>
                  </div>
                </div>
                <p className="text-ink-body shrink-0 text-[13px] font-semibold tabular-nums">
                  {settled ? answer?.finalScore : "—"} / {q.maxScore}
                </p>
              </div>
              <div className="mt-3">
                <QuestionText text={q.content} />
              </div>
              {q.options.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm">
                  {q.options.map((option) => (
                    <li
                      key={option.id}
                      className="rounded-lg bg-slate-50 p-3 [overflow-wrap:anywhere] whitespace-pre-wrap"
                    >
                      {option.label}. {option.content}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
                <div className={`min-w-0 rounded-lg border p-3 ${color}`}>
                  <h3 className="mb-2 text-xs font-medium">学生答案</h3>
                  <QuestionText
                    text={
                      answer?.studentAnswer ??
                      "缺少作答记录，未创建虚构答案或评分。"
                    }
                  />
                </div>
                <div className="min-w-0 rounded-lg border bg-slate-50 p-3">
                  <h3 className="mb-2 text-xs font-medium text-slate-600">
                    参考答案（仅教师可见）
                  </h3>
                  <QuestionText text={q.correctAnswer} />
                </div>
              </div>
              {submission.assignment.allowAttachments && manual && (
                <SubmissionAttachments
                  submissionId={submission.id}
                  questionId={q.id}
                />
              )}
              <div className="mt-3 min-w-0 rounded-lg bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-medium text-slate-600">
                  解析与评分要点
                </h3>
                <QuestionText text={q.explanation || "暂无解析"} />
              </div>
              {programming && answer && (
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  自动用例得分：
                  {answer.automaticScore === null
                    ? "尚未确定"
                    : `${answer.automaticScore} / ${q.maxScore}`}
                  ；最终得分以有效判题及教师复核为准。
                </p>
              )}
              {programming && answer && submission.canManageGrading && (
                <ProgrammingAttemptActions
                  attempt={answer.programmingAttempt}
                />
              )}
              {canEdit && answer ? (
                <ManualGradeForm
                  key={`${answer.id}:${answer.finalScore}:${answer.teacherFeedback}`}
                  answerId={answer.id}
                  assignmentId={submission.assignment.id}
                  submissionId={submission.id}
                  initialFeedback={answer.teacherFeedback ?? ""}
                  initialScore={answer.manualScore}
                  maxScore={q.maxScore}
                  {...gradingActions}
                />
              ) : answer?.teacherFeedback ? (
                <div className="mt-3 border-l-4 border-sky-200 bg-sky-50 p-3">
                  <h3 className="mb-2 text-xs font-medium">教师反馈</h3>
                  <QuestionText text={answer.teacherFeedback} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {submission.status === "PENDING_REVIEW" &&
        submission.canManageGrading && (
          <footer className="border-line bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 shadow-[var(--shadow-card)]">
            <div>
              <p className="font-medium">完成整份批改</p>
              <p className="mt-1 text-sm text-slate-500">
                系统将重新核验所有题目；评分未完成时不能结束批改。
              </p>
            </div>
            <CompleteGradingButton
              assignmentId={submission.assignment.id}
              submissionId={submission.id}
              {...gradingActions}
              blockedReason={
                pending > 0
                  ? "请先处理全部待批改、待判题及异常记录；缺少作答时先核对数据。"
                  : undefined
              }
            />
          </footer>
        )}
    </section>
  );
}
