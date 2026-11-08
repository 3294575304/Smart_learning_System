"use client";

import { NotificationPriority, NotificationType } from "@prisma/client";
import {
  AlarmClock,
  BarChart3,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FilePlus,
  FileX,
  Filter,
  Flag,
  ListX,
  LoaderCircle,
  Megaphone,
  Sparkles,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import type { NotificationDismissRequest } from "@/services/notifications/schemas";
import { NotificationLink } from "@/components/notifications/notification-link";

import { NOTIFICATIONS_CHANGED_EVENT } from "@/components/notifications/notification-indicator";
import { requestNotificationApi } from "@/components/notifications/request-api";
import type { NotificationListResult } from "@/services/notifications/types";

const TYPE_LABELS: Record<NotificationType, string> = {
  ASSIGNMENT_PUBLISHED: "作业发布",
  ASSIGNMENT_REVOKED: "作业撤销",
  ASSIGNMENT_DUE_SOON: "截止提醒",
  ASSIGNMENT_GRADED: "批改完成",
  LEARNING_ANALYSIS_READY: "学情分析",
  RECOMMENDATION_READY: "推荐更新",
  SYSTEM_ANNOUNCEMENT: "系统公告",
  COURSE_SURVEY_PUBLISHED: "课程问卷",
  CLASSROOM_DISSOLVED: "班级变更",
  COURSE_ANNOUNCEMENT: "课程通知",
};

const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  NORMAL: "普通",
  IMPORTANT: "重要",
  URGENT: "紧急",
};

/**
 * 类型视觉语言：图标方块负责"是哪一类"，标签胶囊沿用同色系形成呼应。
 * 作业类偏冷蓝、提醒偏暖黄、成绩偏绿、分析与推荐偏紫、系统类用中性灰。
 */
const TYPE_STYLES: Record<
  NotificationType,
  { icon: LucideIcon; accent: string; pill: string }
