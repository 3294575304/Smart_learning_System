"use client";

import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

import { withAssignmentTaskReturn } from "@/services/student-experience/activity-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { notifyStudentExamStarted } from "@/components/student-assistant/use-availability";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import { examWindowBlurThresholdMs } from "@/services/exams/switch-policy";

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
  const router = useRouter();
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
    /*
     * 考试必须尽量在全屏中开始。这里必须在点击手势的同步栈内发起请求，
     * 一旦 await 之后再调用就会被浏览器判定为缺少用户激活而拒绝。
     * 失败不阻断流程，答题页会用遮罩再兜一次。
     */
    if (exam) {
      const request = document.documentElement.requestFullscreen?.();
      if (request) void request.catch(() => undefined);
    }
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
    /*
     * 用软导航而不是 location.assign：硬跳转会卸载文档，浏览器会退出全屏，
     * 学生进入答题页后又得点一次。软导航保留文档，全屏得以延续。
     */
    router.push(
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
          <p className="mt-2 text-sm leading-6 text-slate-600">
            本场考试将在浏览器全屏下进行，计时从点击「确认开始」起立即计算。若浏览器拦截全屏，作答页会提示你再次进入。
          </p>
          <p className="mt-2 text-sm leading-6">
            切换标签页、最小化浏览器，或让考试窗口失去焦点至少{" "}
            {examWindowBlurThresholdMs / 1000}{" "}
            秒，都会计入切屏。超过本场上限后自动交卷。
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
