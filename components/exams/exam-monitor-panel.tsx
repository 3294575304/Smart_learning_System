"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { examAttendanceLabels } from "@/services/exams/monitor-state";
import type { getExamMonitor } from "@/services/exams/monitor";

type Monitor = Awaited<ReturnType<typeof getExamMonitor>>;
type Filter = "ALL" | "IN_PROGRESS" | "SUBMITTED" | "ALERT";
const filters: Record<Filter, string> = {
  ALL: "全部",
  IN_PROGRESS: "作答中",
  SUBMITTED: "已收卷",
  ALERT: "切屏超限",
};
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        hour12: false,
        timeZone: "Asia/Shanghai",
      })
    : "—";

export function ExamMonitorPanel({
  initial,
  endpoint,
}: {
  initial: Monitor;
  endpoint: string;
}) {
  const [monitor, setMonitor] = useState(initial);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    const result = await requestAssignmentApi<Monitor>(endpoint, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    });
    if (controller.signal.aborted) return;
    activeRequest.current = null;
    setBusy(false);
    if (result.success) {
      setMonitor(result.data);
      setError("");
    } else setError(result.error);
  }, [endpoint]);

  useEffect(() => {
    if (!monitor.live) return;
    const update = () => {
      if (!document.hidden) void refresh();
    };
    const interval = window.setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [monitor.live, refresh]);
  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [],
  );

  const overLimit = (row: Monitor["rows"][number]) =>
    row.switches > monitor.allowedSwitches || row.reason === "SWITCH_LIMIT";
  const received = (row: Monitor["rows"][number]) =>
    row.state === "SUBMITTED" || row.state === "AUTO_SUBMITTED";
  const rows = monitor.rows.filter(
    (row) =>
      filter === "ALL" ||
      (filter === "IN_PROGRESS" &&
        (row.state === "IN_PROGRESS" || row.state === "COLLECTING")) ||
      (filter === "SUBMITTED" && received(row)) ||
      (filter === "ALERT" && overLimit(row)),
  );
  const counts = {
    ALL: monitor.rows.length,
    IN_PROGRESS: monitor.rows.filter(
      (row) => row.state === "IN_PROGRESS" || row.state === "COLLECTING",
    ).length,
    SUBMITTED: monitor.rows.filter(received).length,
    ALERT: monitor.rows.filter(overLimit).length,
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">考生状态</h2>
          <p className="mt-1 text-sm text-slate-600">
            上次更新 {time(monitor.checkedAt)} · 允许切屏{" "}
            {monitor.allowedSwitches} 次{monitor.live && " · 每 5 秒刷新"}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="min-h-10 rounded-lg border px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50"
        >
          {busy ? "刷新中…" : "刷新状态"}
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          状态暂未更新，正在显示上次结果。{error}
        </p>
      )}
      <div className="flex flex-wrap gap-2" aria-label="考生状态筛选">
        {(Object.keys(filters) as Filter[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === filter}
            onClick={() => setFilter(item)}
            className={`min-h-10 rounded-lg border px-3 text-sm ${item === filter ? "border-sky-700 bg-sky-50 text-sky-900" : "text-slate-700 hover:bg-slate-50"}`}
          >
            {filters[item]} {counts[item]}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-700">
              <tr>
                <th className="p-3">学生</th>
                <th className="p-3">作答状态</th>
                <th className="p-3">切屏</th>
                <th className="p-3">最近同步／交卷</th>
                <th className="p-3">答卷</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-slate-600">
                      {row.studentNo ?? "—"}
                    </p>
                  </td>
                  <td className="p-3">
                    {examAttendanceLabels[row.state]}
                    {row.reason === "TIME_UP" && (
                      <p className="text-xs text-slate-600">到时收卷</p>
                    )}
                    {row.reason === "SWITCH_LIMIT" && (
                      <p className="text-xs text-rose-800">切屏超限收卷</p>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        overLimit(row) ? "font-medium text-rose-800" : ""
                      }
                    >
                      {row.switches} 次{overLimit(row) ? " · 超限" : ""}
                    </span>
                    {row.lastSwitchAt && (
                      <p className="text-xs text-slate-600">
                        {time(row.lastSwitchAt)}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    {time(row.submittedAt ?? row.lastSavedAt)}
                  </td>
                  <td className="p-3">
                    {row.submissionId ? (
                      <Link
                        className="font-medium text-sky-800 hover:underline"
                        href={`/teacher/assignments/${monitor.assignmentId}/submissions/${row.submissionId}`}
                      >
                        查看答卷
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          {monitor.rows.length ? "当前筛选下暂无考生。" : "本班暂无在读考生。"}
        </p>
      )}
      <p className="text-xs text-slate-600">
        作答状态按答卷记录判断，最近同步为服务端收到答案的时间。
      </p>
    </section>
  );
}
