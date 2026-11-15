"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  AttendanceStatusButton,
  AttendanceStatusOptions,
} from "@/components/attendance/attendance-status";

import { EditorDialog } from "@/components/assignments/editor-dialog";
import {
  NineDotPatternDisplay,
  NineDotPatternInput,
} from "@/components/attendance/nine-dot-pattern";
import {
  attendanceMethodLabels,
  requestAttendanceApi,
  sessionLabels,
  type AttendanceSessionRow,
  type AttendanceRecordRow,
  type AttendanceWorkspaceData,
} from "@/components/courses/attendance-client";
import { withClassroomQuery } from "@/lib/course-classroom";
import { correctAttendanceRecordSchema } from "@/services/attendance/schemas";

type SignInMethod = "DIRECT" | "LOCATION" | "CODE" | "GRAPHIC";
type SignInSettings = {
  method: SignInMethod;
  radiusMeters: number;
  code: string;
  pattern: number[];
};
type PublisherLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};
type ChallengeSnapshot = {
  sessionId: string;
  method: "CODE" | "GRAPHIC";
  code?: string;
  pattern?: number[];
};

function readBrowserPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("当前浏览器不支持定位，请更换浏览器后重试。"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "请允许浏览器使用定位后再发布位置签到。"
              : error.code === error.POSITION_UNAVAILABLE
                ? "无法获取发布者当前位置，请检查设备定位设置。"
                : "获取发布者位置超时，请重试。",
          ),
        ),
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  });
}

