export default function StudentCoursesLoading() {
  return (
    <section aria-busy="true" className="space-y-6">
      <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            className="h-72 animate-pulse rounded-2xl border bg-slate-50"
            key={item}
          />
        ))}
      </div>
      <p className="sr-only">正在加载我的课程</p>
    </section>
  );
}
