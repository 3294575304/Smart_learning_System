"use client";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import {
  manualGradeAnswerSchema,
  type ManualGradeAnswerData,
} from "@/services/assignments/schemas";
import type { TeacherSubmissionDetail } from "@/services/assignments/types";
import type { GradingMutationProps } from "./submission-grading-workspace";

interface Props extends GradingMutationProps {
  answerId: string;
  assignmentId: string;
  initialFeedback: string;
  initialScore: number | null;
  maxScore: number;
  submissionId: string;
}

export function ManualGradeForm({
  answerId,
  assignmentId,
  initialFeedback,
  initialScore,
  maxScore,
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
      <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
        <label className="space-y-2">
          <span className="text-sm font-medium">
            人工得分（满分 {maxScore}）
          </span>
          <input
            className="w-full rounded-md border bg-white px-3 py-2"
            max={maxScore}
            min={0}
            step="0.01"
            type="number"
            {...form.register("score", { valueAsNumber: true })}
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
            {...form.register("feedback")}
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
