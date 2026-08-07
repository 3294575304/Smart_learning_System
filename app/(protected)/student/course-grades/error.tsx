"use client";
export default function ErrorState({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      课程成绩加载失败。
      <button className="ml-3 underline" onClick={reset}>
        重试
      </button>
    </div>
  );
}
