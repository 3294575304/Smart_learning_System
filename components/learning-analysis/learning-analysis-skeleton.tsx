export function LearningAnalysisSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="学情分析加载中"
      className="space-y-4 rounded-xl border bg-white p-6"
      role="status"
    >
      <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
      <span className="sr-only">正在加载学情分析</span>
    </div>
  );
}
