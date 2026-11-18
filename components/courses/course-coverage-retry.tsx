"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CourseCoverageRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="mt-3 min-h-10 rounded-md border px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "正在重试…" : "重试统计"}
    </button>
  );
}
