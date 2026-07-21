export default function RecommendationsLoading() {
  return (
    <main aria-busy="true" className="min-w-0 animate-pulse space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div>
          <div className="h-8 w-40 rounded bg-gray-200" />
          <div className="mt-3 h-4 w-72 max-w-full rounded bg-gray-200" />
        </div>
        <div className="h-10 w-32 rounded bg-gray-200" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-9 w-20 rounded-full bg-gray-200" key={item} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-72 rounded-xl border bg-gray-100" key={item} />
        ))}
      </div>
      <p className="sr-only">正在加载推荐练习</p>
    </main>
  );
}
