"use client";

import { useState } from "react";
import { requestQuestionApi } from "@/components/questions/request-api";

export function QuestionObjectiveRetry({
  questionId,
  courseId,
}: {
  questionId: string;
  courseId: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setMessage(null);
    const result = await requestQuestionApi<{ status: string }>(
      `/api/teacher/questions/${questionId}/classify-objective`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, requestId: crypto.randomUUID() }),
      },
    );
    setPending(false);
    setMessage(
      result.success
        ? result.data.status === "CLASSIFIED"
          ? "已完成分类，请刷新页面"
          : "已重新加入 AI 分类队列"
        : result.error,
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void retry()}
        className="rounded border border-amber-300 px-1.5 py-0.5 text-amber-800 disabled:opacity-50"
      >
        {pending ? "提交中…" : "重试分类"}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </span>
  );
}
