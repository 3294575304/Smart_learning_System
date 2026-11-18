"use client";

import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

import { withAssignmentTaskReturn } from "@/services/student-experience/activity-query";
import { useRef, useState } from "react";

import { notifyStudentExamStarted } from "@/components/student-assistant/use-availability";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { EditorDialog } from "@/components/assignments/editor-dialog";

interface Props {
  assignmentId: string;
  disabled?: boolean;
  scope?: StudentTaskScope;
  returnTo?: string;
  label?: string;
  className?: string;
  exam?: { remainingAttempts: number; autoSubmitOnExit: boolean };
}

export function StartAttemptButton({
  assignmentId,
  disabled = false,
  scope = {},
  returnTo,
  label = "开始作答",
  className,
  exam,
}: Props) {
  const [pending, setPending] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);

  async function start() {
    if (inFlight.current || (exam && exam.remainingAttempts === 0)) return;
    inFlight.current = true;
    requestId.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);
    const response = await requestAssignmentApi<{
      id: string;
      examSessionId: string | null;
    }>(`/api/student/assignments/${assignmentId}/attempts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: requestId.current }),
    });
    if (!response.success) {
      setError(response.error);
      setPending(false);
      inFlight.current = false;
      return;
    }
    if (response.data.examSessionId) notifyStudentExamStarted();
    window.location.assign(
      withAssignmentTaskReturn(
        studentTaskHref(
          `/student/submissions/${response.data.id}/answer`,
          scope,
        ),
        returnTo,
      ),
    );
  }

  return (
    <div>
      <button
        className={
          className ??
          "st-btn-cta inline-flex min-h-11 items-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
        }
        disabled={disabled || pending || exam?.remainingAttempts === 0}
        onClick={() => (exam ? setConfirmStart(true) : void start())}
        type="button"
      >
        {pending ? "正在开始…" : label}
      </button>
      {exam && (
        <EditorDialog
          open={confirmStart}
          title="确认开始考试"
          busy={pending}
          onClose={() => setConfirmStart(false)}
        >
          <p className="mt-3 text-sm leading-6">
            当前还可考 {exam.remainingAttempts} 次。
            {exam.autoSubmitOnExit
              ? "考试期间请留在作答页。离开、刷新或关闭此页会自动交卷，并消耗 1 次考试机会。"
              : "退出时保留已保存的作答。你可以在截止前继续本次考试，正式交卷会消耗 1 次考试机会。"}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              className="min-h-11 rounded-lg border px-4 text-sm"
              onClick={() => setConfirmStart(false)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={pending}
              className="min-h-11 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
              onClick={() => void start()}
            >
              {pending ? "正在开始…" : "确认开始"}
            </button>
          </div>
        </EditorDialog>
      )}
      {error && !confirmStart ? (
        <p role="alert" className="mt-2 max-w-xs text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
