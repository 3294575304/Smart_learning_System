export default function ShowcaseLoading() {
  return (
    <section
      className="min-h-[70vh] animate-pulse rounded-2xl border border-sky-100 bg-slate-50 p-8 text-slate-500"
      aria-busy="true"
    >
      <p role="status">正在加载全国高校应用分布…</p>
      <div className="mt-8 h-96 rounded-xl border border-sky-100 bg-white" />
    </section>
  );
}
