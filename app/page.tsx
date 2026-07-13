export default function HomePage() {
  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-6 py-16">
      <section className="bg-card w-full max-w-2xl rounded-xl border p-8 shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">
          AI Smart Learning Platform
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">智学课堂</h1>
        <p className="text-muted-foreground mt-4 leading-7">
          项目基础架构已就绪。登录、权限和教学业务模块将在后续阶段逐步开发。
        </p>
      </section>
    </main>
  );
}
