"use client";

export default function RecommendationsError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-[50vh] items-center justify-center px-6">
      <section className="max-w-md text-center">
        <h1 className="text-xl font-semibold">推荐练习暂时无法加载</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          推荐服务暂时不可用，请稍后重试。你的作业和成绩不会受到影响。
        </p>
        <button
          className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          onClick={reset}
          type="button"
        >
          重新加载
        </button>
      </section>
    </main>
  );
}
