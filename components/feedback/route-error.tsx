"use client";

interface RouteErrorProps {
  reset: () => void;
}

export function RouteError({ reset }: RouteErrorProps) {
  return (
    <main className="flex min-h-[55vh] items-center justify-center px-4 py-10">
      <section className="bg-card max-w-md rounded-xl border p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">页面加载失败</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          请求暂时无法完成。你可以重新加载页面；若问题持续存在，请稍后再试。
        </p>
        <button
          className="bg-primary text-primary-foreground mt-4 rounded-md px-4 py-2 text-sm font-medium"
          onClick={reset}
          type="button"
        >
          重新加载
        </button>
      </section>
    </main>
  );
}
