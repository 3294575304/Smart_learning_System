"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshOverview() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
      aria-busy={pending}
    >
      <RefreshCw
        aria-hidden="true"
        className={`size-4 ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "正在刷新…" : "刷新数据"}
    </button>
  );
}