async function readPublisherLocation(radiusMeters: number) {
  const position = await readBrowserPosition();
  if (position.coords.accuracy > Math.min(100, radiusMeters))
    throw new Error(
      "发布者定位精度不足以满足当前签到距离，请开启精确定位后重试。",
    );
  return {
    locationLatitude: position.coords.latitude,
    locationLongitude: position.coords.longitude,
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function CourseCheckInWorkspace({
  courseId,
  classroom,
}: {
  courseId: string;
  classroom: { id: string; name: string };
}) {
  const [data, setData] = useState<AttendanceWorkspaceData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SignInSettings>({
    method: "DIRECT",
    radiusMeters: 100,
    code: "",
    pattern: [],
  });
  const [draftSettings, setDraftSettings] = useState(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publisherLocation, setPublisherLocation] =
    useState<PublisherLocation | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeSnapshot | null>(null);
  const [challengeSettingsOpen, setChallengeSettingsOpen] = useState(false);
  const [challengeCode, setChallengeCode] = useState("");
  const [challengePattern, setChallengePattern] = useState<number[]>([]);
  const [editing, setEditing] = useState<{
    record: AttendanceRecordRow;
    status: string;
    reason: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await requestAttendanceApi<AttendanceWorkspaceData>(
        withClassroomQuery(
          `/api/teacher/courses/${courseId}/attendance`,
          classroom.id,
        ),
        { cache: "no-store" },
      );
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "签到信息加载失败。");
    }
  }, [courseId, classroom.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (editing || !data?.sessions.some((session) => session.status === "OPEN"))
      return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [data, editing, load]);

  const newestSession = data?.sessions.reduce<AttendanceSessionRow | null>(
    (latest, session) =>
      !latest || session.createdAt > latest.createdAt ? session : latest,
    null,
  );
  const currentSession =
    data?.sessions.find((session) => session.id === selectedSessionId) ??
    data?.sessions.find((session) => session.status === "OPEN") ??
    newestSession;

  async function refreshPublisherLocation() {
    setLocationPending(true);
    setLocationError(null);
    setPublisherLocation(null);
    try {
      const position = await readBrowserPosition();
      const { latitude, longitude, accuracy } = position.coords;
      setPublisherLocation({
        latitude,
        longitude,
        accuracyMeters: accuracy,
      });
    } catch (caught) {
      setLocationError(
        caught instanceof Error ? caught.message : "获取当前位置失败，请重试。",
      );
    } finally {
      setLocationPending(false);
    }
  }

  function openSettings(method: SignInMethod) {
    setDraftSettings({ ...settings, method });
    setSettingsOpen(true);
    if (method === "LOCATION") {
      setPublisherLocation(null);
      void refreshPublisherLocation();
    }
  }

  function closeSettings() {
    setDraftSettings(settings);
    setSettingsOpen(false);
  }

  function saveSettings() {
    if (
      draftSettings.method === "CODE" &&
      !/^[A-Za-z0-9]{4,12}$/.test(draftSettings.code.trim())
    ) {
      setError("签到码需为 4 至 12 位字母或数字。");
      return;
    }
    if (
      draftSettings.method === "LOCATION" &&
      (!Number.isInteger(draftSettings.radiusMeters) ||
        draftSettings.radiusMeters < 25 ||
        draftSettings.radiusMeters > 1000)
    ) {
      setError("签到距离需为 25 至 1000 米之间的整数。");
      return;
    }
    if (
      draftSettings.method === "GRAPHIC" &&
      (draftSettings.pattern.length < 4 ||
        new Set(draftSettings.pattern).size !== draftSettings.pattern.length)
    ) {
      setError("请在九点阵上绘制至少 4 个不同的点。");
      return;
    }
    setSettings({
      ...draftSettings,
      code: draftSettings.code.trim().toUpperCase(),
    });
    setError(null);
    setSettingsOpen(false);
  }

  async function publish(form: FormData) {
    if (busy) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const startsAt = new Date(String(form.get("startsAt")));
      const signInOpensAt = new Date(startsAt.getTime() - 10 * 60_000);
      const signInClosesAt = new Date(startsAt.getTime() + 20 * 60_000);
      const locationFields =
        settings.method === "LOCATION"
          ? {
              ...(await readPublisherLocation(settings.radiusMeters)),
              locationRadiusMeters: settings.radiusMeters,
            }
          : {};
      const created = await requestAttendanceApi<{
        id: string;
        revision: number;
      }>(`/api/teacher/courses/${courseId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: classroom.id,
          title: String(form.get("title")),
          signInMethod: settings.method,
          ...locationFields,
          ...(settings.method === "CODE" ? { signInCode: settings.code } : {}),
          ...(settings.method === "GRAPHIC"
            ? { signInPattern: settings.pattern }
            : {}),
          startsAt,
          signInOpensAt,
          lateAfter: new Date(startsAt.getTime() + 10 * 60_000),
          signInClosesAt,
        }),
      });
      setSelectedSessionId(created.id);
      setChallenge(
        settings.method === "CODE"
          ? { sessionId: created.id, method: "CODE", code: settings.code }
          : settings.method === "GRAPHIC"
            ? {
                sessionId: created.id,
                method: "GRAPHIC",
                pattern: settings.pattern,
              }
            : null,
      );
      const now = new Date();
      let autoOpenError: string | null = null;
      if (now >= signInOpensAt && now <= signInClosesAt) {
        try {
          await requestAttendanceApi(
            `/api/teacher/attendance-sessions/${created.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "OPEN",
                expectedRevision: created.revision,
              }),
            },
          );
          setMessage("签到已发布并开放。");
        } catch (caught) {
          setMessage("签到场次已创建，请在开放时间内点击“开放签到”。");
          autoOpenError =
            caught instanceof Error ? caught.message : "自动开放签到失败。";
        }
      } else {
        setMessage("签到场次已创建，请在开放时间内点击“开放签到”。");
      }
      await load();
      if (autoOpenError) setError(autoOpenError);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布签到失败。");
    } finally {
      setBusy(false);
    }
  }

  async function update(
    action: "OPEN" | "CLOSE" | "CANCEL" | "ROTATE_CHALLENGE",
    credential?: { signInCode?: string; signInPattern?: number[] },
  ) {
    if (!currentSession || busy) return;
    if (
      (action === "CLOSE" || action === "CANCEL") &&
      !window.confirm(
        action === "CLOSE"
          ? "确认结束签到并结算未签到学生的缺勤记录？"
          : "确认取消本次签到场次？",
      )
    )
      return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await requestAttendanceApi<{
        challenge:
          | { method: "CODE"; code: string }
          | { method: "GRAPHIC"; pattern: number[] }
          | null;
      }>(`/api/teacher/attendance-sessions/${currentSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedRevision: currentSession.revision,
          ...credential,
        }),
      });
      if (result.challenge) {
        setChallenge({ sessionId: currentSession.id, ...result.challenge });
        setChallengeSettingsOpen(false);
        setMessage("签到口令已更新，请将新口令告知学生。");
      }
      await load();
      if (!result.challenge)
        setMessage(
          action === "CLOSE"
            ? "签到已结束，缺勤记录已结算。"
            : "签到场次状态已更新。",
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "签到操作失败。");
    } finally {
      setBusy(false);
    }
  }

  function openChallengeSettings() {
    setChallengeCode("");
    setChallengePattern([]);
    setChallengeSettingsOpen(true);
  }

  function submitChallengeSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSession || busy) return;
    if (currentSession.signInMethod === "CODE") {
      if (!/^[A-Za-z0-9]{4,12}$/.test(challengeCode.trim())) {
        setError("签到码需为 4 至 12 位字母或数字。");
        return;
      }
      void update("ROTATE_CHALLENGE", {
        signInCode: challengeCode.trim().toUpperCase(),
      });
      return;
    }
    if (currentSession.signInMethod === "GRAPHIC") {
      if (challengePattern.length < 4) {
        setError("请绘制至少 4 个点的签到图形。");
        return;
      }
      void update("ROTATE_CHALLENGE", { signInPattern: challengePattern });
    }
  }

  async function saveCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSession || !editing || busy) return;
    const input = correctAttendanceRecordSchema.safeParse({
      status: editing.status,
      reason: editing.reason,
      expectedRevisionNumber: editing.record.currentRevisionNumber,
    });
    if (!input.success) {
      setError("请选择有效的出勤状态并填写修改原因。");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await requestAttendanceApi(
        `/api/teacher/attendance-sessions/${currentSession.id}/records/${editing.record.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.data),
        },
      );
      setEditing(null);
      await load();
      setMessage("出勤状态已修改，修改原因和原记录已保留。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "出勤状态修改失败。");
    } finally {
      setBusy(false);
    }
  }

  const signedCount =
    currentSession?.records.filter((record) =>
      ["PRESENT", "LATE", "EARLY_LEAVE"].includes(record.currentStatus),
    ).length ?? 0;
  const pendingCount =
    currentSession?.records.filter(
      (record) => record.currentStatus === "PENDING",
    ).length ?? 0;

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {message}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void load()}
          >
            重试加载
          </button>
        </div>
      )}
      <form
        className="rounded-xl border bg-white p-5"
        action={(form) => void publish(form)}
      >
        <h2 className="font-semibold">发布签到</h2>
        <p className="mt-1 text-sm text-slate-500">班级：{classroom.name}</p>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-800">
            选择签到方式
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {(
              [
                {
                  method: "DIRECT",
                  description: "学生在开放时间内点击签到",
                },
                {
                  method: "LOCATION",
                  description: "按教师设置的距离范围核验",
                },
                {
                  method: "CODE",
                  description: "学生输入教师设置的签到码",
                },
                {
                  method: "GRAPHIC",
                  description: "学生复现九点阵图形",
                },
              ] as const
            ).map(({ method, description }, index) => {
              const isSelected = settings.method === method;
              return (
                <button
                  key={method}
                  type="button"
                  disabled={busy}
                  aria-pressed={isSelected}
                  onClick={() => openSettings(method)}
                  className={`rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected
                      ? "border-sky-600 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold ${
                        isSelected
                          ? "bg-sky-700 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="font-medium text-slate-900">
                      {attendanceMethodLabels[method]}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-slate-600">
                    {description}
                  </span>
                  <span
                    className={`mt-2 block text-xs font-medium ${
                      isSelected ? "text-sky-700" : "text-slate-500"
                    }`}
                  >
                    {isSelected ? "当前方式 · 点击修改设置" : "点击选择并设置"}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {settings.method === "LOCATION" ? (
            <p>
              允许距离 {settings.radiusMeters}{" "}
              米。发布时会重新获取当前位置作为中心；学生坐标只用于本次校验。
            </p>
          ) : settings.method === "CODE" ? (
            <p>当前签到码已设置；开放签到后可向学生展示。</p>
          ) : settings.method === "GRAPHIC" ? (
            <p>当前九点阵图形已设置；开放签到后可向学生展示。</p>
          ) : (
            <p>学生可在签到开放时间内直接完成签到。</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            场次名称
            <input
              name="title"
              required
              maxLength={120}
              disabled={busy}
              placeholder="例如：第 3 次课签到"
              className="rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            上课时间
            <input
              name="startsAt"
              required
              type="datetime-local"
              disabled={busy}
              className="rounded-md border px-3 py-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "发布中…" : "发布签到"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          上课前 10 分钟可开放签到；上课后 10 分钟记为迟到，20 分钟后截止。
        </p>
      </form>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">本次签到</h2>
            <p className="mt-1 text-xs text-slate-500">
              显示当前班级最近创建的场次，发布后会显示新场次。
            </p>
          </div>
          <Link
            className="text-sm text-sky-700 underline"
            href={withClassroomQuery(
              `/teacher/courses/${courseId}/attendance`,
              classroom.id,
            )}
          >
            查看出勤台账
          </Link>
        </div>
        {!data ? (
          <p className="mt-4 text-sm text-slate-500">正在加载本次签到…</p>
        ) : !currentSession ? (
          <p className="mt-4 text-sm text-slate-500">
            当前班级还没有签到场次，请先发布签到。
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-medium text-slate-900">
                  {currentSession.title}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-sky-700">
                  {sessionLabels[currentSession.status] ??
                    currentSession.status}
                </span>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="text-slate-500">上课时间</dt>
                  <dd>{formatDateTime(currentSession.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">签到开放</dt>
                  <dd>{formatDateTime(currentSession.signInOpensAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">迟到起点</dt>
                  <dd>{formatDateTime(currentSession.lateAfter)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">签到截止</dt>
                  <dd>{formatDateTime(currentSession.signInClosesAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">签到方式</dt>
                  <dd>
                    {attendanceMethodLabels[currentSession.signInMethod] ??
                      currentSession.signInMethod}
                    {currentSession.signInMethod === "LOCATION" &&
                    currentSession.locationRadiusMeters
                      ? ` · ${currentSession.locationRadiusMeters} 米`
                      : ""}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-slate-700">
                应到 {currentSession.records.length} 人 · 已签到 {signedCount}{" "}
                人 · 待签到 {pendingCount} 人
              </p>
            </div>
            {(currentSession.signInMethod === "CODE" ||
              currentSession.signInMethod === "GRAPHIC") && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">
                      {currentSession.signInMethod === "CODE"
                        ? "本场签到码"
                        : "本场九点阵图形"}
                    </h3>
                    {challenge?.sessionId !== currentSession.id && (
                      <p className="mt-1 text-xs text-slate-600">
                        出于安全考虑，刷新页面后不会再次显示口令；可在此重新设置。
                      </p>
                    )}
                  </div>
                  {currentSession.status !== "CLOSED" &&
                    currentSession.status !== "CANCELLED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={openChallengeSettings}
                        className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
                      >
                        {challenge?.sessionId === currentSession.id
                          ? "更换口令"
                          : "设置新口令"}
                      </button>
                    )}
                </div>
                {challenge?.sessionId === currentSession.id &&
                challenge.method === "CODE" ? (
                  <p className="mt-3 font-mono text-3xl font-bold tracking-[0.2em] text-sky-800">
                    {challenge.code}
                  </p>
                ) : challenge?.sessionId === currentSession.id &&
                  challenge.method === "GRAPHIC" ? (
                  <div className="mt-3 max-w-64">
                    <NineDotPatternDisplay pattern={challenge.pattern ?? []} />
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {currentSession.status === "SCHEDULED" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("OPEN")}
                  className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  开放签到
                </button>
              )}
              {currentSession.status === "OPEN" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("CLOSE")}
                  className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  结束并结算缺勤
                </button>
              )}
              {!["CLOSED", "CANCELLED"].includes(currentSession.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("CANCEL")}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                >
                  取消场次
                </button>
              )}
            </div>
            <details className="rounded-lg border">
              <summary className="cursor-pointer p-3 text-sm font-medium">
                查看本次学生签到明细（点击状态可修改）
              </summary>
              <div className="max-h-96 overflow-auto border-t">
                {currentSession.records.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">
                    发布时班级暂无在读学生。
                  </p>
                ) : (
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">
                          学号
                        </th>
                        <th scope="col" className="px-3 py-2 text-left">
                          姓名
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          状态
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {currentSession.records.map((record) => (
                        <tr key={record.id}>
                          <td className="px-3 py-2">
                            {record.student.profile?.studentNo ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {record.student.profile?.displayName ?? "未命名"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editing?.record.id === record.id ? (
                              <form
                                onSubmit={saveCorrection}
                                className="ml-auto flex max-w-xl flex-wrap items-center justify-end gap-2 rounded-xl border border-sky-200 bg-sky-50/40 p-3"
                              >
                                <AttendanceStatusOptions
                                  label={`修改${record.student.profile?.displayName ?? "学生"}的出勤状态`}
                                  value={editing.status}
                                  disabled={busy}
                                  onChange={(status) =>
                                    setEditing({ ...editing, status })
                                  }
                                />
                                <input
                                  aria-label="修改原因"
                                  placeholder="填写修改原因"
                                  required
                                  maxLength={500}
                                  className="min-w-36 rounded border px-2 py-1"
                                  value={editing.reason}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setEditing({
                                      ...editing,
                                      reason: event.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="submit"
                                  disabled={busy}
                                  className="rounded bg-sky-700 px-2 py-1 text-white disabled:opacity-50"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setEditing(null)}
                                  className="rounded border px-2 py-1"
                                >
                                  取消
                                </button>
                              </form>
                            ) : (
                              <AttendanceStatusButton
                                status={record.currentStatus}
                                studentName={
                                  record.student.profile?.displayName ?? "学生"
                                }
                                disabled={
                                  busy || currentSession.status === "CANCELLED"
                                }
                                onClick={() => {
                                  setError(null);
                                  setEditing({
                                    record,
                                    status:
                                      record.currentStatus === "PENDING"
                                        ? "PRESENT"
                                        : record.currentStatus,
                                    reason: "",
                                  });
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          </div>
        )}
      </section>
      <EditorDialog
        open={settingsOpen}
        title={"设置" + attendanceMethodLabels[draftSettings.method]}
        onClose={closeSettings}
      >
        <div className="mt-4 space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {draftSettings.method === "DIRECT" && (
            <p className="text-sm text-slate-600">
              学生在签到开放时间内点击“立即签到”即可完成签到。
            </p>
          )}
          {draftSettings.method === "LOCATION" && (
            <>
              <p className="text-sm text-slate-600">
                学生必须在设置距离内签到。授权定位后会显示当前位置经纬度与精度；发布时会重新获取并作为签到中心。学生坐标只用于当次核验，不保存。
              </p>
              <section
                aria-label="发布者当前位置"
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">
                      发布者当前位置
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      用于预览签到中心；发布前会重新获取。
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={locationPending}
                    onClick={() => void refreshPublisherLocation()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {locationPending
                      ? "正在定位…"
                      : publisherLocation
                        ? "刷新位置"
                        : "获取当前位置"}
                  </button>
                </div>
                {locationPending && (
                  <p role="status" className="mt-3 text-sm text-slate-600">
                    正在读取设备定位…
                  </p>
                )}
                {locationError && (
                  <p
                    role="alert"
                    className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700"
                  >
                    {locationError}
                  </p>
                )}
                {publisherLocation ? (
                  <div className="mt-3 rounded-lg bg-white px-3 py-2">
                    <p className="text-sm font-medium text-slate-900">
                      {publisherLocation.latitude.toFixed(6)}°,{" "}
                      {publisherLocation.longitude.toFixed(6)}°
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      定位精度约 {Math.round(publisherLocation.accuracyMeters)}{" "}
                      米
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      经纬度来自设备定位；室内或信号较弱时可能存在偏差。
                    </p>
                    {publisherLocation.accuracyMeters >
                    Math.min(100, draftSettings.radiusMeters) ? (
                      <p className="mt-2 text-xs text-amber-700">
                        当前精度不满足此签到距离要求，请开启精确定位后刷新。
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-emerald-700">
                        当前位置符合当前签到距离的精度要求。
                      </p>
                    )}
                  </div>
                ) : (
                  !locationPending &&
                  !locationError && (
                    <p className="mt-3 text-sm text-slate-500">
                      尚未获取位置。请允许浏览器定位以查看当前签到中心。
                    </p>
                  )
                )}
              </section>
              <label className="block text-sm">
                签到距离（米）
                <input
                  aria-label="签到距离（米）"
                  type="number"
                  min={25}
                  max={1000}
                  step={25}
                  required
                  value={draftSettings.radiusMeters}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      radiusMeters: Number(event.target.value),
                    })
                  }
                  className="mt-1 block w-full rounded-md border px-3 py-2"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  可设置 25 至 1000 米；发布时定位误差需满足签到距离，且不超过
                  100 米。
                </span>
              </label>
            </>
          )}
          {draftSettings.method === "CODE" && (
            <>
              <p className="text-sm text-slate-600">
                由发布者自定义签到码，开放后展示给学生。学生输入相同签到码完成签到。
              </p>
              <label className="block text-sm">
                自定义签到码
                <input
                  autoComplete="off"
                  aria-label="自定义签到码"
                  value={draftSettings.code}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      code: event.target.value,
                    })
                  }
                  minLength={4}
                  maxLength={12}
                  pattern="[A-Za-z0-9]{4,12}"
                  required
                  className="mt-1 block w-full rounded-md border px-3 py-2 font-mono"
                  placeholder="4 至 12 位字母或数字"
                />
              </label>
            </>
          )}
          {draftSettings.method === "GRAPHIC" && (
            <>
              <p className="text-sm text-slate-600">
                发布者在九点阵上按住并依次连接至少 4
                个点。学生端会显示空白九点阵供复现。
              </p>
              <NineDotPatternInput
                value={draftSettings.pattern}
                onChange={(pattern) =>
                  setDraftSettings({ ...draftSettings, pattern })
                }
              />
            </>
          )}
          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={closeSettings}
              className="rounded-md border px-3 py-2 text-sm"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveSettings}
              className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white"
            >
              确认设置
            </button>
          </div>
        </div>
      </EditorDialog>
      <EditorDialog
        open={challengeSettingsOpen}
        title={
          currentSession?.signInMethod === "GRAPHIC"
            ? "设置九点阵签到图形"
            : "设置签到码"
        }
        busy={busy}
        onClose={() => {
          if (!busy) setChallengeSettingsOpen(false);
        }}
      >
        <form onSubmit={submitChallengeSettings} className="mt-4 space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {currentSession?.signInMethod === "CODE" ? (
            <label className="block text-sm">
              新签到码
              <input
                autoComplete="off"
                aria-label="新签到码"
                value={challengeCode}
                onChange={(event) => setChallengeCode(event.target.value)}
                minLength={4}
                maxLength={12}
                pattern="[A-Za-z0-9]{4,12}"
                required
                className="mt-1 block w-full rounded-md border px-3 py-2 font-mono"
                placeholder="4 至 12 位字母或数字"
              />
            </label>
          ) : currentSession?.signInMethod === "GRAPHIC" ? (
            <NineDotPatternInput
              value={challengePattern}
              onChange={setChallengePattern}
            />
          ) : null}
          <p className="text-xs text-slate-500">
            更换后原口令立即失效，已失败的尝试次数会清零。
          </p>
          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setChallengeSettingsOpen(false)}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存并展示"}
            </button>
          </div>
        </form>
      </EditorDialog>
    </div>
  );
}
