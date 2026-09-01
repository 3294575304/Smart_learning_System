import { after } from "next/server";

function wakeUrl() {
  const configured = process.env.BACKGROUND_LONG_TASK_WORKER_WAKE_URL?.trim();
  return configured || null;
}

export function scheduleBackgroundWorkerWakeup() {
  const url = wakeUrl();
  const secret = process.env.BACKGROUND_JOB_WORKER_SECRET?.trim();
  if (!url || !secret) return;
  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(1_000),
      });
    } catch {
      // Polling the persistent queue remains the source of reliability.
    }
  });
}
