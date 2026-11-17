"use client";

import { PanelRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { AssignmentCategoryBadge } from "@/components/assignments/category-badge";
import { AssignmentStateRefresh } from "@/components/assignments/state-refresh";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { QuestionText } from "@/components/assignments/question-text";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { SubmissionAttachments } from "@/components/assignments/submission-attachments";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { ManualGradeForm } from "./manual-grade-form";
import { CompleteGradingButton } from "./complete-grading-button";
import { ProgrammingAttemptActions } from "./programming-attempt-actions";
import { PythonCodeEditor } from "@/components/programming/code-editor";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import { hundredPointScore } from "@/services/assignments/presentation";
import { personalWorkHref } from "@/services/assignments/personal-work-navigation";
import { teacherAssessmentHref } from "@/services/exams/classroom-navigation";
import {
  answerOutcome,
  outcomeLabels,
} from "@/services/assignments/personal-work-presentation";
import type { TeacherSubmissionDetail } from "@/services/assignments/types";
import type { ProgrammingPaperScoreSuggestion } from "@/services/programming-scoring/schemas";

export interface GradingMutationProps {
  mutationBusy: boolean;
  beginMutation: () => boolean;
  endMutation: () => void;
  onUpdated: (submission: TeacherSubmissionDetail) => void;
}

interface BulkScoreSelection {
  revision: number;
  method: "TEST_CASES" | "SMART_AI";
  status: "pending" | "ready" | "clear";
  score: number | null;
  note: string | null;
  suggestion?: ProgrammingPaperScoreSuggestion;
}

export function SubmissionGradingWorkspace({
  initialSubmission,
  filter: selectedFilter,
  back,
  examId,
}: {
  initialSubmission: TeacherSubmissionDetail;
  filter: "ALL" | "WRONG" | "CORRECT" | "INCORRECT" | "PENDING";
  back: { href: string; label: string };
  examId?: string | null;
}) {
  const questionNavigatorId = useId();
  const questionNavigatorButton = useRef<HTMLButtonElement>(null);
  const selectedQuestionId = useRef<string | null>(null);
  const [activeFilter, setActiveFilter] = useState(selectedFilter);
  const [updated, setUpdated] = useState<TeacherSubmissionDetail | null>(null);
  const [questionNavigatorOpen, setQuestionNavigatorOpen] = useState(
    selectedFilter !== "ALL",
  );
  const [mutationBusy, setMutationBusy] = useState(false);
  const [bulkScoreBusy, setBulkScoreBusy] = useState(false);
  const [bulkScoreProgress, setBulkScoreProgress] = useState<string | null>(
    null,
  );
  const [bulkScoreMessage, setBulkScoreMessage] = useState<string | null>(null);
  const [bulkScoreSelections, setBulkScoreSelections] = useState<
    Record<string, BulkScoreSelection>
  >({});
  const inFlight = useRef(false);
  const bulkScoreInFlight = useRef(false);
  const bulkScoreRevision = useRef(0);
  useEffect(() => {
    setActiveFilter(selectedFilter);
    setQuestionNavigatorOpen(selectedFilter !== "ALL");
  }, [selectedFilter]);
  const submission =
    updated && updated.snapshotAt >= initialSubmission.snapshotAt
      ? updated
      : initialSubmission;
  const gradingActions: GradingMutationProps = {
    mutationBusy: mutationBusy || bulkScoreBusy,
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
  const bulkScoreQuestions = questions.flatMap((question) => {
    const answer = question.answer;
    if (
      question.type !== "PYTHON_PROGRAMMING" ||
      !answer ||
      !submission.canManageGrading ||
      submission.status !== "PENDING_REVIEW" ||
      answer.programmingAttempt?.status !== "SUCCEEDED" ||
      !["MANUAL_REVIEW_REQUIRED", "GRADED"].includes(answer.gradingStatus)
    )
      return [];
    return [{ question, answer }];
  });

  function rememberBulkSelection(
    answerId: string,
    selection: BulkScoreSelection,
  ) {
    setBulkScoreSelections((current) => ({
      ...current,
      [answerId]: selection,
    }));
  }

  function selectAllTestCaseScores() {
    if (bulkScoreInFlight.current) return;
    const revision = ++bulkScoreRevision.current;
    let selectedCount = 0;
    for (const { answer, question } of bulkScoreQuestions) {
      const score = answer.automaticScore;
      const available = score !== null;
      if (available) selectedCount++;
      rememberBulkSelection(answer.id, {
        revision,
        method: "TEST_CASES",
        status: available ? "ready" : "clear",
        score,
        note: available
          ? `评分依据：教师选择采用测试用例成绩 ${score.toFixed(2)} / ${question.maxScore.toFixed(2)}。`
          : null,
      });
    }
    const skippedCount = bulkScoreQuestions.length - selectedCount;
    setBulkScoreMessage(
      `已为 ${selectedCount} 道编程题填入测试用例成绩${skippedCount ? `；${skippedCount} 道没有可用的正式判题成绩` : ""}。请逐题检查并保存。`,
    );
  }

  async function selectAllSmartAIScores() {
    if (bulkScoreInFlight.current || bulkScoreQuestions.length === 0) return;
    bulkScoreInFlight.current = true;
    setBulkScoreBusy(true);
    setBulkScoreMessage(null);
    const revision = ++bulkScoreRevision.current;
    const total = bulkScoreQuestions.length;
    let completed = 0;
    let selectedCount = 0;
    let failedCount = 0;
    for (const { answer } of bulkScoreQuestions) {
      rememberBulkSelection(answer.id, {
        revision,
        method: "SMART_AI",
        status: "pending",
        score: null,
        note: null,
      });
    }
    setBulkScoreProgress(`智能 AI 判题计算中 ${completed} / ${total}`);
    try {
      for (let start = 0; start < total; start += 3) {
        const batch = bulkScoreQuestions.slice(start, start + 3);
        const results = await Promise.all(
          batch.map(async ({ answer, question }) => ({
            answerId: answer.id,
            response:
              await requestAssignmentApi<ProgrammingPaperScoreSuggestion>(
                `/api/teacher/assignments/${submission.assignment.id}/submissions/${submission.id}/answers/${answer.id}/programming-score`,
                { method: "POST" },
              ),
            maxScore: question.maxScore,
          })),
        );
        for (const { answerId, maxScore, response } of results) {
          completed++;
          if (!response.success) {
            failedCount++;
            rememberBulkSelection(answerId, {
              revision,
              method: "SMART_AI",
              status: "clear",
              score: null,
              note: null,
            });
            continue;
          }
          const suggestion = response.data;
          selectedCount++;
          rememberBulkSelection(answerId, {
            revision,
            method: "SMART_AI",
            status: "ready",
            score: suggestion.score,
            note: `评分依据：教师选择采用智能 AI 判题参考分 ${suggestion.score.toFixed(2)} / ${maxScore.toFixed(2)}。`,
            suggestion,
          });
        }
        setBulkScoreProgress(`智能 AI 判题计算中 ${completed} / ${total}`);
      }
      setBulkScoreMessage(
        `智能 AI 判题完成：已填入 ${selectedCount} 道${failedCount ? `，${failedCount} 道计算失败` : ""}。请检查后逐题保存。`,
      );
    } catch {
      setBulkScoreMessage(
        `智能 AI 判题中断：已填入 ${selectedCount} 道，请检查结果后重试剩余题目。`,
      );
    } finally {
      bulkScoreInFlight.current = false;
      setBulkScoreBusy(false);
      setBulkScoreProgress(null);
    }
  }

  function clearBulkScoreSelection(answerId: string) {
    setBulkScoreSelections((current) => {
      if (!(answerId in current)) return current;
      const next = { ...current };
      delete next[answerId];
      return next;
    });
  }

  function selectFilter(filter: typeof selectedFilter) {
    setActiveFilter(filter);
    const href = personalWorkHref(
      submission.assignment.id,
      submission.id,
      back.href,
      filter,
      examId,
    );
    const target = new URL(href, window.location.origin);
    window.history.replaceState(
      window.history.state,
      "",
      `${target.pathname}${target.search}${target.hash}`,
    );
  }

  function handleFilterClick(
    event: MouseEvent<HTMLAnchorElement>,
    filter: typeof selectedFilter,
  ) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    selectFilter(filter);
  }
  // Keep previously confirmed grades visible even when old per-question records are incomplete.
  const finished = ["GRADED", "PUBLISHED"].includes(submission.status);
  const draft = submission.status === "IN_PROGRESS";
  const percentage = finished
    ? hundredPointScore(submission.score, submission.maxScore)
    : null;
  const shown = questions.filter((q) => {
    if (activeFilter === "WRONG" || activeFilter === "INCORRECT")
      return ["WRONG", "PARTIAL"].includes(q.outcome);
    if (activeFilter === "CORRECT") return q.outcome === "CORRECT";
    if (activeFilter === "PENDING")
      return [
        "PENDING_REVIEW",
        "PENDING_JUDGE",
        "JUDGE_ERROR",
        "MISSING",
      ].includes(q.outcome);
    return true;
  });
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
              {examId ? "个人答卷详情" : "个人作答详情"}
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
                {draft ? "未提交草稿" : finished ? "已批改" : "评分未完成"} ·{" "}
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
                  {draft ? "保存的作答" : "提交记录"} · 第{" "}
                  {submission.attemptNumber} 次 ·{" "}
                  {draft
                    ? "只读查看"
                    : submission.isLatestEffective
                      ? "最新有效"
                      : "历史只读"}
                </dt>
                <dd className="mt-1 leading-6 text-slate-700 tabular-nums">
                  {(submission.submittedAt
                    ? new Date(submission.submittedAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })
                    : null) ?? (draft ? "尚未提交" : "提交时间未记录")}
                </dd>
              </div>
            </dl>
          </div>
          <aside className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
            {!examId && (
              <AssignmentCategoryBadge
                category={submission.assignment.category ?? "PRACTICE"}
              />
            )}
            <div className="bg-brand-soft min-w-0 rounded-lg border border-sky-100 px-4 py-3 sm:w-full">
              <p className="text-brand-strong text-xs">总成绩 · 百分制</p>
              <p className="text-brand mt-1 text-3xl font-bold tabular-nums">
                {percentage === null
                  ? finished
                    ? "—"
                    : draft
                      ? "未提交"
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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              className="inline-flex min-h-10 items-center rounded-lg border border-sky-200 px-3 text-sm font-medium text-sky-800 transition-colors duration-150 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
              href={`${teacherAssessmentHref(submission.assignment.id, examId)}/results`}
            >
              {examId ? "考试成绩与公布" : "作业成绩与公布"}
            </a>
          </div>
        </div>
        {bulkScoreQuestions.length > 0 ? (
          <section className="mt-3">
            <h3 className="text-sm font-semibold text-slate-800">
              批量选择编程题判题方式
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="min-h-9 rounded-md border border-sky-300 bg-white px-3 text-xs font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                disabled={
                  bulkScoreBusy ||
                  !bulkScoreQuestions.some(
                    ({ answer: item }) => item.automaticScore !== null,
                  )
                }
                onClick={selectAllTestCaseScores}
                type="button"
              >
                全部采用测试用例成绩
              </button>
              <button
                className="min-h-9 rounded-md border border-violet-300 bg-white px-3 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                disabled={bulkScoreBusy || bulkScoreQuestions.length === 0}
                onClick={() => void selectAllSmartAIScores()}
                type="button"
              >
                全部采用智能 AI 判题
              </button>
            </div>
            {bulkScoreProgress ? (
              <p className="mt-2 text-xs text-violet-800" role="status">
                {bulkScoreProgress}
              </p>
            ) : null}
            {bulkScoreMessage ? (
              <p className="mt-2 text-xs text-slate-600" role="status">
                {bulkScoreMessage}
              </p>
            ) : null}
          </section>
        ) : null}
      </header>
      {questions.length > 0 ? (
        <button
          ref={questionNavigatorButton}
          type="button"
          aria-controls={questionNavigatorId}
          aria-haspopup="dialog"
          aria-expanded={questionNavigatorOpen}
          onClick={() => setQuestionNavigatorOpen(true)}
          className="fixed top-[38%] right-0 z-40 inline-flex w-9 -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-sky-200 bg-white py-3 text-xs font-medium text-sky-800 shadow-sm transition-colors duration-150 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
        >
          <PanelRight className="size-4" aria-hidden="true" />
          <span className="leading-5 tracking-widest [writing-mode:vertical-rl]">
            题号导航
          </span>
        </button>
      ) : null}
      {submission.attempts.length > 1 && (
        <nav
          aria-label="提交次数"
          className="flex flex-wrap gap-2 rounded-xl border bg-white p-2"
        >
          {submission.attempts.map((attempt, i) => (
            <a
              key={attempt.id}
              aria-current={attempt.id === submission.id ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 ${attempt.id === submission.id ? "border-sky-500 bg-sky-50 text-sky-800" : "bg-white"}`}
              href={personalWorkHref(
                submission.assignment.id,
                attempt.id,
                back.href,
                activeFilter,
                examId,
              )}
            >
              第 {attempt.attemptNumber} 次 · {i === 0 ? "最新有效" : "历史"}
            </a>
          ))}
        </nav>
      )}
      <div className="min-w-0">
        <div className="min-w-0 space-y-4">
          {shown.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
              {questions.length
                ? "当前筛选下没有题目。"
                : examId
                  ? "该试卷没有可显示的冻结题目。"
                  : "该作业没有可显示的冻结题目。"}
              {questions.length > 0 && (
                <button
                  className="ml-2 text-sky-700 underline"
                  onClick={() => selectFilter("ALL")}
                  type="button"
                >
                  查看全部
                </button>
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
              const settled = ["CORRECT", "WRONG", "PARTIAL"].includes(
                q.outcome,
              );
              const color =
                q.outcome === "CORRECT"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : ["WRONG", "PARTIAL"].includes(q.outcome)
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-slate-200 bg-slate-50 text-slate-700";
              const outcomeTone: StatusChipTone =
                q.outcome === "CORRECT"
                  ? "ok"
                  : ["WRONG", "PARTIAL"].includes(q.outcome)
                    ? "bad"
                    : "neutral";
              return (
                <article
                  key={q.id}
                  id={`question-${q.id}`}
                  tabIndex={-1}
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
                      {programming &&
                      answer &&
                      answer.studentAnswer !== "未作答" ? (
                        <PythonCodeEditor
                          label={`第 ${q.sortOrder} 题学生编程答案`}
                          value={answer.studentAnswer}
                          onChange={() => {}}
                          disabled
                          variant="light"
                          showToolbar={false}
                          muteWhenDisabled={false}
                        />
                      ) : (
                        <QuestionText
                          text={
                            answer?.studentAnswer ??
                            "缺少作答记录，未创建虚构答案或评分。"
                          }
                        />
                      )}
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
                  {programming &&
                    answer &&
                    !canEdit &&
                    submission.canManageGrading && (
                      <ProgrammingAttemptActions
                        attempt={answer.programmingAttempt}
                        busy={mutationBusy || bulkScoreBusy}
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
                      isProgramming={programming}
                      automaticScore={answer.automaticScore}
                      programmingAttempt={answer.programmingAttempt}
                      bulkScoreSelection={bulkScoreSelections[answer.id]}
                      onBulkScoreSelectionCleared={clearBulkScoreSelection}
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
        </div>
        <EditorDialog
          open={questionNavigatorOpen}
          title="题号与筛选"
          placement="right"
          dialogId={questionNavigatorId}
          showCloseButton
          onClose={() => setQuestionNavigatorOpen(false)}
          onAfterClose={() => {
            const questionId = selectedQuestionId.current;
            selectedQuestionId.current = null;
            if (!questionId) {
              questionNavigatorButton.current?.focus({ preventScroll: true });
              return;
            }
            const target = document.getElementById(`question-${questionId}`);
            if (!target) {
              questionNavigatorButton.current?.focus({ preventScroll: true });
              return;
            }
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}#question-${questionId}`,
            );
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            target.focus({ preventScroll: true });
          }}
        >
          <section className="mt-4 space-y-5">
            <div>
              <p className="text-xs font-medium text-slate-500">筛选题目</p>
              <nav
                aria-label="作答题目筛选"
                className="mt-2 flex gap-2 overflow-x-auto pb-1"
              >
                {(
                  [
                    ["ALL", "全部", questions.length],
                    ["CORRECT", "答对", count("CORRECT")],
                    ["INCORRECT", "答错", count("WRONG") + count("PARTIAL")],
                    ["PENDING", "待处理", pending],
                  ] as const
                ).map(([filter, label, total]) => {
                  const selected = activeFilter === filter;
                  const color =
                    filter === "CORRECT"
                      ? selected
                        ? "border-emerald-500 bg-emerald-100 text-emerald-900"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : filter === "INCORRECT"
                        ? selected
                          ? "border-rose-500 bg-rose-100 text-rose-900"
                          : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        : filter === "PENDING"
                          ? selected
                            ? "border-violet-500 bg-violet-100 text-violet-900"
                            : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                          : selected
                            ? "border-sky-500 bg-sky-100 text-sky-900"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100";
                  return (
                    <a
                      key={filter}
                      aria-current={selected ? "page" : undefined}
                      className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-medium whitespace-nowrap tabular-nums transition focus-visible:ring-2 focus-visible:ring-sky-500 ${color}`}
                      href={personalWorkHref(
                        submission.assignment.id,
                        submission.id,
                        back.href,
                        filter,
                        examId,
                      )}
                      onClick={(event) => handleFilterClick(event, filter)}
                    >
                      {label} {total}
                    </a>
                  );
                })}
              </nav>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">题号</h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {shown.length} / {questions.length}
                </span>
              </div>
              <nav
                aria-label="题号导航"
                className="mt-3 grid grid-cols-5 gap-2"
              >
                {shown.map((question) => {
                  const pendingOutcome = [
                    "PENDING_REVIEW",
                    "PENDING_JUDGE",
                    "JUDGE_ERROR",
                    "MISSING",
                  ].includes(question.outcome);
                  const numberTone =
                    question.outcome === "CORRECT"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
                      : ["WRONG", "PARTIAL"].includes(question.outcome)
                        ? "border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-300"
                        : pendingOutcome
                          ? "border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-300"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300";
                  return (
                    <button
                      key={question.id}
                      type="button"
                      aria-label={`跳转到第 ${question.sortOrder} 题：${outcomeLabels[question.outcome]}`}
                      title={outcomeLabels[question.outcome]}
                      className={`flex h-11 items-center justify-center rounded-lg border text-[13px] font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${numberTone}`}
                      onClick={() => {
                        selectedQuestionId.current = question.id;
                        setQuestionNavigatorOpen(false);
                      }}
                    >
                      {question.sortOrder}
                    </button>
                  );
                })}
              </nav>
            </div>
          </section>
        </EditorDialog>
      </div>
    </section>
  );
}
