"use client";

export default function StudentCoursesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-2xl border bg-white p-8 text-center">
      <h1 className="text-xl font-semibold">课程暂时无法加载</h1>
      <p className="mt-2 text-sm text-slate-500">
        请检查网络连接后重试。已经加入的课程不会受到影响。
      </p>
      <button
        className="mt-5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white"
        onClick={reset}
        type="button"
      >
        重新加载
      </button>
    </section>
  );
}
