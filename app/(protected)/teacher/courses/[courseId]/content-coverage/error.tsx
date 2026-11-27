"use client";

import Link from "next/link";

/**
 * 内容覆盖自检的局部错误边界。
 * 不用全局错误页：这张表是备课中的一个环节，教师需要"就地重试"或"退回课程"，
 * 而不是被扔到站点级错误页再自己找回去。
 */
export default function CourseContentCoverageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="border-line bg-card rounded-xl border p-6">
      <h1 className="text-ink text-[18px] font-semibold">
        内容覆盖自检加载失败
      </h1>
      <p className="text-ink-soft mt-2 max-w-[60ch] text-sm leading-6">
        统计暂时无法完成。可以重新统计；若持续失败，请稍后再试，或先返回课程继续其它工作。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="bg-primary text-primary-foreground min-h-10 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={reset}
          type="button"
        >
          重新统计
        </button>
        <Link
          className="border-line bg-card text-ink-body hover:bg-muted inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          href="/teacher/courses"
          prefetch={false}
        >
          返回课程
        </Link>
      </div>
    </section>
  );
}
