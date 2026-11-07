"use client";

export default function DevelopmentLogsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-red-200 bg-white p-8 text-center"
    >
      <h1 className="text-lg font-semibold">开发日志暂时无法同步</h1>
      <p className="mt-2 text-sm text-slate-600">
        请检查 CHANGELOG.md 是否随应用部署，或稍后重试。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
      >
        重试同步
      </button>
    </section>
  );
}