> = {
  ASSIGNMENT_PUBLISHED: {
    icon: FilePlus,
    accent: "bg-sky-50 text-sky-600 ring-sky-100",
    pill: "bg-sky-50 text-sky-700 ring-sky-200/70",
  },
  ASSIGNMENT_REVOKED: {
    icon: FileX,
    accent: "bg-rose-50 text-rose-600 ring-rose-100",
    pill: "bg-rose-50 text-rose-700 ring-rose-200/70",
  },
  ASSIGNMENT_DUE_SOON: {
    icon: AlarmClock,
    accent: "bg-amber-50 text-amber-600 ring-amber-100",
    pill: "bg-amber-50 text-amber-800 ring-amber-200/70",
  },
  ASSIGNMENT_GRADED: {
    icon: CheckCircle2,
    accent: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  },
  LEARNING_ANALYSIS_READY: {
    icon: BarChart3,
    accent: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-200/70",
  },
  RECOMMENDATION_READY: {
    icon: Sparkles,
    accent: "bg-violet-50 text-violet-600 ring-violet-100",
    pill: "bg-violet-50 text-violet-700 ring-violet-200/70",
  },
  SYSTEM_ANNOUNCEMENT: {
    icon: Megaphone,
    accent: "bg-slate-100 text-slate-600 ring-slate-200",
    pill: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  COURSE_SURVEY_PUBLISHED: {
    icon: ClipboardList,
    accent: "bg-teal-50 text-teal-600 ring-teal-100",
    pill: "bg-teal-50 text-teal-700 ring-teal-200/70",
  },
  CLASSROOM_DISSOLVED: {
    icon: Users,
    accent: "bg-stone-100 text-stone-600 ring-stone-200",
    pill: "bg-stone-100 text-stone-700 ring-stone-200",
  },
  // 与系统公告同为「通知」，靠橙色与来源区分「任课老师」和「平台」。
  COURSE_ANNOUNCEMENT: {
    icon: Megaphone,
    accent: "bg-orange-50 text-orange-600 ring-orange-100",
    pill: "bg-orange-50 text-orange-700 ring-orange-200/70",
  },
};

const PRIORITY_STYLES: Record<NotificationPriority, string> = {
  NORMAL: "bg-slate-100 text-slate-600 ring-slate-200/70",
  IMPORTANT: "bg-amber-100 text-amber-900 ring-amber-300/70",
  URGENT: "bg-rose-100 text-rose-800 ring-rose-300/70",
};

const PILL_BASE =
  "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] leading-4 font-medium ring-1 ring-inset";

const ACTION_LINK =
  "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-200/80 bg-sky-50 px-3.5 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:min-h-9 sm:flex-none";

const ACTION_BUTTON =
  "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-wait disabled:opacity-50 sm:min-h-9 sm:flex-none";

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
  allowRemoval = false,
}: {
  initialResult: NotificationListResult;
  allowRemoval?: boolean;
}) {
  const requestVersion = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const removalInFlight = useRef(false);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removal, setRemoval] = useState<NotificationDismissRequest | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const mutating = markingAll || pendingReadId !== null || removing;
  const filtered = Boolean(filters.status || filters.type || filters.priority);

  const load = useCallback(async function load(
    page: number,
    nextFilters: Filters,
  ) {
    const version = ++requestVersion.current;
    setLoading(true);
    setSelectedIds([]);
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
    if (mutating) return;
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

  async function confirmRemoval() {
    if (!removal || removalInFlight.current) return;
    removalInFlight.current = true;
    setRemoving(true);
    setRemovalError(null);
    setMessage(null);
    const response = await requestNotificationApi<{ dismissedCount: number }>(
      "/api/notifications",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(removal),
      },
    );
    if (response.success) {
      setRemoval(null);
      setMessage(
        removal.scope === "ALL"
          ? "通知已清空。"
          : `已删除 ${response.data.dismissedCount} 条通知。`,
      );
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      await load(removal.scope === "ALL" ? 1 : result.pagination.page, filters);
      heading.current?.focus();
    } else {
      setRemovalError(response.error);
    }
    setRemoving(false);
    removalInFlight.current = false;
  }

  function openRemoval(request: NotificationDismissRequest) {
    setRemovalError(null);
    setRemoval(request);
  }

  return (
    <section className="min-w-0 space-y-5" aria-busy={loading}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
            通知中心
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            集中查看学习提醒与系统消息，打开通知即可了解详情。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowRemoval && (
            <>
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-700 disabled:opacity-50"
                disabled={loading || mutating || selectedIds.length === 0}
                onClick={() =>
                  openRemoval({ scope: "SELECTED", ids: selectedIds })
                }
              >
                <Trash2 aria-hidden="true" className="size-4" />
                删除{selectedIds.length ? `（${selectedIds.length}）` : ""}
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-800 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-50"
                disabled={
                  loading ||
                  mutating ||
                  (!filtered && result.pagination.total === 0)
                }
                onClick={() => openRemoval({ scope: "ALL" })}
              >
                <ListX aria-hidden="true" className="size-4" />
                全部清空
              </button>
            </>
          )}
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
            disabled={loading || mutating}
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
        </div>
      </header>
      {allowRemoval && (
        <EditorDialog
          open={removal !== null}
          busy={removing}
          title={removal?.scope === "ALL" ? "全部清空通知" : "删除已选通知"}
          onClose={() => {
            if (!removalInFlight.current) setRemoval(null);
          }}
        >
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {removal?.scope === "ALL"
              ? "将清空你账号里的全部通知，包括未读通知。此操作不受当前筛选限制。"
              : `将从你的通知中心移除已选的 ${removal?.ids.length ?? 0} 条通知。`}
          </p>
          {removalError && (
            <p role="alert" className="mt-3 text-sm text-rose-800">
              {removalError}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={removing}
              onClick={() => setRemoval(null)}
              className="min-h-10 rounded-lg border px-4 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={() => void confirmRemoval()}
              className="min-h-10 rounded-lg border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-50"
            >
              {removing
                ? "处理中…"
                : removal?.scope === "ALL"
                  ? "确认清空"
                  : "确认删除"}
            </button>
          </div>
        </EditorDialog>
      )}

      <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white/85 p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center">
        <div
          className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1"
          aria-label="已读状态"
        >
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
              disabled={mutating}
              aria-pressed={filters.status === item.value}
              className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium whitespace-nowrap transition disabled:opacity-50 sm:flex-none ${
                filters.status === item.value
                  ? "bg-white text-sky-700 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => applyFilter("status", item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Filter
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <select
            disabled={mutating}
            aria-label="通知类型"
            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pr-9 pl-9 text-sm text-slate-700 transition hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:opacity-50"
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
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400"
          />
        </div>
        <div className="relative min-w-0 flex-1">
          <Flag
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <select
            disabled={mutating}
            aria-label="通知优先级"
            className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pr-9 pl-9 text-sm text-slate-700 transition hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:opacity-50"
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
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400"
          />
        </div>
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

      <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span role="status">
          {loading
            ? "正在更新通知…"
            : `共 ${result.pagination.total} 条通知 · 按时间倒序`}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {allowRemoval && result.items.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-slate-700">
              <input
                type="checkbox"
                className="size-4 accent-sky-600"
                disabled={loading || mutating}
                checked={result.items.every((item) =>
                  selectedIds.includes(item.id),
                )}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? result.items.map((item) => item.id)
                      : [],
                  )
                }
              />
              全选本页
            </label>
          )}
          {filtered && (
            <button
              disabled={loading || mutating}
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
      </div>
      {loading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white p-12 text-slate-500"
        >
          <LoaderCircle className="size-5 animate-spin" />
          正在加载…
        </div>
      ) : result.items.length === 0 ? (
        <div className="rounded-xl border border-slate-200/80 bg-white px-6 py-14 text-center">
          <Bell className="mx-auto h-9 w-9 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-800">暂无通知</h2>
          <p className="mt-1 text-sm text-slate-500">
            试试切换状态或重置筛选。
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {result.items.map((item) => {
            const unread = item.readAt === null;
            const typeStyle = TYPE_STYLES[item.type];
            const TypeIcon = typeStyle.icon;
            return (
              <article
                key={item.id}
                className={`relative overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors ${
                  unread
                    ? "border-sky-200/90 bg-sky-50/50"
                    : "border-slate-200/80 bg-white hover:border-slate-300/90 hover:bg-slate-50/40"
                }`}
              >
                {unread ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[3px] bg-sky-500"
                  />
                ) : null}
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 px-4 py-4 pl-[1.125rem] sm:grid-cols-[auto_minmax(0,1fr)_14.5rem] sm:gap-x-4 sm:px-5">
                  <div className="flex items-start gap-3">
                    {allowRemoval && (
                      <label className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center self-start rounded-md transition hover:bg-slate-100 sm:mt-1">
                        <input
                          type="checkbox"
                          aria-label={`选择通知：${item.title}`}
                          className="size-4 accent-sky-600"
                          checked={selectedIds.includes(item.id)}
                          disabled={mutating}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedIds((ids) =>
                              checked
                                ? [...ids, item.id]
                                : ids.filter((id) => id !== item.id),
                            );
                          }}
                        />
                      </label>
                    )}
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${typeStyle.accent}`}
                    >
                      <TypeIcon className="size-[18px]" strokeWidth={1.8} />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2
                      className={`text-[15px] leading-6 break-words ${
                        unread
                          ? "font-semibold text-slate-900"
                          : "font-medium text-slate-700"
                      }`}
                    >
                      {item.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-6 break-words whitespace-pre-wrap text-slate-600 sm:text-sm">
                      {item.content}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium ${
                          unread
                            ? "bg-sky-700 text-white"
                            : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/70 ring-inset"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${unread ? "bg-white/90" : "bg-slate-400"}`}
                        />
                        {unread ? "未读" : "已读"}
                      </span>
                      <span className={`${PILL_BASE} ${typeStyle.pill}`}>
                        {TYPE_LABELS[item.type]}
                      </span>
                      {item.priority !== NotificationPriority.NORMAL ? (
                        <span
                          className={`${PILL_BASE} ${PRIORITY_STYLES[item.priority]}`}
                        >
                          {PRIORITY_LABELS[item.priority]}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock aria-hidden="true" className="size-3.5" />
                        <span className="tabular-nums">
                          {formatTime(item.createdAt)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2 flex w-full flex-wrap items-center gap-2 sm:col-span-1 sm:w-[14.5rem] sm:flex-nowrap sm:justify-end sm:self-center">
                    <NotificationLink
                      href={`/notifications/${encodeURIComponent(item.id)}`}
                      label="查看详情"
                      className={ACTION_LINK}
                    />
                    {unread ? (
                      <button
                        aria-label={`将“${item.title}”标记为已读`}
                        className={ACTION_BUTTON}
                        disabled={loading || mutating}
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
          <p className="text-sm text-slate-500">
            共 {result.pagination.total} 条，第 {result.pagination.page} /{" "}
            {result.pagination.totalPages} 页
          </p>
          <div className="flex gap-2">
            <button
              aria-label="上一页"
              className="rounded-md border border-slate-200 bg-white p-2 transition hover:bg-slate-50 disabled:opacity-40"
              disabled={loading || mutating || result.pagination.page <= 1}
              onClick={() => void load(result.pagination.page - 1, filters)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="下一页"
              className="rounded-md border border-slate-200 bg-white p-2 transition hover:bg-slate-50 disabled:opacity-40"
              disabled={
                loading ||
                mutating ||
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
