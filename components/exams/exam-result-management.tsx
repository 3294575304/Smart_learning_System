"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import { PublishResultsButton } from "@/components/assignment-results/publish-results-button";
import type { getExamResultManagement } from "@/services/exams/result-management";

type Management = Awaited<ReturnType<typeof getExamResultManagement>>;
const modes = {
  MANUAL: "手动公布",
  SCHEDULED: "定时公布",
  WHEN_READY: "批改完成后自动公布",
} as const;
type Mode = keyof typeof modes;
const localDateTime = (value: Date | null | undefined) =>
  value
    ? new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : "";
const chinaTime = (value: Date) =>
  value.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
const button =
  "min-h-10 rounded-lg border px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50";

export function ExamResultManagement({
  assignmentId,
  endpoint,
  data,
  canConfigure,
}: {
  assignmentId: string;
  endpoint: string;
  data: Management;
  canConfigure: boolean;
}) {
  const router = useRouter();
  const { publication, policy, reviews } = data;
  const [mode, setMode] = useState<Mode>(policy?.mode ?? "MANUAL");
  const [scheduledAt, setScheduledAt] = useState(
    localDateTime(policy?.scheduledAt),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ error: false, text: "" });
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);
  const autoPending = Boolean(policy && !policy.completedAt);
  useEffect(() => {
    if (!autoPending) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [autoPending, router]);

  async function update(body: object, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage({ error: false, text: "" });
    const result = await requestAssignmentApi(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setMessage({
      error: !result.success,
      text: result.success ? success : result.error,
    });
    if (result.success) {
      setReply(null);
      router.refresh();
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-white p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">成绩公布与复核</h2>
        <button
          type="button"
          className={button}
          onClick={() => router.refresh()}
        >
          刷新成绩与复核
        </button>
      </header>
      <p className="text-sm text-slate-700">
        待批改 {publication.pendingCount} 份 · 已批改待公布{" "}
        {publication.gradedCount} 份 · 已公布 {publication.publishedCount} 份
      </p>
      {publication.blockedReason && (
        <p className="text-sm text-slate-600">{publication.blockedReason}</p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-slate-50 p-4">
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            当前方式 <strong>{modes[policy?.mode ?? "MANUAL"]}</strong>
            {policy?.scheduledAt && ` · ${chinaTime(policy.scheduledAt)}`}
          </p>
          {policy?.completedAt && (
            <p>已于 {chinaTime(policy.completedAt)} 公布</p>
          )}
          {autoPending && (
            <p>考试结束、收卷及批改全部完成后，系统才会按所选方式公布。</p>
          )}
          <Link
            className="font-medium text-sky-800 hover:underline"
            href={`/teacher/assignments/${assignmentId}/results`}
          >
            查看本班成绩与答卷
          </Link>
        </div>
        {!autoPending && publication.canPublish && (
          <PublishResultsButton
            assignmentId={assignmentId}
            publication={publication}
          />
        )}
      </div>
      {canConfigure && !publication.publishedCount && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const date = new Date(scheduledAt);
            if (mode === "SCHEDULED" && !Number.isFinite(date.getTime())) {
              setMessage({ error: true, text: "请选择有效的公布时间。" });
              return;
            }
            void update(
              {
                action: "POLICY",
                policy:
                  mode === "SCHEDULED"
                    ? { mode, scheduledAt: date.toISOString() }
                    : { mode },
              },
              "已保存本班公布方式。",
            );
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="grid gap-1 text-sm">
            公布方式
            <select
              className="h-10 rounded-lg border bg-white px-3"
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
            >
              {(Object.keys(modes) as Mode[]).map((item) => (
                <option key={item} value={item}>
                  {modes[item]}
                </option>
              ))}
            </select>
          </label>
          {mode === "SCHEDULED" && (
            <label className="grid gap-1 text-sm">
              公布时间
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                required
                className="h-10 rounded-lg border bg-white px-3"
              />
            </label>
          )}
          <button type="submit" disabled={busy} className={button}>
            保存公布方式
          </button>
          {mode !== "MANUAL" && (
            <p className="basis-full text-xs text-slate-600">
              保存后，系统满足条件时会向本班学生公布成绩、答案和反馈。
            </p>
          )}
        </form>
      )}
      {message.text && (
        <p
          role={message.error ? "alert" : "status"}
          className={
            message.error ? "text-sm text-rose-800" : "text-sm text-emerald-800"
          }
        >
          {message.text}
        </p>
      )}
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">
          复核申请{" "}
          <span className="text-sm text-slate-600">
            待回复 {reviews.filter((item) => !item.resolvedAt).length}
          </span>
        </h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-600">暂无复核申请。</p>
        ) : (
          <ul className="divide-y">
            {reviews.map((review) => (
              <li key={review.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <strong>
                    {review.submission.student.profile?.displayName || "学生"}
                  </strong>
                  <span>{review.submission.student.profile?.studentNo}</span>
                  <span className="text-slate-600">
                    {review.resolvedAt ? "已回复" : "待回复"}
                  </span>
                  <Link
                    className="text-sky-800 hover:underline"
                    href={`/teacher/assignments/${assignmentId}/submissions/${review.submission.id}`}
                  >
                    核对原答卷
                  </Link>
                </div>
                <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                  {review.reason}
                </p>
                {review.response && (
                  <p className="rounded-lg bg-slate-50 p-3 [overflow-wrap:anywhere] whitespace-pre-wrap">
                    回复 · {review.response}
                  </p>
                )}
                {!review.resolvedAt &&
                  (reply?.id === review.id ? (
                    <form
                      className="space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void update(
                          {
                            action: "RESOLVE_REVIEW",
                            reviewId: review.id,
                            response: reply.text,
                          },
                          "已回复复核申请。",
                        );
                      }}
                    >
                      <label className="grid gap-1">
                        复核结论
                        <textarea
                          rows={3}
                          maxLength={1000}
                          required
                          minLength={2}
                          className="rounded-lg border p-2"
                          value={reply.text}
                          onChange={(event) =>
                            setReply({
                              id: review.id,
                              text: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className={button}
                          disabled={busy || reply.text.trim().length < 2}
                        >
                          发送回复
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() => setReply(null)}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={button}
                      onClick={() => setReply({ id: review.id, text: "" })}
                    >
                      填写复核结论
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
