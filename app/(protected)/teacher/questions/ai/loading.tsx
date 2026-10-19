export default function AIQuestionsLoading() {
  return (
    <section className="mx-auto max-w-6xl space-y-5 pb-10" aria-busy="true">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      <p className="text-sm text-slate-500">正在加载 AI 出题工作区…</p>
    </section>
  );
}
