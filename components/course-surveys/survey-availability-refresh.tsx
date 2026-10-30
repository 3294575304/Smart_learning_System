"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { bindAvailabilityRefresh } from "./availability-refresh-lifecycle";

/** Read-only task pages stay current when a survey opens or the teacher publishes one. */
export function SurveyAvailabilityRefresh({ at }: { at?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    return bindAvailabilityRefresh(at, () => router.refresh(), {
      now: () => Date.now(),
      hidden: () => document.visibilityState === "hidden",
      every(callback, delay) {
        const timer = window.setInterval(callback, delay);
        return () => window.clearInterval(timer);
      },
      after(callback, delay) {
        const timer = window.setTimeout(callback, delay);
        return () => window.clearTimeout(timer);
      },
      focus: window,
      visibility: document,
    });
  }, [at, router]);
  return null;
}
