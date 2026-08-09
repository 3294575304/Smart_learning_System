"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface Props {
  attempt: {
    id: string;
    status: string;
    score: number | null;
    maxScore: number;
    errorType: string | null;
    safeErrorSummary: string | null;
    revisionNumber: number;
  } | null;
}

const statusLabels: Record<string, string> = {
  PENDING: "等待判题",
  RUNNING: "正在判题",
  SUCCEEDED: "判题完成",
  SYSTEM_ERROR: "系统故障，可重试",
  CANCELLED: "结果已撤销",
};

export function ProgrammingAttemptActions({ attempt }: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "rejudge" | "revoke" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function rejudge() {
    if (!attempt) return;
    const reason = window.prompt("请输入重判原因（至少 2 个字符）", "教师复核");
    if (!reason) return;
    setPendingAction("rejudge");
    setError(null);
    const result = await requestAssignmentApi<{ attemptId: string }>(
      `/api/teacher/programming-attempts/${attempt.id}/rejudge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, idempotencyKey: crypto.randomUUID() }),
      },
    );
    setPendingAction(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function revoke() {
    if (!attempt) return;
    const reason = window.prompt(
      "撤销会追加一条修订并移除当前成绩证据。请输入原因：",
      "判题结果无效",
    );
    if (
      !reason ||
      !window.confirm("确认撤销这次正式判题结果？历史记录仍会保留。")
    )
      return;
    setPendingAction("revoke");
    setError(null);
    const result = await requestAssignmentApi<{ attemptId: string }>(
      `/api/teacher/programming-attempts/${attempt.id}/revoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    setPendingAction(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (!attempt) {
    return (
      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        尚未创建正式判题记录。
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          第 {attempt.revisionNumber} 次判题 ·{" "}
          {statusLabels[attempt.status] ?? attempt.status}
          {attempt.score === null
            ? ""
            : ` · ${attempt.score} / ${attempt.maxScore}`}
        </p>
        <div className="flex gap-2">
          <button
            className="rounded border bg-white px-3 py-1.5 disabled:opacity-50"
            disabled={
              pendingAction !== null ||
              attempt.status === "PENDING" ||
              attempt.status === "RUNNING"
            }
            onClick={() => void rejudge()}
            type="button"
          >
            {pendingAction === "rejudge" ? "正在创建…" : "重判"}
          </button>
          <button
            className="rounded border border-red-200 bg-white px-3 py-1.5 text-red-700 disabled:opacity-50"
            disabled={pendingAction !== null || attempt.status !== "SUCCEEDED"}
            onClick={() => void revoke()}
            type="button"
          >
            {pendingAction === "revoke" ? "正在撤销…" : "撤销"}
          </button>
        </div>
      </div>
      {attempt.safeErrorSummary ? (
        <p className="text-amber-800">
          {attempt.errorType ? `${attempt.errorType}：` : ""}
          {attempt.safeErrorSummary}
        </p>
      ) : null}
      {error ? (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
