"use client";

import { useState } from "react";
import { requestAssignmentApi } from "@/components/assignments/request-api";

type Review = {
  reason: string;
  response: string | null;
  resolvedAt: Date | string | null;
};

export function ExamScoreReview({
  submissionId,
  initial,
}: {
  submissionId: string;
  initial: Review | null;
}) {
  const [created, setCreated] = useState<Review | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const review = initial ?? created;

  async function submit() {
    if (busy || reason.trim().length < 2) return;
    setBusy(true);
    setError("");
    const result = await requestAssignmentApi<Review | null>(
      "/api/student/exams/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, reason }),
      },
    );
    setBusy(false);
    if (!result.success || !result.data) {
      setError(
        result.success ? "暂未收到申请结果，请刷新后查看。" : result.error,
      );
      return;
    }
    setCreated(result.data);
  }

  return (
    <section
      id="exam-score-review"
      className="scroll-mt-24 space-y-3 rounded-xl border bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">成绩复核</h2>
        {!review && !expanded && (
          <button
            className="min-h-10 rounded-lg border px-3 text-sm font-medium text-sky-800 hover:bg-sky-50"
            type="button"
            onClick={() => setExpanded(true)}
          >
            申请复核
          </button>
        )}
      </div>
      {review && (
        <div className="space-y-2 text-sm">
          <p role="status" className="font-medium text-slate-700">
            {review.resolvedAt ? "教师已回复" : "已提交，等待教师回复"}
          </p>
          <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
            {review.reason}
          </p>
          {review.response && (
            <p className="rounded-lg bg-slate-50 p-3 [overflow-wrap:anywhere] whitespace-pre-wrap">
              复核结论 · {review.response}
            </p>
          )}
        </div>
      )}
      {!review && expanded && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1 text-sm">
            复核原因
            <textarea
              rows={3}
              maxLength={1000}
              required
              minLength={2}
              className="rounded-lg border p-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="填写题号及你希望教师核对的问题"
            />
          </label>
          {error && (
            <p className="text-sm text-rose-800" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || reason.trim().length < 2}
              className="min-h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "正在提交…" : "提交复核申请"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setExpanded(false)}
              className="min-h-10 rounded-lg border px-3 text-sm"
            >
              取消
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
