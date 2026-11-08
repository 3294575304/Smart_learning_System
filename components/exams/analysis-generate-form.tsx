"use client";

import { useState } from "react";

export function AnalysisGenerateForm({
  examId,
  pass,
  excellent,
}: {
  examId: string;
  pass: number;
  excellent: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/teacher/exams/${examId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pass: Number(form.get("pass")),
          excellent: Number(form.get("excellent")),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "生成失败");
      window.location.href = `/teacher/exams/${examId}/analysis`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败，请重试");
      setPending(false);
    }
  }
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      onSubmit={submit}
    >
      <label className="text-sm">
        及格线（%）
        <input
          className="mt-1 block w-24 rounded border p-2"
          name="pass"
          type="number"
          min="1"
          max="99"
          defaultValue={pass}
          required
        />
      </label>
      <label className="text-sm">
        优秀线（%）
        <input
          className="mt-1 block w-24 rounded border p-2"
          name="excellent"
          type="number"
          min="1"
          max="100"
          defaultValue={excellent}
          required
        />
      </label>
      <button
        className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "生成中…" : "生成新分析版本"}
      </button>
      {error && (
        <p className="w-full text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
