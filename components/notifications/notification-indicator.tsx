"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { requestNotificationApi } from "@/components/notifications/request-api";
import { formatUnreadBadge } from "@/components/notifications/presenters";

export const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";
const POLLING_INTERVAL_MS = 60_000;

export function NotificationIndicator() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const badge = formatUnreadBadge(count);

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const result = await requestNotificationApi<{ count: number }>(
      "/api/notifications/unread-count",
      { cache: "no-store" },
    );
    if (result.success) setCount(Math.max(0, result.data.count));
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const interval = window.setInterval(
      () => void refresh(),
      POLLING_INTERVAL_MS,
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onNotificationsChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(
      NOTIFICATIONS_CHANGED_EVENT,
      onNotificationsChanged,
    );
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(
        NOTIFICATIONS_CHANGED_EVENT,
        onNotificationsChanged,
      );
    };
  }, [refresh]);

  return (
    <Link
      aria-label={count > 0 ? `通知中心，${count} 条未读通知` : "通知中心"}
      className="relative rounded-md border bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-950"
      href="/notifications"
    >
      <Bell className="h-5 w-5" />
      {badge ? (
        <span className="absolute -top-2 -right-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
