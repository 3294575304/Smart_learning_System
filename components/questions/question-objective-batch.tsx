"use client";

import { useRef, useState } from "react";
import { requestQuestionApi } from "./request-api";

export function QuestionObjectiveBatch({
  courseId,
  candidates,
}: {
  courseId: string;
  candidates: { id: string; title: string }[];
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);
  async function submit() {
    if (pending || !ids.length) return;
    setPending(true);
    requestId.current ??= crypto.randomUUID();
    const result = await requestQuestionApi<{
      queued: number;
      skipped: number;
      failed: number;
    }>("/api/teacher/questions/classify-objective/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        courseId,
        questionIds: ids,
        requestId: requestId.current,
      }),
    });
    setPending(false);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    const { queued, skipped, failed } = result.data;
    setMessage(
      `已入队 ${queued} 道，已变化或受保护 ${skipped} 道，失败 ${failed} 道。${failed ? "可重试本批。" : "请稍后刷新核对。"}`,
    );
    if (!failed) setIds([]);
  }
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-medium">
        批量重判 AI 目标标注（本页 {candidates.length} 道）
      </summary>
      <p className="mt-2 text-sm text-slate-600">
        每次最多选 20 道。只处理当前大纲下的单一 AI 标注，教师确认的标注受保护。
      </p>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" disabled={pending}>
        <legend className="sr-only">选择待重判题目</legend>
        {candidates.map((item) => (
          <label
            key={item.id}
            className="flex items-start gap-2 rounded border p-2 text-sm break-words"
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={ids.includes(item.id)}
              disabled={ids.length >= 20 && !ids.includes(item.id)}
              onChange={(event) => {
                requestId.current = null;
                setIds((current) =>
                  event.target.checked
                    ? [...current, item.id]
                    : current.filter((id) => id !== item.id),
                );
              }}
            />
            {item.title}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="mt-3 rounded bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        disabled={pending || !ids.length}
        onClick={() => void submit()}
      >
        {pending ? "正在入队…" : `确认重判 ${ids.length} 道`}
      </button>
      {message && (
        <p className="mt-2 text-sm" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
