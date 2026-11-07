export default function DirectoryLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-5">
      <p className="text-muted-foreground text-sm">正在加载合作学校和管理员…</p>
      <div className="h-20 animate-pulse rounded-xl bg-sky-100/60" />
      <div className="h-64 animate-pulse rounded-xl bg-sky-100/60" />
    </div>
  );
}
