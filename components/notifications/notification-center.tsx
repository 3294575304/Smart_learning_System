"use client";

import { NotificationPriority, NotificationType } from "@prisma/client";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationLink } from "@/components/notifications/notification-link";

import { NOTIFICATIONS_CHANGED_EVENT } from "@/components/notifications/notification-indicator";
import { requestNotificationApi } from "@/components/notifications/request-api";
import type { NotificationListResult } from "@/services/notifications/types";

const TYPE_LABELS: Record<NotificationType, string> = {
  ASSIGNMENT_PUBLISHED: "作业发布",
  ASSIGNMENT_DUE_SOON: "截止提醒",
  ASSIGNMENT_GRADED: "批改完成",
  LEARNING_ANALYSIS_READY: "学情分析",
  RECOMMENDATION_READY: "推荐更新",
  SYSTEM_ANNOUNCEMENT: "系统公告",
  COURSE_SURVEY_PUBLISHED: "课程问卷",
  CLASSROOM_DISSOLVED: "班级解散",
};

const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  NORMAL: "普通",
  IMPORTANT: "重要",
  URGENT: "紧急",
};

interface Filters {
  status: "" | "UNREAD" | "READ";
  type: "" | NotificationType;
  priority: "" | NotificationPriority;
}

function formatTime(value: Date): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

