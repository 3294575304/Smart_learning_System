"use client";

import { NotificationPriority, NotificationType } from "@prisma/client";
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [result, setResult] = useState(initialResult);
  const [filters, setFilters] = useState<Filters>({
    status: "",
    type: "",
    priority: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(page: number, nextFilters = filters) {
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
    setLoading(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setResult(response.data);
  }

  async function openNotification(
    notificationId: string,
    actionUrl: string | null,
    isUnread: boolean,
  ) {
    setError(null);
    if (isUnread) {
      setLoading(true);
      const response = await requestNotificationApi<{ readAt: Date }>(
        `/api/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "PATCH" },
      );
      setLoading(false);
      if (!response.success) {
        setError(response.error);
        return;
      }
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    }
    if (actionUrl) {
      router.push(actionUrl);
      return;
    }
    await load(result.pagination.page);
  }

  async function markAllRead() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const response = await requestNotificationApi<{ updatedCount: number }>(
      "/api/notifications/read-all",
      { method: "POST" },
    );
    setLoading(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setMessage(`已将 ${response.data.updatedCount} 条通知标记为已读。`);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    await load(1);
  }

  return (
    <section className="space-y-5" aria-busy={loading}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">通知中心</h1>
          <p className="mt-1 text-sm text-gray-600">
            查看作业、学情分析、推荐练习和系统公告的真实业务通知。
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          disabled={loading}
          onClick={() => void markAllRead()}
          type="button"
        >
          <CheckCheck className="h-4 w-4" />
          全部标记为已读
        </button>
      </header>

      <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3 lg:grid-cols-[12rem_14rem_12rem_auto]">
        <select
          aria-label="已读状态"
          className="rounded-md border bg-white px-3 py-2 text-sm"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as Filters["status"],
            }))
          }
          value={filters.status}
        >
          <option value="">全部状态</option>
          <option value="UNREAD">只看未读</option>
          <option value="READ">只看已读</option>
        </select>
        <select
          aria-label="通知类型"
          className="rounded-md border bg-white px-3 py-2 text-sm"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              type: event.target.value as Filters["type"],
            }))
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
          aria-label="通知优先级"
          className="rounded-md border bg-white px-3 py-2 text-sm"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              priority: event.target.value as Filters["priority"],
            }))
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
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => void load(1)}
          type="button"
        >
          应用筛选
        </button>
      </div>

      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
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

      {result.items.length === 0 ? (
        <div className="rounded-xl border bg-white px-6 py-14 text-center">
          <Bell className="mx-auto h-9 w-9 text-gray-400" />
          <h2 className="mt-3 font-semibold">暂无通知</h2>
          <p className="mt-1 text-sm text-gray-500">
            当前筛选条件下没有真实业务通知。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {result.items.map((item) => {
            const unread = item.readAt === null;
            return (
              <button
                className={`w-full rounded-xl border p-4 text-left transition hover:border-gray-400 ${unread ? "border-l-4 border-l-blue-600 bg-blue-50/40" : "bg-white"}`}
                key={item.id}
                onClick={() =>
                  void openNotification(item.id, item.actionUrl, unread)
                }
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                    {TYPE_LABELS[item.type]}
                  </span>
                  {item.priority !== NotificationPriority.NORMAL ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                  ) : null}
                  <span className="text-gray-500">
                    {formatTime(item.createdAt)}
                  </span>
                  <span className="ml-auto font-medium text-gray-600">
                    {unread ? "未读" : "已读"}
                  </span>
                </div>
                <h2 className="mt-3 font-semibold text-gray-950">
                  {item.title}
                </h2>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-gray-600">
                  {item.content}
                </p>
              </button>
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
              disabled={loading || result.pagination.page <= 1}
              onClick={() => void load(result.pagination.page - 1)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="下一页"
              className="rounded-md border bg-white p-2 disabled:opacity-40"
              disabled={
                loading ||
                result.pagination.page >= result.pagination.totalPages
              }
              onClick={() => void load(result.pagination.page + 1)}
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
