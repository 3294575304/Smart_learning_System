"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import { ProgrammingEditor } from "@/components/programming/code-editor";
import type { ProgrammingLanguage } from "@/lib/programming-language";
import {
  ProgrammingSample,
  type PublicProgrammingSample,
} from "@/components/programming/programming-sample";

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

export function ProgrammingQuestionInput({
  assignmentQuestionId,
  recommendationId,
  code,
  language = "PYTHON",
  sample,
  disabled,
  onChange,
  submissionId,
}: {
  assignmentQuestionId?: string;
  recommendationId?: string;
  code: string;
  language?: ProgrammingLanguage;
  sample?: PublicProgrammingSample | null;
  disabled?: boolean;
  onChange: (code: string, language: ProgrammingLanguage) => void;
  submissionId?: string;
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const activeAttemptId = useRef<string | null>(null);
  const attemptStatus = attempt?.status;
  const running =
    starting || (attempt !== null && !terminal.has(attempt.status));

  const load = useCallback(async (id: string) => {
    const response = await requestAssignmentApi<AttemptDto>(
      `/api/student/programming-attempts/${id}`,
    );
    if (activeAttemptId.current !== id) return;
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
    activeAttemptId.current = null;
    setAttemptId(null);
    const response = await requestAssignmentApi<{
      attemptId: string;
      status: string;
    }>(
      recommendationId
        ? `/api/recommendations/${recommendationId}/programming-attempts`
        : `/api/student/submissions/${submissionId}/programming-runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(recommendationId
            ? { kind: "PUBLIC_RUN" }
            : { assignmentQuestionId }),
          sourceCode: code,
          language,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
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
    <div className="mt-4 space-y-3">
      {sample ? <ProgrammingSample sample={sample} /> : null}
      <ProgrammingEditor
        value={code}
        language={language}
        disabled={disabled || running}
        onChange={(value, nextLanguage) => {
          if (value === code && nextLanguage === language) return;
          activeAttemptId.current = null;
          setAttempt(null);
          setAttemptId(null);
          onChange(value, nextLanguage);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          disabled={
            disabled ||
            starting ||
            (attempt !== null && !terminal.has(attempt.status))
          }
          onClick={() => void run()}
          type="button"
        >
          {starting ? "正在创建运行…" : "运行测试"}
        </button>
        {attempt && !terminal.has(attempt.status) ? (
          <button
            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700"
            onClick={() => void cancel()}
            type="button"
          >
            取消运行
          </button>
        ) : null}
        {attempt && !terminal.has(attempt.status) ? (
          <span className="text-sm text-gray-500">
            {error
              ? "状态查询中断，请重试查询"
              : `执行中 · ${attempt.progress}%`}
          </span>
        ) : null}
      </div>
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
        <p className="text-sm text-gray-500">暂无测试点结果。</p>
      ) : null}
      {attempt ? <ProgrammingTestResults cases={attempt.cases} /> : null}
    </div>
  );
}
