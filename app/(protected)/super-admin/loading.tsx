export default function SuperAdminLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="正在加载平台概览"
      className="space-y-6"
    >
      <p className="text-muted-foreground text-sm" role="status">
        正在汇总平台数据…
      </p>
      <div className="h-40 animate-pulse rounded-2xl bg-sky-100/60" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-36 animate-pulse rounded-xl bg-sky-100/60"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-sky-100/60" />
    </section>
  );
}
