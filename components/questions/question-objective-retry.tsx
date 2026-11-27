"use client";

import { useState } from "react";
import { requestQuestionApi } from "@/components/questions/request-api";

export function QuestionObjectiveRetry({
  questionId,
  courseId,
  reclassify = false,
}: {
  questionId: string;
  courseId: string | null;
  reclassify?: boolean;
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
        body: JSON.stringify({
          courseId,
          requestId: crypto.randomUUID(),
          reclassify,
        }),
      },
    );
    setPending(false);
    setMessage(
      result.success
        ? result.data.status === "CLASSIFIED"
          ? "已完成分类，请刷新页面"
          : result.data.status === "PROTECTED"
            ? "当前标注已受人工保护或已变化，请刷新核对"
            : "已加入 AI 分类队列，请稍后刷新核对结果"
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
        {pending ? "提交中…" : reclassify ? "重新 AI 分类" : "重试分类"}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </span>
  );
}
