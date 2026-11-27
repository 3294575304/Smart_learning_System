/**
 * 内容覆盖自检的加载骨架。
 * 该页要聚合全课程掌握度，冷启动有可感知延迟；此前没有 loading.tsx，
 * 教师会看到整页空白，无法判断是在算还是卡住了。
 */
export default function CourseContentCoverageLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="正在统计内容覆盖"
      className="space-y-5"
    >
      <div className="space-y-3">
        <div className="bg-muted h-5 w-24 animate-pulse rounded" />
        <div className="bg-muted h-8 w-64 animate-pulse rounded" />
      </div>
      <div className="border-line bg-card rounded-xl border p-5">
        <div className="bg-muted h-5 w-40 animate-pulse rounded" />
        <div className="bg-muted mt-2 h-4 w-72 animate-pulse rounded" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              className="border-line bg-muted/40 h-24 animate-pulse rounded-lg border"
              key={index}
            />
          ))}
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="flex items-center justify-between gap-3"
              key={index}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
                <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-9 w-24 animate-pulse rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
