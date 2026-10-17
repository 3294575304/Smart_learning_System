export default function ClassroomLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="正在加载班级详情"
      className="space-y-5"
    >
      <p className="text-sm text-sky-700" role="status">
        正在打开班级，加载学生名单…
      </p>
      <div className="h-24 animate-pulse rounded-xl bg-sky-100/60" />
      <div className="h-40 animate-pulse rounded-xl bg-sky-100/60" />
      <div className="h-64 animate-pulse rounded-xl bg-sky-100/60" />
    </section>
  );
}
