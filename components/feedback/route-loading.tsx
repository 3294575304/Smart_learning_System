export function RouteLoading() {
  return (
    <main
      className="mx-auto max-w-6xl animate-pulse px-6 py-10"
      aria-busy="true"
    >
      <div className="bg-muted h-8 w-52 rounded" />
      <div className="bg-muted mt-6 h-32 rounded-xl" />
      <p className="sr-only">正在加载</p>
    </main>
  );
}
