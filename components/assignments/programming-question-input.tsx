"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import { PythonCodeEditor } from "@/components/programming/code-editor";
import {
  ProgrammingTestResults,
  type ProgrammingTestResult,
} from "@/components/programming/test-results";

interface AttemptDto {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "SYSTEM_ERROR" | "CANCELLED";
  progress: number;
  score: number | null;
  maxScore: number;
  safeErrorSummary: string | null;
  cases: ProgrammingTestResult[];
}

const terminal = new Set(["SUCCEEDED", "SYSTEM_ERROR", "CANCELLED"]);

/** 前 5 秒按 1 秒一次抓细粒度进度，之后降到 2.5 秒，避免长时间空转请求。 */
const FAST_POLL_MS = 1_000;
const SLOW_POLL_MS = 2_500;
const FAST_POLL_WINDOW_MS = 5_000;

export function ProgrammingQuestionInput({
  assignmentQuestionId,
  code,
  disabled,
  onChange,
  submissionId,
}: {
  assignmentQuestionId: string;
  code: string;
  disabled?: boolean;
  onChange: (code: string) => void;
  submissionId: string;
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /**
   * 轮询可能让在途响应变成过期数据（重跑、改代码之后）。
   * 只认当前这次运行的结果，避免旧响应把新结果覆盖回去。
   */
  const activeAttemptId = useRef<string | null>(null);
  const running =
    starting || (attempt !== null && !terminal.has(attempt.status));

  /** 返回 true 表示已到终态，调用方不必再轮询。 */
  const load = useCallback(async (id: string) => {
    const response = await requestAssignmentApi<AttemptDto>(
      `/api/student/programming-attempts/${id}`,
    );
    if (activeAttemptId.current !== id) return true;
    if (!response.success) {
      setError(response.error);
      return false;
    }
    setAttempt(response.data);
    setError(null);
    return terminal.has(response.data.status);
  }, []);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();
    const tick = async () => {
      const done = await load(attemptId);
      if (cancelled || done) return;
      const delay =
        Date.now() - startedAt > FAST_POLL_WINDOW_MS
          ? SLOW_POLL_MS
          : FAST_POLL_MS;
      timer = window.setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attemptId, load]);

  /** 结果一旦失效就整体清空，不能让学生把旧结果当成当前代码的结论。 */
  const invalidate = useCallback(() => {
    activeAttemptId.current = null;
    setAttempt(null);
    setAttemptId(null);
  }, []);

  async function run() {
    if (disabled || running) return;
    setStarting(true);
    setError(null);
    invalidate();
    const response = await requestAssignmentApi<{
      attemptId: string;
      status: string;
    }>(`/api/student/submissions/${submissionId}/programming-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assignmentQuestionId,
        sourceCode: code,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setStarting(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    activeAttemptId.current = response.data.attemptId;
    setAttempt({
      id: response.data.attemptId,
      status: "PENDING",
      progress: 0,
      score: null,
      maxScore: 0,
      safeErrorSummary: null,
      cases: [],
    });
    setAttemptId(response.data.attemptId);
  }

  async function cancel() {
    if (!attemptId) return;
    const response = await requestAssignmentApi<{ cancelled: boolean }>(
      `/api/student/programming-attempts/${attemptId}/cancel`,
      { method: "POST" },
    );
    if (!response.success) {
      setError(response.error);
      return;
    }
    await load(attemptId);
  }

  return (
    <div className="min-w-0 space-y-3">
      <PythonCodeEditor
        disabled={disabled || running}
        onChange={(next) => {
          if (next === code) return;
          invalidate();
          onChange(next);
        }}
        onRun={() => void run()}
        progress={running ? (attempt?.progress ?? 0) : null}
        value={code}
        toolbar={
          <>
            {attempt && !terminal.has(attempt.status) ? (
              <button
                className="inline-flex h-9 items-center rounded-md border border-rose-400/40 px-2.5 text-xs font-medium text-rose-200 hover:bg-rose-500/15 focus-visible:outline-2 focus-visible:outline-rose-300 disabled:opacity-50"
                onClick={() => void cancel()}
                type="button"
              >
                取消运行
              </button>
            ) : null}
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sky-500 px-3 text-xs font-semibold text-slate-900 transition-colors hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50"
              disabled={disabled || running}
              onClick={() => void run()}
              title="运行公开样例（Ctrl / Cmd + Enter）"
              type="button"
            >
              <Play className="size-3.5" aria-hidden="true" />
              {starting ? "正在运行…" : "运行样例"}
            </button>
          </>
        }
      />

      {attempt && !terminal.has(attempt.status) ? (
        <p className="text-ink-soft text-sm" role="status">
          {error ? "状态查询中断，请重试查询" : `执行中 · ${attempt.progress}%`}
        </p>
      ) : null}

      {error ? (
        <p className="bg-bad-soft text-bad rounded-lg p-3 text-sm">
          {error}{" "}
          {attemptId ? (
            <button
              className="underline"
              onClick={() => void load(attemptId)}
              type="button"
            >
              重试查询
            </button>
          ) : null}
        </p>
      ) : null}

      {attempt?.status === "SYSTEM_ERROR" ? (
        <p className="bg-warn-soft text-warn rounded-lg p-3 text-sm">
          判题服务暂时不可用，本次不计分。请稍后重试。
        </p>
      ) : null}

      {attempt?.status === "SUCCEEDED" && attempt.cases.length === 0 ? (
        <p className="text-ink-soft text-sm">暂无公开样例结果。</p>
      ) : null}

      {attempt ? <ProgrammingTestResults cases={attempt.cases} /> : null}
    </div>
  );
}
