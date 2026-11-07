"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

const REFRESH_INTERVAL_MS = 60_000;

export function DevelopmentLogsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        startTransition(() => router.refresh());
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
    >
      <RefreshCw
        aria-hidden="true"
        className={`size-4 ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "正在同步…" : "同步日志"}
    </button>
  );
}
