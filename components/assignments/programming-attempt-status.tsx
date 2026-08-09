"use client";

import { useCallback, useEffect, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface AttemptDto {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "SYSTEM_ERROR" | "CANCELLED";
  progress: number;
  score: number | null;
  maxScore: number;
  errorType: string | null;
  safeErrorSummary: string | null;
  cases: Array<{
    index: number;
    passed: boolean;
    score: number;
    maxScore: number;
    errorType: string;
    safeErrorSummary: string | null;
  }>;
}

const terminal = new Set(["SUCCEEDED", "SYSTEM_ERROR", "CANCELLED"]);

export function ProgrammingAttemptStatus({
  assignmentQuestionId,
  attemptId,
}: {
  assignmentQuestionId: string;
  attemptId: string;
}) {
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptStatus = attempt?.status;

  const load = useCallback(async () => {
    const response = await requestAssignmentApi<AttemptDto>(
      `/api/student/programming-attempts/${attemptId}`,
    );
    if (!response.success) {
      setError(response.error);
      return;
    }
    setAttempt(response.data);
    setError(null);
  }, [attemptId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!attemptStatus || !terminal.has(attemptStatus)) void load();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [attemptStatus, load]);

  return (
    <article className="space-y-3 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Python 正式判题</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            题目 {assignmentQuestionId} · Attempt {attemptId.slice(-8)}
          </p>
        </div>
        <span className="text-sm">
          {!attempt
            ? "加载中…"
            : attempt.status === "PENDING" || attempt.status === "RUNNING"
              ? `执行中 ${attempt.progress}%`
              : attempt.status === "SUCCEEDED"
                ? `${attempt.score ?? 0} / ${attempt.maxScore} 分`
                : attempt.safeErrorSummary}
        </span>
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <button
            className="underline"
            onClick={() => void load()}
            type="button"
          >
            重试
          </button>
        </p>
      ) : null}
      {attempt?.status === "SYSTEM_ERROR" ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          系统故障没有按零分处理。任务可由教师重判，已有作业与成绩查询不受影响。
        </p>
      ) : null}
      {attempt?.cases.length === 0 && attempt.status === "SUCCEEDED" ? (
        <p className="text-sm text-gray-500">没有可显示的用例结果。</p>
      ) : null}
      {attempt?.cases.map((item) => (
        <div
          className="flex items-center justify-between rounded-md border p-3 text-sm"
          key={item.index}
        >
          <span>
            用例 {item.index} · {item.passed ? "通过" : item.safeErrorSummary}
          </span>
          <span>
            {item.score} / {item.maxScore}
          </span>
        </div>
      ))}
    </article>
  );
}
