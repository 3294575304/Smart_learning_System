"use client";

interface RouteErrorProps {
  reset: () => void;
}

export function RouteError({ reset }: RouteErrorProps) {
  return (
    <main className="flex min-h-[50vh] items-center justify-center px-6">
      <section className="text-center">
        <h1 className="text-xl font-semibold">页面加载失败</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          请求暂时无法完成，请稍后重试。
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
