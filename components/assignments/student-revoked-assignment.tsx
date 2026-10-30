import Link from "next/link";

export function StudentRevokedAssignment({ backHref }: { backHref: string }) {
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5 sm:p-6">
      <h1 className="text-xl font-semibold">作业已撤销</h1>
      <p className="text-sm text-slate-700">
        这份作业无需提交，也不会计为缺交。
      </p>
      <Link
        className="inline-block rounded-lg border px-4 py-2 text-sm text-sky-800"
        href={backHref}
      >
        返回作业列表
      </Link>
    </section>
  );
}
