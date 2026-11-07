"use client";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";

import { useState } from "react";

import { EditorDialog } from "@/components/assignments/editor-dialog";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import type { TeacherSubmissionDetail } from "@/services/assignments/types";
import type { GradingMutationProps } from "./submission-grading-workspace";

interface Props extends GradingMutationProps {
  assignmentId: string;
  submissionId: string;
  blockedReason?: string;
}

export function CompleteGradingButton({
  assignmentId,
  submissionId,
  blockedReason,
  mutationBusy,
  beginMutation,
  endMutation,
  onUpdated,
}: Props) {
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    if (blockedReason || pending || !beginMutation()) return;
    setPending(true);
    setError(null);
    try {
      const result = await requestAssignmentApi<TeacherSubmissionDetail>(
        `/api/teacher/assignments/${assignmentId}/submissions/${submissionId}/complete`,
        { method: "POST" },
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      markTeacherWorkspaceDirty();
      onUpdated(result.data);
    } finally {
      setPending(false);
      endMutation();
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={mutationBusy || Boolean(blockedReason)}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        {pending ? "正在更新批改状态…" : "完成整份批改"}
      </button>
      <EditorDialog
        open={confirmOpen}
        title="确认完成整份批改"
        busy={pending}
        onClose={() => setConfirmOpen(false)}
      >
        <p className="mt-3 text-sm leading-6 text-slate-600">
          系统将重新核验所有题目与总分。完成后仍需通过作业级公布，学生才能查看分数、答案和反馈。
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="h-10 rounded-lg border px-4 text-sm"
            disabled={pending}
            onClick={() => setConfirmOpen(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white disabled:opacity-50"
            disabled={mutationBusy || Boolean(blockedReason)}
            onClick={() => void complete()}
          >
            {pending ? "正在核验…" : "确认完成批改"}
          </button>
        </div>
      </EditorDialog>
      {blockedReason ? (
        <p className="max-w-sm text-sm text-slate-500">{blockedReason}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
