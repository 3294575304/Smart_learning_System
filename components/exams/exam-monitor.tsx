"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { AnswerSheet } from "@/components/assignments/answer-sheet";
import type { getStudentExamAttemptStatus } from "@/services/exams/service";

type AttemptStatus = Awaited<ReturnType<typeof getStudentExamAttemptStatus>>;
const pollIntervalMs = 30_000;
const retryIntervalMs = 5_000;

export function ExamMonitor({
  initial,
  resultHref,
  answerSheet,
}: {
  initial: AttemptStatus;
  resultHref: string;
  answerSheet: ComponentProps<typeof AnswerSheet>;
}) {
  const router = useRouter();
  const submissionId = answerSheet.submission.id;
  const [remaining, setRemaining] = useState(() =>
    Math.max(
      0,
      Math.ceil(
        (Date.parse(initial.endsAt) - Date.parse(initial.serverNow)) / 1000,
      ),
    ),
  );
  const [switches, setSwitches] = useState(initial.switches);
  const [closed, setClosed] = useState(initial.state === "CLOSED");
  const [collecting, setCollecting] = useState(initial.state === "COLLECTED");
  const [online, setOnline] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const pendingSwitches: string[] = [];
    let status = initial;
    let anchor = performance.now();
    let nextSync = 0;
    let nextRequest = 0;
    let busy = false;
    let finished = false;
    const secondsLeft = () =>
      Math.max(
        0,
        Math.ceil(
          (Date.parse(status.endsAt) -
            Date.parse(status.serverNow) -
            (performance.now() - anchor)) /
            1000,
        ),
      );
    const collect = () => {
      finished = true;
      setCollecting(true);
      router.replace(resultHref);
    };
    const request = (path: string, payload?: object) =>
      fetch(`/api/student/exams/${path}`, {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]),
        ...(payload && {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId, ...payload }),
        }),
      });

    async function tick() {
      if (finished || controller.signal.aborted) return;
      const seconds = secondsLeft();
      setRemaining(seconds);
      setOnline(navigator.onLine);
      if (busy || !navigator.onLine || performance.now() < nextRequest) return;
      if (
        seconds > 0 &&
        pendingSwitches.length === 0 &&
        performance.now() < nextSync &&
        status.switches <= status.allowedSwitches
      )
        return;
      busy = true;
      try {
        if (seconds === 0 || performance.now() >= nextSync) {
          const response = await request(
            `status?${new URLSearchParams({ submissionId })}`,
          );
          if (!response.ok) throw new Error("考试状态暂未确认");
          const payload: { data: AttemptStatus } = await response.json();
          if (controller.signal.aborted) return;
          status = payload.data;
          anchor = performance.now();
          nextSync = anchor + pollIntervalMs;
          setRemaining(secondsLeft());
          setSwitches(status.switches);
          if (status.state === "COLLECTED") {
            collect();
            return;
          }
          if (status.state === "CLOSED") {
            finished = true;
            setClosed(true);
            return;
          }
        }

        if (secondsLeft() === 0 || status.switches > status.allowedSwitches) {
          setCollecting(true);
          const response = await request("auto-submit", {});
          if (controller.signal.aborted) return;
          if (!response.ok) throw new Error("交卷暂未确认");
          collect();
          return;
        }

        while (pendingSwitches.length > 0 && secondsLeft() > 0) {
          const response = await request("switch", {
            eventKey: pendingSwitches[0],
          });
          if (!response.ok) {
            nextSync = 0;
            throw new Error("切屏记录暂未确认");
          }
          const payload: { data: { count: number; shouldSubmit: boolean } } =
            await response.json();
          if (controller.signal.aborted) return;
          pendingSwitches.shift();
          status = { ...status, switches: payload.data.count };
          setSwitches(status.switches);
          if (payload.data.shouldSubmit) {
            collect();
            return;
          }
        }
        setConnectionError(false);
      } catch {
        if (!controller.signal.aborted) {
          setConnectionError(true);
          nextRequest = performance.now() + retryIntervalMs;
        }
      } finally {
        busy = false;
      }
    }

    function reconnect() {
      nextSync = 0;
      nextRequest = 0;
      void tick();
    }

    function visibilityChanged() {
      if (document.visibilityState === "hidden") {
        if (!finished && secondsLeft() > 0)
          pendingSwitches.push(crypto.randomUUID());
        void tick();
      } else {
        reconnect();
      }
    }

    if (initial.state === "COLLECTED") collect();
    else if (initial.state === "CLOSED") finished = true;
    const interval = window.setInterval(() => void tick(), 1000);
    void tick();
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", tick);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", tick);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [initial, resultHref, router, submissionId]);

  const locked =
    closed ||
    remaining === 0 ||
    collecting ||
    switches > initial.allowedSwitches;
  const message = closed
    ? "本场作答已关闭。"
    : locked
      ? online && !connectionError
        ? "正在确认收卷，截止前同步到账号的答案将计入本次考试。"
        : "正在等待服务端确认收卷。恢复连接后会自动重试，请保持页面打开。"
      : !online || connectionError
        ? "暂时无法同步考试状态，恢复连接后会自动校准。"
        : switches > 0
          ? "切屏次数超过上限后将自动交卷。"
          : "";

  const banner = (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <strong className="tabular-nums">
        考试倒计时 {Math.floor(remaining / 60)}:
        {String(remaining % 60).padStart(2, "0")}
      </strong>
      <span>
        切屏 {switches}/{initial.allowedSwitches}
      </span>
      {message && <p role="status">{message}</p>}
    </div>
  );
  return (
    <AnswerSheet {...answerSheet} exam examLocked={locked} banner={banner} />
  );
}
