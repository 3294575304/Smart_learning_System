import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="text-center">
        <p className="text-muted-foreground text-sm font-medium">404</p>
        <h1 className="mt-2 text-2xl font-semibold">资源不存在</h1>
        <p className="text-muted-foreground mt-2">
          资源不存在，或当前账号无权查看。
        </p>
        <Link className="mt-6 inline-block underline" href="/dashboard">
          返回工作台
        </Link>
      </section>
    </main>
  );
}
