export default function TeacherCourseAnalyticsLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="正在加载课程分析"
      className="space-y-6"
    >
      <div className="h-56 animate-pulse rounded-3xl border border-sky-100 bg-sky-50" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-36 animate-pulse rounded-2xl border bg-sky-50/60"
            key={index}
          />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl border bg-sky-50/60" />
    </section>
  );
}