export function NotificationCenter({
  initialResult,
}: {
  initialResult: NotificationListResult;
}) {
  const requestVersion = useRef(0);
  const [result, setResult] = useState(initialResult);
  const [filters, setFilters] = useState<Filters>({
    status: "",
    type: "",
    priority: "",
  });
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingReadId, setPendingReadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async function load(
    page: number,
    nextFilters: Filters,
  ) {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.type) params.set("type", nextFilters.type);
    if (nextFilters.priority) params.set("priority", nextFilters.priority);
    const response = await requestNotificationApi<NotificationListResult>(
      `/api/notifications?${params.toString()}`,
      { cache: "no-store" },
    );
    if (version !== requestVersion.current) return;
    setLoading(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    if (page > 1 && response.data.items.length === 0) {
      await load(Math.max(1, response.data.pagination.totalPages), nextFilters);
      return;
    }
    setResult(response.data);
  }, []);

  useEffect(() => {
    void load(1, { status: "", type: "", priority: "" });
  }, [load]);

  function applyFilter<Key extends keyof Filters>(
    key: Key,
    value: Filters[Key],
  ) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    void load(1, nextFilters);
  }

  async function markOneRead(notificationId: string) {
    setError(null);
    setPendingReadId(notificationId);
    const response = await requestNotificationApi<{ readAt: Date }>(
      `/api/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PATCH" },
    );
    if (!response.success) {
      setPendingReadId(null);
      setError(response.error);
      return;
    }

    setResult((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === notificationId ? { ...item, readAt: new Date() } : item,
      ),
    }));
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    setMessage("已标记为已读。");
    if (filters.status === "UNREAD")
      await load(result.pagination.page, filters);
    setPendingReadId(null);
  }

  async function markAllRead() {
    if (markingAll || pendingReadId) return;
    setMarkingAll(true);
    setError(null);
    setMessage(null);
    const response = await requestNotificationApi<{ updatedCount: number }>(
      "/api/notifications/read-all",
      { method: "POST" },
    );
    if (!response.success) {
      setMarkingAll(false);
      setError(response.error);
      return;
    }
    setMessage(`已将 ${response.data.updatedCount} 条通知标记为已读。`);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    await load(1, filters);
    setMarkingAll(false);
  }

  return (
    <section className="space-y-5" aria-busy={loading}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">通知中心</h1>
          <p className="mt-1 text-sm text-gray-600">
            集中查看学习提醒与系统消息，打开通知即可了解详情。
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          disabled={loading || markingAll || pendingReadId !== null}
          onClick={() => void markAllRead()}
          type="button"
        >
          {markingAll ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          {markingAll ? "正在标记…" : "全部标记为已读"}
        </button>
      </header>

      <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3">
        <div className="flex items-center gap-1" aria-label="已读状态">
          {(
            [
              { value: "", label: "全部" },
              { value: "UNREAD", label: "未读" },
              { value: "READ", label: "已读" },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={markingAll || pendingReadId !== null}
              aria-pressed={filters.status === item.value}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${filters.status === item.value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-sky-50"}`}
              onClick={() => applyFilter("status", item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select
          disabled={markingAll || pendingReadId !== null}
          aria-label="通知类型"
          className="rounded-md border bg-white px-3 py-2 text-sm"
          onChange={(event) =>
            applyFilter("type", event.target.value as Filters["type"])
          }
          value={filters.type}
        >
          <option value="">全部类型</option>
          {Object.values(NotificationType).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          disabled={markingAll || pendingReadId !== null}
          aria-label="通知优先级"
          className="rounded-md border bg-white px-3 py-2 text-sm"
          onChange={(event) =>
            applyFilter("priority", event.target.value as Filters["priority"])
          }
          value={filters.priority}
        >
          <option value="">全部优先级</option>
          {Object.values(NotificationPriority).map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
          <button
            className="ml-3 underline"
            onClick={() => void load(result.pagination.page, filters)}
          >
            重新加载
          </button>
        </div>
      ) : null}
      {message ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span role="status">
          {loading
            ? "正在更新通知…"
            : `共 ${result.pagination.total} 条通知 · 按时间倒序`}
        </span>
        {(filters.status || filters.type || filters.priority) && (
          <button
            disabled={loading || markingAll || pendingReadId !== null}
            className="text-sky-700 hover:underline disabled:opacity-50"
            onClick={() => {
              const reset: Filters = { status: "", type: "", priority: "" };
              setFilters(reset);
              void load(1, reset);
            }}
          >
            重置筛选
          </button>
        )}
      </div>
      {loading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-xl border bg-white p-12 text-slate-500"
        >
          <LoaderCircle className="size-5 animate-spin" />
          正在加载…
        </div>
      ) : result.items.length === 0 ? (
        <div className="rounded-xl border bg-white px-6 py-14 text-center">
          <Bell className="mx-auto h-9 w-9 text-gray-400" />
          <h2 className="mt-3 font-semibold">暂无通知</h2>
          <p className="mt-1 text-sm text-gray-500">试试切换状态或重置筛选。</p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-white">
          {result.items.map((item) => {
            const unread = item.readAt === null;
            return (
              <article
                className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center ${unread ? "border-l-4 border-l-blue-600 bg-blue-50/40" : "bg-white"}`}
                key={item.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                        {TYPE_LABELS[item.type]}
                      </span>
                      {item.priority !== NotificationPriority.NORMAL ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                          {PRIORITY_LABELS[item.priority]}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${unread ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${unread ? "bg-blue-600" : "bg-gray-400"}`}
                      />
                      {unread ? "未读" : "已读"}
                    </span>
                  </div>
                  <span className="mt-2 block text-xs text-gray-500">
                    {formatTime(item.createdAt)}
                  </span>
                  <h2 className="mt-2 font-semibold text-gray-950">
                    {item.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 whitespace-pre-wrap text-gray-600">
                    {item.content}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <NotificationLink
                    href={`/notifications/${encodeURIComponent(item.id)}`}
                    label="查看详情"
                  />
                  {unread ? (
                    <button
                      aria-label={`将“${item.title}”标记为已读`}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 self-end rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50 sm:self-center"
                      disabled={loading || markingAll || pendingReadId !== null}
                      onClick={() => void markOneRead(item.id)}
                      title="只标记此通知为已读"
                      type="button"
                    >
                      {pendingReadId === item.id ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Check aria-hidden="true" className="size-4" />
                      )}
                      标记已读
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {result.pagination.totalPages > 1 ? (
        <nav
          className="flex items-center justify-between"
          aria-label="通知分页"
        >
          <p className="text-sm text-gray-500">
            共 {result.pagination.total} 条，第 {result.pagination.page} /{" "}
            {result.pagination.totalPages} 页
          </p>
          <div className="flex gap-2">
            <button
              aria-label="上一页"
              className="rounded-md border bg-white p-2 disabled:opacity-40"
              disabled={
                loading ||
                markingAll ||
                pendingReadId !== null ||
                result.pagination.page <= 1
              }
              onClick={() => void load(result.pagination.page - 1, filters)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="下一页"
              className="rounded-md border bg-white p-2 disabled:opacity-40"
              disabled={
                loading ||
                markingAll ||
                pendingReadId !== null ||
                result.pagination.page >= result.pagination.totalPages
              }
              onClick={() => void load(result.pagination.page + 1, filters)}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
