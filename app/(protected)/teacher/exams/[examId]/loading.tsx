export default function ExamLoading() {
  return (
    <section aria-busy="true" className="space-y-4">
      <p
        className="rounded-xl border bg-white p-5 text-sm text-slate-700"
        role="status"
      >
        正在加载考试详情…
      </p>
    </section>
  );
}
