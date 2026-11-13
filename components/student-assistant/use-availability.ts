"use client";

import { useEffect, useState } from "react";
import { requestApi } from "@/components/courses/request-api";

const examEvent = "zhixue:student-exam-started";

export function notifyStudentExamStarted() {
  window.dispatchEvent(new Event(examEvent));
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(examEvent);
  channel.postMessage("started");
  channel.close();
}

export function useStudentAssistantAvailability(
  enabled: boolean,
  initialAvailable = false,
) {
  const [available, setAvailable] = useState(initialAvailable);
  useEffect(() => {
    if (!enabled) return;
    let pending: AbortController | undefined;
    async function refresh() {
      if (document.visibilityState === "hidden" || pending) return;
      const controller = new AbortController();
      pending = controller;
      const reply = await requestApi<{ blocked: boolean }>(
        "/api/student/study-assistant",
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      pending = undefined;
      setAvailable(reply.success && !reply.data.blocked);
    }
    function suspend() {
      pending?.abort();
      pending = undefined;
      setAvailable(false);
    }
    function visibilityChanged() {
      if (document.visibilityState === "visible") void refresh();
    }
    function examStarted() {
      suspend();
      void refresh();
    }
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(examEvent);
    channel?.addEventListener("message", examStarted);
    window.addEventListener(examEvent, examStarted);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", suspend);
    document.addEventListener("visibilitychange", visibilityChanged);
    const timer = window.setInterval(refresh, 10_000);
    void refresh();
    return () => {
      pending?.abort();
      channel?.close();
      window.removeEventListener(examEvent, examStarted);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", suspend);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.clearInterval(timer);
    };
  }, [enabled]);
  return enabled && available;
}
