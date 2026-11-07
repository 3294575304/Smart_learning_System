export default function DevelopmentLogsLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-5">
      <p className="text-muted-foreground text-sm">正在同步系统开发日志…</p>
      <div className="h-28 animate-pulse rounded-xl bg-sky-100/60" />
      <div className="h-52 animate-pulse rounded-xl bg-sky-100/60" />
    </div>
  );
}
