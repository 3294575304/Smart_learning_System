"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis } from "lucide-react";

export function CancelExamButton({
  examId,
  title,
}: {
  examId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    if (
      !window.confirm(
        `取消「${title}」？本场考试的所有教学班都会受到影响，题目占用将释放。`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/teacher/exams/${examId}/cancel`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "取消失败");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "取消失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <Ellipsis aria-hidden="true" className="size-4" />
        更多
      </summary>
      <div className="absolute end-0 z-10 mt-1 min-w-36 rounded-lg border bg-white p-1 shadow-md">
        <button
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 active:bg-rose-100 disabled:opacity-50 motion-safe:transition-colors"
          disabled={busy}
          onClick={cancel}
          type="button"
        >
          {busy ? "取消中…" : "取消考试"}
        </button>
        {error && (
          <p role="alert" className="mt-1 max-w-48 text-sm text-rose-800">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
