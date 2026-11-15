"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface AttemptDto {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "SYSTEM_ERROR" | "CANCELLED";
  progress: number;
  score: number | null;
  maxScore: number;
  safeErrorSummary: string | null;
  cases: Array<{
    index: number;
    passed: boolean;
    errorType: string;
    safeErrorSummary: string | null;
    stdout?: string;
    stderr?: string;
  }>;
}

const terminal = new Set(["SUCCEEDED", "SYSTEM_ERROR", "CANCELLED"]);

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
  const attemptStatus = attempt?.status;

  const load = useCallback(async (id: string) => {
    const response = await requestAssignmentApi<AttemptDto>(
      `/api/student/programming-attempts/${id}`,
    );
    if (!response.success) {
      setError(response.error);
      return;
    }
    setAttempt(response.data);
    setError(null);
  }, []);

  useEffect(() => {
    if (!attemptId) return;
    void load(attemptId);
    const timer = window.setInterval(() => {
      if (!attemptStatus || !terminal.has(attemptStatus)) void load(attemptId);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [attemptStatus, attemptId, load]);

  async function run() {
    setStarting(true);
    setError(null);
    setAttempt(null);
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
    <div className="space-y-3">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
        <h3 className="text-ink text-sm font-semibold">你的作答</h3>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-700 disabled:opacity-50"
          disabled={
            disabled ||
            starting ||
            (attempt !== null && !terminal.has(attempt.status))
          }
          onClick={() => void run()}
          type="button"
        >
          <Play className="size-4" aria-hidden="true" />
          {starting ? "正在创建运行…" : "运行公开样例"}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0e1c2b]">
        <div className="flex items-center justify-between gap-2 bg-[#162a3e] px-4 py-2.5 font-mono text-xs text-slate-200">
          <span>main.py</span>
          <span>Python</span>
        </div>
        <textarea
          aria-label="Python 代码"
          className="block min-h-72 w-full resize-y bg-transparent px-4 py-3 font-mono text-sm leading-6 text-slate-100 caret-sky-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-60 xl:min-h-96"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={code}
        />
      </div>
      {attempt && !terminal.has(attempt.status) && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700"
            onClick={() => void cancel()}
            type="button"
          >
            取消运行
          </button>
          <span role="status" className="text-sm text-gray-500">
            {error
              ? "状态查询中断，请重试查询"
              : `执行中 · ${attempt.progress}%`}
          </span>
        </div>
      )}
      {error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
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
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          判题服务暂时不可用，本次不计分。请稍后重试。
        </p>
      ) : null}
      {attempt?.cases.length === 0 && attempt.status === "SUCCEEDED" ? (
        <p className="text-sm text-gray-500">暂无公开样例结果。</p>
      ) : null}
      {attempt?.cases.map((item) => (
        <div
          className={`rounded-md border p-3 text-sm ${item.passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
          key={item.index}
        >
          <p className="font-medium">
            样例 {item.index} · {item.passed ? "通过" : item.safeErrorSummary}
          </p>
          {item.stdout ? (
            <pre className="mt-2 overflow-auto rounded bg-white/70 p-2 whitespace-pre-wrap">
              输出：{item.stdout}
            </pre>
          ) : null}
          {item.stderr ? (
            <pre className="mt-2 overflow-auto rounded bg-white/70 p-2 whitespace-pre-wrap text-red-700">
              错误：{item.stderr}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}
