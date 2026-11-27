"use client";

import { useEffect, useState } from "react";

export function useExamTab(submissionId: string, working: boolean) {
  const [state, setState] = useState<
    "waiting" | "active" | "blocked" | "unsupported"
  >("waiting");

  useEffect(() => {
    if (!working) return;
    if (!navigator.locks?.request) {
      setState("unsupported");
      return;
    }
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const claim = () =>
      navigator.locks
        .request(
          `student-exam:${submissionId}`,
          { ifAvailable: true },
          async (lock) => {
            if (controller.signal.aborted) return;
            if (!lock) {
              setState("blocked");
              return;
            }
            setState("active");
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          },
        )
        .catch(() => {
          if (!controller.signal.aborted) setState("unsupported");
        });
    // Let a discarded effect clean up before it can acquire a lock.
    queueMicrotask(() => {
      if (!controller.signal.aborted) void claim();
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [submissionId, working]);

  return working ? state : "waiting";
}
