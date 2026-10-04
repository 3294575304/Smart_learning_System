"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Read-only task pages stay current when a survey opens or the teacher publishes one. */
export function SurveyAvailabilityRefresh({ at }: { at?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let lastRefreshAt = 0;
    const refresh = () => {
      if (
        document.visibilityState === "hidden" ||
        Date.now() - lastRefreshAt < 1000
      )
        return;
      lastRefreshAt = Date.now();
      router.refresh();
    };
    const interval = window.setInterval(refresh, 30_000);
    const boundary = at ? Date.parse(at) : NaN;
    const timeout = Number.isFinite(boundary)
      ? window.setTimeout(
          refresh,
          Math.min(2_147_483_647, Math.max(0, boundary - Date.now() + 250)),
        )
      : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [at, router]);
  return null;
}
