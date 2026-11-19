"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { AnswerSheet } from "@/components/assignments/answer-sheet";
import type { getStudentExamAttemptStatus } from "@/services/exams/service";
import type { AutosaveAnswersData } from "@/services/assignments/schemas";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { examAutoSubmitEndpoint, examExitBody } from "./exam-exit";
import { formatExamRemaining } from "./exam-clock";
import {
  createExamSwitchTracker,
  type CountedExamSwitch,
} from "./exam-switch-tracker";
import { useExamTab } from "./use-exam-tab";

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
  const exitSnapshot = useRef<(() => AutosaveAnswersData | undefined) | null>(
    null,
  );
  const exitSent = useRef(false);
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
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState("");
  const [switchNotice, setSwitchNotice] = useState<{
    kind: CountedExamSwitch;
    pending: boolean;
  } | null>(null);
  const [fullscreenGate, setFullscreenGate] = useState(false);
  const [gateDismissed, setGateDismissed] = useState(false);
  const autoFullscreenTried = useRef(false);
  const pendingSwitches = useRef<
    Array<{ eventKey: string; kind: CountedExamSwitch }>
  >([]);
  const startedFullscreen = useRef(false);
  const fullscreenRequest = useRef(0);
  const timer = useRef<HTMLElement>(null);
  const tab = useExamTab(submissionId, initial.state === "WORKING");
  const ownsAttempt = tab === "active" || tab === "unsupported";
  const locked =
    closed ||
    remaining === 0 ||
    collecting ||
    switches > initial.allowedSwitches;
  const focusActive = ownsAttempt && !locked;

  useEffect(() => {
    if (!focusActive) return;
    const root = document.documentElement;
    const request = fullscreenRequest;
    root.setAttribute("data-exam-focus", "");
    return () => {
      request.current++;
      root.removeAttribute("data-exam-focus");
      if (startedFullscreen.current && document.fullscreenElement === root)
        void document.exitFullscreen().catch(() => undefined);
      startedFullscreen.current = false;
    };
  }, [focusActive]);

  /*
   * 全屏守卫：进入考试后若不在全屏，用遮罩拦住答题区，但不暂停计时。
   * 只看「现在是不是全屏」，不区分退出方式——F11 不触发 fullscreenchange，
   * 只能靠轮询兜住。浏览器不支持全屏时（fullscreenEnabled=false）不拦截。
   */
  useEffect(() => {
    if (!focusActive || initial.state !== "WORKING") {
      setFullscreenGate(false);
      return;
    }
    const evaluate = () => {
      const active =
        document.fullscreenElement === document.documentElement;
      setFullscreen(active);
      setFullscreenGate(
        Boolean(document.fullscreenEnabled) && !active && !document.hidden,
      );
    };
    evaluate();
    document.addEventListener("fullscreenchange", evaluate);
    window.addEventListener("resize", evaluate);
    const interval = window.setInterval(evaluate, 2_000);
    return () => {
      document.removeEventListener("fullscreenchange", evaluate);
      window.removeEventListener("resize", evaluate);
      window.clearInterval(interval);
    };
  }, [focusActive, initial.state]);

  // 尽力自动进入全屏；无用户手势时浏览器会拒绝，此时交给遮罩按钮。
  useEffect(() => {
    if (!fullscreenGate || autoFullscreenTried.current) return;
    autoFullscreenTried.current = true;
    const request = document.documentElement.requestFullscreen?.();
    if (request) void request.catch(() => undefined);
  }, [fullscreenGate]);

  // 考试进行中刷新或关闭页面时给出浏览器原生确认。
  useEffect(() => {
    if (initial.state !== "WORKING" || closed || collecting) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [initial.state, closed, collecting]);

  async function toggleFullscreen() {
    if (fullscreen) {
      await document.exitFullscreen().catch(() => {
        setFullscreenNotice("暂时无法退出全屏，请使用浏览器的退出全屏操作。");
      });
      return;
    }
    const requestId = ++fullscreenRequest.current;
    setFullscreenNotice("");
    const root = document.documentElement;
    try {
      if (!document.fullscreenEnabled || !root.requestFullscreen)
        throw new Error("Fullscreen unavailable");
      await root.requestFullscreen();
      if (fullscreenRequest.current !== requestId) {
        if (document.fullscreenElement === root)
          await document.exitFullscreen();
        return;
      }
      startedFullscreen.current = true;
      setFullscreen(document.fullscreenElement === root);
      timer.current?.focus({ preventScroll: true });
    } catch {
      if (fullscreenRequest.current === requestId)
        setFullscreenNotice(
          "浏览器无法开启全屏。已启用专注模式，可以继续作答。",
        );
    }
  }

  async function submitOnExit(): Promise<string | null> {
    const result = await requestAssignmentApi<{ id: string }>(
      examAutoSubmitEndpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: examExitBody(submissionId),
      },
    );
    if (!result.success) return result.error;
    exitSent.current = true;
    return null;
  }

  useEffect(() => {
    if (
      !initial.autoSubmitOnExit ||
      !ownsAttempt ||
      initial.state !== "WORKING" ||
      closed ||
      collecting
    )
      return;
    const answerPath = window.location.pathname;

    function collectOnLeave() {
      if (exitSent.current) return;
      exitSent.current = true;
      const body = examExitBody(submissionId, exitSnapshot.current?.());
      if (
        navigator.sendBeacon?.(
          examAutoSubmitEndpoint,
          new Blob([body], { type: "application/json" }),
        )
      )
        return;
      void fetch(examAutoSubmitEndpoint, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).then(
        (response) => {
          if (!response.ok) exitSent.current = false;
        },
        () => {
          exitSent.current = false;
        },
      );
    }

    function routeChanged() {
      if (window.location.pathname !== answerPath) collectOnLeave();
    }

    window.addEventListener("pagehide", collectOnLeave);
    window.addEventListener("popstate", routeChanged);
    return () => {
      window.removeEventListener("pagehide", collectOnLeave);
      window.removeEventListener("popstate", routeChanged);
      routeChanged();
    };
  }, [
    initial.autoSubmitOnExit,
    initial.state,
    closed,
    collecting,
    ownsAttempt,
    submissionId,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const queue = pendingSwitches.current;
    const tracker = createExamSwitchTracker();
    let status = initial;
    let anchor = performance.now();
    let nextSync = 0;
    let nextRequest = 0;
    let busy = false;
    let finished = false;
    let leavingDocument = false;
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
      exitSent.current = true;
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
      if (finished || leavingDocument || controller.signal.aborted) return;
      const seconds = secondsLeft();
      setRemaining(seconds);
      setOnline(navigator.onLine);
      if (busy || !navigator.onLine || performance.now() < nextRequest) return;
      if (
        (!ownsAttempt || seconds > 0) &&
        queue.length === 0 &&
        performance.now() < nextSync &&
        status.switches <= status.allowedSwitches
      )
        return;
      busy = true;
      try {
        if ((ownsAttempt && seconds === 0) || performance.now() >= nextSync) {
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

        if (
          ownsAttempt &&
          (secondsLeft() === 0 || status.switches > status.allowedSwitches)
        ) {
          setCollecting(true);
          const response = await request("auto-submit", {});
          if (controller.signal.aborted) return;
          if (!response.ok) throw new Error("交卷暂未确认");
          collect();
          return;
        }

        while (ownsAttempt && queue.length > 0 && secondsLeft() > 0) {
          const entry = queue[0];
          const response = await request("switch", entry);
          if (!response.ok) {
            nextSync = 0;
            throw new Error("切屏记录暂未确认");
          }
          const payload: { data: { count: number; shouldSubmit: boolean } } =
            await response.json();
          if (controller.signal.aborted) return;
          queue.shift();
          status = { ...status, switches: payload.data.count };
          setSwitches(status.switches);
          if (queue.length === 0)
            setSwitchNotice({ kind: entry.kind, pending: false });
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

    function queueSwitch(kind: CountedExamSwitch | undefined) {
      if (
        !kind ||
        !ownsAttempt ||
        finished ||
        leavingDocument ||
        secondsLeft() === 0
      )
        return;
      queue.push({ eventKey: crypto.randomUUID(), kind });
      setSwitchNotice({ kind, pending: true });
    }

    function visibilityChanged() {
      if (document.hidden) queueSwitch(tracker.hide());
      else {
        queueSwitch(tracker.resume(performance.now(), document.hasFocus()));
        reconnect();
      }
    }

    function recordFullscreenExit() {
      if (!ownsAttempt || finished || leavingDocument || secondsLeft() === 0)
        return;
      void request("switch", {
        kind: "FULLSCREEN_EXIT",
        eventKey: crypto.randomUUID(),
      }).catch(() => undefined);
    }

    function blurred() {
      tracker.blur(performance.now());
    }

    function focused() {
      queueSwitch(tracker.resume(performance.now(), !document.hidden));
      void tick();
    }

    function fullscreenChanged() {
      if (document.fullscreenElement === document.documentElement) return;
      setFullscreen(false);
      if (!startedFullscreen.current) return;
      startedFullscreen.current = false;
      setFullscreenNotice("已回到浏览器内的专注作答，考试继续计时。");
      recordFullscreenExit();
    }

    function pageHidden() {
      leavingDocument = true;
    }

    function pageRestored() {
      leavingDocument = false;
      reconnect();
    }

    if (initial.state === "COLLECTED") collect();
    else if (initial.state === "CLOSED") finished = true;
    const interval = window.setInterval(() => void tick(), 1000);
    void tick();
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", tick);
    window.addEventListener("pagehide", pageHidden);
    window.addEventListener("pageshow", pageRestored);
    window.addEventListener("blur", blurred);
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", visibilityChanged);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", tick);
      window.removeEventListener("pagehide", pageHidden);
      window.removeEventListener("pageshow", pageRestored);
      window.removeEventListener("blur", blurred);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", visibilityChanged);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
    };
  }, [initial, ownsAttempt, resultHref, router, submissionId]);

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
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm text-slate-800">
      <strong
        ref={timer}
        role="timer"
        tabIndex={-1}
        className={
          remaining < 300
            ? "text-rose-800 tabular-nums"
            : remaining <= 600
              ? "text-amber-800 tabular-nums"
              : "text-sky-900 tabular-nums"
        }
      >
        考试倒计时 {formatExamRemaining(remaining)}
      </strong>
      <span role="status">
        {remaining > 0 && remaining <= 600
          ? remaining < 300
            ? "剩余不到 5 分钟"
            : "剩余 10 分钟以内"
          : ""}
      </span>
      <span>
        切屏 {switches}/{initial.allowedSwitches}
      </span>
      {initial.autoSubmitOnExit && <span>离开作答页将自动交卷</span>}
      {ownsAttempt && !locked && (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="min-h-9 rounded-md border border-sky-200 px-3 font-medium text-sky-900 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
        >
          {fullscreen ? "退出浏览器全屏" : "浏览器全屏"}
        </button>
      )}
      <span role="status">{message}</span>
      <span role="status">{!locked ? fullscreenNotice : ""}</span>
      <div
        role="status"
        className={
          switchNotice
            ? "w-full rounded-md bg-amber-50 px-3 py-2 text-amber-950"
            : "sr-only"
        }
      >
        {switchNotice &&
          (switchNotice.pending
            ? online && !connectionError
              ? "检测到离开考试页面，正在同步切屏记录。"
              : "切屏记录待同步。网络恢复后会自动重试。"
            : `${switchNotice.kind === "WINDOW_SWITCH" ? "考试窗口持续失焦" : "考试页面进入后台"}，已记 1 次切屏。${switches > initial.allowedSwitches ? "已超过上限，正在交卷。" : `当前 ${switches}/${initial.allowedSwitches} 次。${switches === initial.allowedSwitches ? "再次切屏将自动交卷。" : ""}`}`)}
      </div>
      {tab === "unsupported" && !locked && (
        <p>当前浏览器无法限制重复标签页，请只保留一个作答页。</p>
      )}
    </div>
  );
  if (!ownsAttempt && initial.state === "WORKING" && !closed) {
    return (
      <section className="space-y-4">
        {banner}
        <div className="space-y-3 rounded-lg border border-sky-200 bg-white p-5">
          <p role="status">
            {tab === "blocked"
              ? "这份答卷已在其他标签页打开。请回到原标签页；如果原页已关闭，可重新检查。考试计时继续。"
              : "正在检查此答卷是否已在其他标签页打开。"}
          </p>
          {tab === "blocked" && (
            <button
              type="button"
              className="rounded-md border border-sky-200 px-3 py-2 text-sky-900"
              onClick={() => window.location.reload()}
            >
              重新检查
            </button>
          )}
        </div>
      </section>
    );
  }
  const showFullscreenGate =
    fullscreenGate && !gateDismissed && ownsAttempt && !locked;
  return (
    <>
      <AnswerSheet
        {...answerSheet}
        exam
        examLocked={locked}
        banner={banner}
        examExit={initial.autoSubmitOnExit ? submitOnExit : undefined}
        examExitSnapshot={initial.autoSubmitOnExit ? exitSnapshot : undefined}
      />
      {showFullscreenGate && (
        <div
          aria-labelledby="exam-fullscreen-gate-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-6 text-slate-900 shadow-lg">
            <h2
              className="text-lg font-semibold"
              id="exam-fullscreen-gate-title"
            >
              进入考试全屏
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              本场考试需在全屏状态下作答。倒计时已经开始，剩余{" "}
              <strong className="tabular-nums">
                {formatExamRemaining(remaining)}
              </strong>
              ，全屏与否都不会暂停计时。
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              已记录切屏 {switches}/{initial.allowedSwitches} 次。
              {initial.autoSubmitOnExit
                ? "离开作答页会自动交卷。"
                : "退出时保留已保存的作答。"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="min-h-11 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                onClick={() => void toggleFullscreen()}
                type="button"
              >
                进入全屏继续作答
              </button>
              <button
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                onClick={() => setGateDismissed(true)}
                type="button"
              >
                无法全屏，继续作答
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              若浏览器拦截了全屏，可点上方按钮重试；仍失败时选择继续作答，本次会记录为未开启全屏。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
