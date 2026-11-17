"use client";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import {
  manualGradeAnswerSchema,
  type ManualGradeAnswerData,
} from "@/services/assignments/schemas";
import type { TeacherSubmissionDetail } from "@/services/assignments/types";
import type { ProgrammingPaperScoreSuggestion } from "@/services/programming-scoring/schemas";
import { ProgrammingAttemptActions } from "./programming-attempt-actions";
import type { GradingMutationProps } from "./submission-grading-workspace";

interface Props extends GradingMutationProps {
  answerId: string;
  assignmentId: string;
  bulkScoreSelection?: {
    revision: number;
    method: "TEST_CASES" | "SMART_AI";
    status: "pending" | "ready" | "clear";
    score: number | null;
    note: string | null;
    suggestion?: ProgrammingPaperScoreSuggestion;
  };
  initialFeedback: string;
  initialScore: number | null;
  isProgramming?: boolean;
  automaticScore?: number | null;
  programmingAttempt?: TeacherSubmissionDetail["answers"][number]["programmingAttempt"];
  maxScore: number;
  onBulkScoreSelectionCleared?: (answerId: string) => void;
  submissionId: string;
}

export function ManualGradeForm({
  answerId,
  assignmentId,
  bulkScoreSelection,
  initialFeedback,
  initialScore,
  isProgramming = false,
  automaticScore = null,
  programmingAttempt,
  maxScore,
  onBulkScoreSelectionCleared,
  submissionId,
  mutationBusy,
  beginMutation,
  endMutation,
  onUpdated,
}: Props) {
  const [serverMessage, setServerMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [paperScore, setPaperScore] =
    useState<ProgrammingPaperScoreSuggestion | null>(null);
  const [paperScoreBusy, setPaperScoreBusy] = useState(false);
  const [paperScoreError, setPaperScoreError] = useState<string | null>(null);
  const selectionNote = useRef<string | null>(null);
  const appliedBulkRevision = useRef<number | null>(null);
  const form = useForm<
    z.input<typeof manualGradeAnswerSchema>,
    unknown,
    ManualGradeAnswerData
  >({
    resolver: zodResolver(manualGradeAnswerSchema),
    defaultValues: {
      score: initialScore ?? undefined,
      feedback: initialFeedback,
    },
  });
  const scoreInput = form.register("score", { valueAsNumber: true });

  const removeSelectionNote = useCallback(() => {
    const note = selectionNote.current;
    if (!note) return;
    const feedback = (form.getValues("feedback") ?? "").trim();
    const remainder = feedback.startsWith(note)
      ? feedback.slice(note.length).trim()
      : feedback;
    form.setValue("feedback", remainder, { shouldDirty: true });
    selectionNote.current = null;
  }, [form]);

  const chooseScore = useCallback(
    (score: number, note: string) => {
      const feedback = (form.getValues("feedback") ?? "").trim();
      const oldNote = selectionNote.current;
      const remainder =
        oldNote && feedback.startsWith(oldNote)
          ? feedback.slice(oldNote.length).trim()
          : feedback;
      selectionNote.current = note;
      form.setValue("score", score, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("feedback", [note, remainder].filter(Boolean).join(" "), {
        shouldDirty: true,
      });
    },
    [form],
  );

  function chooseIndividualScore(score: number, note: string) {
    onBulkScoreSelectionCleared?.(answerId);
    chooseScore(score, note);
  }

  useEffect(() => {
    if (
      !bulkScoreSelection ||
      bulkScoreSelection.status === "pending" ||
      appliedBulkRevision.current === bulkScoreSelection.revision
    )
      return;
    appliedBulkRevision.current = bulkScoreSelection.revision;
    if (
      bulkScoreSelection.status === "ready" &&
      bulkScoreSelection.score !== null &&
      bulkScoreSelection.note
    ) {
      chooseScore(bulkScoreSelection.score, bulkScoreSelection.note);
      if (bulkScoreSelection.suggestion)
        setPaperScore(bulkScoreSelection.suggestion);
    }
  }, [bulkScoreSelection, chooseScore]);

  async function calculatePaperScore() {
    if (!isProgramming || paperScoreBusy) return;
    setPaperScoreBusy(true);
    setPaperScoreError(null);
    try {
      const result =
        await requestAssignmentApi<ProgrammingPaperScoreSuggestion>(
          `/api/teacher/assignments/${assignmentId}/submissions/${submissionId}/answers/${answerId}/programming-score`,
          { method: "POST" },
        );
      if (!result.success) {
        setPaperScoreError(result.error);
        return;
      }
      setPaperScore(result.data);
    } catch {
      setPaperScoreError("计算失败，请检查网络后重试。");
    } finally {
      setPaperScoreBusy(false);
    }
  }

  async function submit(input: ManualGradeAnswerData) {
    if (!beginMutation()) return;
    setServerMessage(null);
    try {
      const result = await requestAssignmentApi<TeacherSubmissionDetail>(
        `/api/teacher/assignments/${assignmentId}/submissions/${submissionId}/answers/${answerId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!result.success) {
        setServerMessage({ kind: "error", text: result.error });
        return;
      }
      setServerMessage({ kind: "success", text: "该题评分已保存" });
      onBulkScoreSelectionCleared?.(answerId);
      markTeacherWorkspaceDirty();
      onUpdated(result.data);
    } finally {
      endMutation();
    }
  }

  return (
    <form
      className="mt-4 space-y-4 rounded-lg border bg-sky-50/70 p-4"
      onSubmit={form.handleSubmit(submit)}
    >
      {isProgramming ? (
        <section className="space-y-3 border-b border-sky-200 pb-4">
          <h3 className="text-sm font-semibold text-slate-800">
            编程题成绩选择
          </h3>
          <div className="grid items-stretch gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-sky-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">
                  测试用例成绩
                </span>
                <strong className="text-lg text-slate-900 tabular-nums">
                  {automaticScore === null
                    ? "待判题"
                    : `${automaticScore.toFixed(2)} / ${maxScore.toFixed(2)}`}
                </strong>
              </div>
              <ProgrammingAttemptActions
                attempt={programmingAttempt ?? null}
                busy={mutationBusy}
                embedded
              />
              <button
                className="mt-3 min-h-9 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                disabled={automaticScore === null || mutationBusy}
                onClick={() =>
                  automaticScore !== null &&
                  chooseIndividualScore(
                    automaticScore,
                    `评分依据：教师选择采用测试用例成绩 ${automaticScore.toFixed(2)} / ${maxScore.toFixed(2)}。`,
                  )
                }
                type="button"
              >
                采用测试成绩
              </button>
            </div>
            <div className="rounded-lg border border-violet-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-violet-800">
                  智能 AI 判题参考分
                </span>
                <strong className="text-lg text-violet-900 tabular-nums">
                  {paperScore
                    ? `${paperScore.score.toFixed(2)} / ${paperScore.maxScore.toFixed(2)}`
                    : "尚未计算"}
                </strong>
              </div>
              {paperScore ? (
                <button
                  className="mt-3 min-h-9 rounded-md border border-violet-300 px-3 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                  disabled={mutationBusy}
                  onClick={() =>
                    chooseIndividualScore(
                      paperScore.score,
                      `评分依据：教师选择采用智能 AI 判题参考分 ${paperScore.score.toFixed(2)} / ${paperScore.maxScore.toFixed(2)}。`,
                    )
                  }
                  type="button"
                >
                  采用 AI 判题分
                </button>
              ) : (
                <button
                  className="mt-3 min-h-9 rounded-md border border-violet-300 px-3 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                  disabled={paperScoreBusy || mutationBusy}
                  onClick={() => void calculatePaperScore()}
                  type="button"
                >
                  {paperScoreBusy ? "正在计算…" : "计算智能 AI 判题参考分"}
                </button>
              )}
              {paperScore ? (
                <div className="mt-3 space-y-2 border-t border-violet-100 pt-3 text-sm text-slate-700">
                  <p className="text-xs leading-5 tabular-nums">
                    功能 {paperScore.dimensions.semantic.toFixed(0)} · 结构{" "}
                    {paperScore.dimensions.structure.toFixed(0)} · 注释{" "}
                    {paperScore.dimensions.commentConsistency.toFixed(0)}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-violet-800">
                      查看判题依据
                    </summary>
                    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-2 text-xs leading-5">
                      <dl className="space-y-1 tabular-nums">
                        {(
                          [
                            ["semantic", "功能覆盖"],
                            ["structure", "结构相似度"],
                            ["commentConsistency", "注释一致性"],
                          ] as const
                        ).map(([key, label]) => (
                          <div className="flex justify-between gap-2" key={key}>
                            <dt>
                              {label} · 权重{" "}
                              {Math.round(paperScore.weights[key] * 100)}%
                            </dt>
                            <dd>
                              {paperScore.dimensions[key].toFixed(1)} / 100
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <p>
                        加权得分 {paperScore.scoreOnHundred.toFixed(2)} /
                        100，折算为本题 {paperScore.score.toFixed(2)} 分。
                      </p>
                      <ul className="space-y-1">
                        {paperScore.review?.functionalPoints.map(
                          (point, index) => (
                            <li key={index}>
                              {point.description}：覆盖{" "}
                              {Math.round(point.coverage * 100)}%
                            </li>
                          ),
                        )}
                      </ul>
                      <p>
                        {paperScore.commentEvidenceMissing
                          ? "未发现可评估注释，注释一致性按不扣分处理。"
                          : `检查 ${paperScore.checkedCommentCount} 组注释，其中 ${paperScore.mismatchedCommentCount} 组与代码不一致。`}
                      </p>
                      {paperScore.review?.commentPairs
                        .filter((pair) => !pair.consistent)
                        .map((pair, index) => (
                          <p key={index}>
                            注释“{pair.comment}”与代码行为“{pair.code}”不一致。
                          </p>
                        ))}
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          </div>
          {paperScoreError ? (
            <p className="text-sm text-red-700" role="alert">
              {paperScoreError}{" "}
              <button
                className="underline"
                onClick={() => void calculatePaperScore()}
                type="button"
              >
                重试
              </button>
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
        <label className="space-y-2">
          <span className="text-sm font-medium">
            最终得分（满分 {maxScore}）
          </span>
          <input
            className="w-full rounded-md border bg-white px-3 py-2"
            max={maxScore}
            min={0}
            step="0.01"
            type="number"
            {...scoreInput}
            onChange={(event) => {
              void scoreInput.onChange(event);
              onBulkScoreSelectionCleared?.(answerId);
              removeSelectionNote();
            }}
          />
          {form.formState.errors.score?.message ? (
            <p className="text-sm text-red-600">
              {form.formState.errors.score.message}
            </p>
          ) : null}
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">教师反馈</span>
          <textarea
            className="min-h-24 w-full rounded-md border bg-white px-3 py-2"
            placeholder="可填写解题建议、错误原因或改进方向"
            {...form.register("feedback", {
              onChange: () => onBulkScoreSelectionCleared?.(answerId),
            })}
          />
          {form.formState.errors.feedback?.message ? (
            <p className="text-sm text-red-600">
              {form.formState.errors.feedback.message}
            </p>
          ) : null}
        </label>
      </div>
      {serverMessage ? (
        <p
          className={
            serverMessage.kind === "error"
              ? "text-sm text-red-700"
              : "text-sm text-emerald-700"
          }
          role={serverMessage.kind === "error" ? "alert" : "status"}
        >
          {serverMessage.text}
        </p>
      ) : null}
      <button
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={form.formState.isSubmitting || mutationBusy}
        type="submit"
      >
        {form.formState.isSubmitting ? "保存中…" : "保存单题评分"}
      </button>
    </form>
  );
}
