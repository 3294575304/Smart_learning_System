export function RouteLoading() {
  return (
    <main
      className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="bg-muted h-7 w-48 rounded" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="bg-muted h-28 rounded-xl" key={item} />
        ))}
      </div>
      <div className="bg-muted mt-6 h-72 rounded-xl" />
      <p role="status" className="mt-4 text-sm text-sky-800">
        正在加载页面，请稍候…
      </p>
    </main>
  );
}
