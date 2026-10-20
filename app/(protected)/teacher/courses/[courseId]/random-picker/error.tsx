"use client";

export default function RandomPickerError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border bg-white p-8 text-sm">
      <p>班级学生加载失败，请重试。</p>
      <button
        type="button"
        className="mt-3 rounded-lg border px-3 py-2 text-sky-700"
        onClick={reset}
      >
        重试
      </button>
    </div>
  );
}
