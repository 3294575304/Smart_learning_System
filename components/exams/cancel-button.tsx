"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelExamButton({ examId }: { examId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    if (!window.confirm("取消尚未开考的考试？题目占用将释放。")) return;
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
    <span>
      <button
        className="text-red-700 disabled:opacity-50"
        disabled={busy}
        onClick={cancel}
      >
        {busy ? "取消中…" : "取消考试"}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
