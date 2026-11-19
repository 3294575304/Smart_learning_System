import Link from "next/link";

export default function StudentNotFound() {
  return (
    <section className="border-border bg-card rounded-xl border p-6 sm:p-8">
      <p className="text-sm font-medium text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">
        找不到这条记录
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        链接可能已失效，或者这条记录不属于当前账号。为保护隐私，系统不会区分「不存在」和「无权查看」。
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          href="/student/exams"
        >
          返回我的考试
        </Link>
        <Link
          className="border-border bg-card text-brand-strong hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          href="/student"
        >
          返回学习主页
        </Link>
      </div>
    </section>
  );
}
