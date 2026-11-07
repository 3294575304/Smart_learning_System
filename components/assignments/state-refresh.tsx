"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNMENT_STATE_REVISION } from "@/components/dashboard/teacher-workspace-refresh";

/** Browser back may restore an old document without fetching server state. */
export function AssignmentStateRefresh({
  judging = false,
  renderedAt,
}: {
  judging?: boolean;
  renderedAt: number;
}) {
  const router = useRouter();
  const revision = useRef<string | null>(null);
  const synchronized = useRef<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        return localStorage.getItem(ASSIGNMENT_STATE_REVISION);
      } catch {
        return null;
      }
    };
    revision.current = read();
    // Cached App Router pages can mount after the mutation event already fired.
    const current = revision.current;
    if (
      current &&
      Number(current.split(":")[0]) > renderedAt &&
      synchronized.current !== current
    ) {
      synchronized.current = current;
      router.refresh();
    }
    const refresh = () => {
      const next = read();
      if (next !== revision.current) {
        revision.current = next;
        router.refresh();
      }
    };
    const page = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
      else refresh();
    };
    window.addEventListener("pageshow", page);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    const timer = judging
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") router.refresh();
        }, 5000)
      : undefined;
    return () => {
      window.removeEventListener("pageshow", page);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      if (timer !== undefined) clearInterval(timer);
    };
  }, [router, judging, renderedAt]);
  return null;
}
