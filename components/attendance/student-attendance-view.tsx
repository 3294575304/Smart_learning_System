"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  RefreshCw,
} from "lucide-react";
import { AttendanceStatusBadge } from "@/components/attendance/attendance-status";
import { requestApi } from "@/components/courses/request-api";
import { NineDotPatternInput } from "@/components/attendance/nine-dot-pattern";
import { attendanceSignInState } from "@/services/student-experience/task-policy";
type RecordView = {
  id: string;
  currentStatus: string;
  signedAt: Date | null;
  session: {
    id: string;
    title: string;
    status: string;
    signInMethod: "DIRECT" | "LOCATION" | "CODE" | "GRAPHIC";
    locationRadiusMeters: number | null;
    startsAt: Date;
    signInOpensAt: Date | string;
    signInClosesAt: Date | string;
    course: { name: string };
    classroom: { name: string };
  };
  revisions: Array<{
    id: string;
    previousStatus: string;
    newStatus: string;
    reason: string | null;
  }>;
};
const labels: Record<string, string> = {
  PENDING: "未签到/待确认",
  PRESENT: "已签到",
  LATE: "迟到",
  EARLY_LEAVE: "早退",
  LEAVE: "请假",
  ABSENT: "缺勤",
};
export function StudentAttendanceView({
  initialRecords,
  courseId,
  classroomId,
  sessionId,
  rate,
  denominator,
}: {
  initialRecords: RecordView[];
  courseId?: string;
  classroomId?: string;
  sessionId?: string;
  rate?: string | null;
  denominator?: number;
}) {
  const [records, setRecords] = useState(initialRecords);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [patterns, setPatterns] = useState<Record<string, number[]>>({});
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "SIGNED">("ALL");
  const requestInFlight = useRef(false);
  const reloadRevision = useRef(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setRecords(initialRecords), [initialRecords]);
  const reload = useCallback(async () => {
    if (!sessionId) {
      setError(null);
      startRefresh(() => router.refresh());
      return;
    }
    const revision = ++reloadRevision.current;
    const attendanceUrl = `/api/student/attendance/${encodeURIComponent(sessionId)}`;
    try {
      const result = await requestApi<{
        records: RecordView[];
      }>(attendanceUrl);
      if (revision !== reloadRevision.current) return;
      if (result.success) {
        setRecords(result.data.records);
        setError(null);
      } else {
        if (sessionId) setRecords([]);
        setError("记录更新失败，请点击刷新记录重试。" + result.error);
      }
    } catch {
      if (revision === reloadRevision.current)
        setError("记录更新失败，请检查网络后重试。");
    }
  }, [router, sessionId, startRefresh]);
  useEffect(() => {
    const refresh = () => {
      if (!requestInFlight.current && document.visibilityState === "visible")
        void reload();
    };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);
  async function sign(
    sessionId: string,
    proof:
      | { method: "DIRECT" }
      | { method: "LOCATION" }
      | { method: "CODE"; code: string }
      | { method: "GRAPHIC"; pattern: number[] },
  ) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    reloadRevision.current += 1;
    setPending(sessionId);
    setError(null);
    setNotice(null);
    try {
      let signInProof: unknown = proof;
      if (proof.method === "LOCATION") {
        if (!navigator.geolocation) {
          setError("当前浏览器不支持定位签到。");
          return;
        }
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              resolve,
              (error) =>
                reject(
                  new Error(
                    error.code === error.PERMISSION_DENIED
                      ? "请允许浏览器使用定位后重试。"
                      : error.code === error.POSITION_UNAVAILABLE
                        ? "无法获取当前位置，请检查设备定位设置。"
                        : "定位超时，请重试。",
                  ),
                ),
              {
                enableHighAccuracy: true,
                timeout: 15_000,
                maximumAge: 0,
              },
            ),
        );
        signInProof = {
          method: "LOCATION",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        };
      }
      const response = await requestApi<{
        record: { currentStatus: string; signedAt: Date | string | null };
      }>(`/api/student/attendance/${encodeURIComponent(sessionId)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signInProof),
      });
      if (!response.success) {
        setError(response.error);
        return;
      }
      setNotice("签到成功。");
      setRecords((current) =>
        current.map((record) =>
          record.session.id === sessionId
            ? {
                ...record,
                currentStatus: response.data.record.currentStatus,
                signedAt: response.data.record.signedAt
                  ? new Date(response.data.record.signedAt)
                  : null,
              }
            : record,
        ),
      );
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "签到失败，请重试。");
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  }
  const availableRecords = records.filter(
    (record) =>
      now > 0 &&
      record.currentStatus === "PENDING" &&
      attendanceSignInState(record.session, new Date(now)) === "AVAILABLE",
  );
  const signedRecords = records.filter(
    (record) =>
      record.session.status !== "CANCELLED" &&
      ["PRESENT", "LATE"].includes(record.currentStatus),
  );
  const availableIds = new Set(availableRecords.map((record) => record.id));
  const visibleRecords = (
    filter === "AVAILABLE"
      ? availableRecords
      : filter === "SIGNED"
        ? signedRecords
        : records
  )
    .slice()
    .sort(
      (a, b) => Number(availableIds.has(b.id)) - Number(availableIds.has(a.id)),
    );
  const formatTime = (value: Date | string) =>
    new Date(value).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return (
    <div className="space-y-5">
      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {notice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {!sessionId && rate !== undefined && denominator !== undefined && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">出勤汇总</h2>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {rate === null ? "暂无已完成的有效课堂" : `${rate}%`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            请假和取消场次不进入分母；共 {denominator} 次有效课堂。
          </p>
        </div>
      )}
      <section aria-label="签到记录" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {sessionId ? (
            <h2 className="text-sm font-medium text-slate-600">本次签到</h2>
          ) : (
            <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(
                [
                  ["ALL", "全部记录", records.length],
                  ["AVAILABLE", "待签到", availableRecords.length],
                  ["SIGNED", "已出勤", signedRecords.length],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-sky-600 ${filter === value ? "bg-sky-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
                >
                  {label}
                  <span className="ml-1.5 opacity-75">{count}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={pending !== null || refreshing}
            onClick={() => {
              if (requestInFlight.current) return;
              requestInFlight.current = true;
              setPending("refresh");
              void reload().finally(() => {
                requestInFlight.current = false;
                setPending(null);
              });
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${pending === "refresh" || refreshing ? "animate-spin" : ""}`}
            />
            {pending === "refresh" || refreshing ? "刷新中…" : "刷新记录"}
          </button>
        </div>
        {visibleRecords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
            <CalendarCheck2
              aria-hidden="true"
              className="mx-auto mb-3 size-9 text-slate-300"
            />
            <p className="text-sm font-medium text-slate-600">
              {filter === "AVAILABLE"
                ? "当前没有待签到课堂"
                : filter === "SIGNED"
                  ? "还没有已确认的出勤记录"
                  : courseId && classroomId
                    ? "本班暂无签到记录"
                    : "暂无签到记录"}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              教师发布签到后，通知与记录会自动更新。
            </p>
          </div>
        ) : (
          visibleRecords.map((record) => {
            const active = availableIds.has(record.id);
            const cancelled = record.session.status === "CANCELLED";
            return (
              <article
                id={`attendance-${record.session.id}`}
                key={record.id}
                className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-white shadow-sm transition ${active ? "border-sky-300 ring-1 ring-sky-100" : "border-slate-200"}`}
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        <CalendarCheck2 aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-slate-900">
                          {record.session.title}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.session.course.name} ·{" "}
                          {record.session.classroom.name}
                        </p>
                      </div>
                    </div>
                    <AttendanceStatusBadge
                      status={cancelled ? "CANCELLED" : record.currentStatus}
                      label={
                        cancelled
                          ? "已取消"
                          : active
                            ? "待签到"
                            : labels[record.currentStatus]
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600 sm:grid-cols-3">
                    <div>
                      <p className="mb-1 text-slate-400">开放时间</p>
                      <p className="inline-flex items-center gap-1.5">
                        <Clock3 aria-hidden="true" className="size-3.5" />
                        {formatTime(record.session.signInOpensAt)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-slate-400">截止时间</p>
                      <p>{formatTime(record.session.signInClosesAt)}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-slate-400">签到方式</p>
                      <p>
                        {record.session.signInMethod === "DIRECT"
                          ? "普通签到"
                          : record.session.signInMethod === "LOCATION"
                            ? `位置签到 · ${record.session.locationRadiusMeters ?? "—"} 米内`
                            : record.session.signInMethod === "CODE"
                              ? "签到码签到"
                              : "九点阵图形签到"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 text-sm">
                    {now > 0 &&
                    attendanceSignInState(record.session, new Date(now)) ===
                      "AVAILABLE" &&
                    record.currentStatus === "PENDING" ? (
                      record.session.signInMethod === "DIRECT" ? (
                        <button
                          className="mt-2 rounded-lg bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                          type="button"
                          disabled={pending !== null}
                          onClick={() =>
                            void sign(record.session.id, { method: "DIRECT" })
                          }
                        >
                          {pending === record.session.id
                            ? "签到中…"
                            : "立即签到"}
                        </button>
                      ) : record.session.signInMethod === "LOCATION" ? (
                        <div className="mt-2">
                          <button
                            className="rounded-lg bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                            type="button"
                            disabled={pending !== null}
                            onClick={() =>
                              void sign(record.session.id, {
                                method: "LOCATION",
                              })
                            }
                          >
                            {pending === record.session.id
                              ? "定位并签到中…"
                              : "使用当前位置签到"}
                          </button>
                          <p className="mt-1 max-w-xs text-xs text-slate-500">
                            需在教师发布位置的{" "}
                            {record.session.locationRadiusMeters ?? "—"}{" "}
                            米范围内；定位只用于本次核验。
                          </p>
                        </div>
                      ) : record.session.signInMethod === "CODE" ? (
                        <form
                          className="mt-2 flex flex-wrap justify-start gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void sign(record.session.id, {
                              method: "CODE",
                              code: codes[record.session.id] ?? "",
                            });
                          }}
                        >
                          <input
                            aria-label="签到码"
                            autoComplete="off"
                            value={codes[record.session.id] ?? ""}
                            onChange={(event) =>
                              setCodes({
                                ...codes,
                                [record.session.id]: event.target.value,
                              })
                            }
                            minLength={4}
                            maxLength={12}
                            pattern="[A-Za-z0-9]{4,12}"
                            required
                            placeholder="输入签到码"
                            className="min-w-36 rounded-md border px-3 py-2 text-sm"
                          />
                          <button
                            className="rounded-lg bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                            type="submit"
                            disabled={pending !== null}
                          >
                            {pending === record.session.id
                              ? "签到中…"
                              : "提交签到码"}
                          </button>
                        </form>
                      ) : (
                        <form
                          className="mt-2 space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void sign(record.session.id, {
                              method: "GRAPHIC",
                              pattern: patterns[record.session.id] ?? [],
                            });
                          }}
                        >
                          <p className="text-xs text-slate-500">
                            按照教师展示的图形，在九点阵上依次连接至少 4 个点。
                          </p>
                          <NineDotPatternInput
                            value={patterns[record.session.id] ?? []}
                            onChange={(pattern) =>
                              setPatterns({
                                ...patterns,
                                [record.session.id]: pattern,
                              })
                            }
                            disabled={pending !== null}
                            label="绘制签到图形"
                          />
                          <button
                            className="w-full rounded-lg bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                            type="submit"
                            disabled={
                              pending !== null ||
                              (patterns[record.session.id]?.length ?? 0) < 4
                            }
                          >
                            {pending === record.session.id
                              ? "签到中…"
                              : "确认图形签到"}
                          </button>
                        </form>
                      )
                    ) : record.currentStatus === "PENDING" && now > 0 ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {cancelled
                          ? "本次签到已取消"
                          : record.session.status === "SCHEDULED"
                            ? "等待教师开放签到"
                            : attendanceSignInState(
                                  record.session,
                                  new Date(now),
                                ) === "UPCOMING"
                              ? "尚未到签到时间"
                              : "签到已结束"}
                      </p>
                    ) : null}

                    {record.signedAt && !cancelled && (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                        <CheckCircle2 aria-hidden="true" className="size-3.5" />
                        已于 {formatTime(record.signedAt)} 完成签到
                      </p>
                    )}
                  </div>
                </div>
                {record.revisions.length > 0 && (
                  <details className="group border-t border-slate-100 bg-slate-50/50 text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-xs font-medium text-slate-500 [&::-webkit-details-marker]:hidden">
                      <History aria-hidden="true" className="size-3.5" />
                      变更记录 · {record.revisions.length} 条
                      <ChevronDown
                        aria-hidden="true"
                        className="ml-auto size-4 transition group-open:rotate-180"
                      />
                    </summary>
                    <ol className="space-y-3 px-5 pb-4">
                      {record.revisions.map((revision) => (
                        <li
                          key={revision.id}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <p className="text-xs font-medium text-slate-700">
                            {labels[revision.previousStatus]} →{" "}
                            {labels[revision.newStatus]}
                          </p>
                          {revision.reason && (
                            <p className="mt-1 text-xs text-slate-500">
                              {revision.reason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
