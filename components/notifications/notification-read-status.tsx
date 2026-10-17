"use client";

import { useCallback, useEffect, useState } from "react";
import { requestNotificationApi } from "@/components/notifications/request-api";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/components/notifications/notification-indicator";

export function NotificationReadStatus({
  id,
  alreadyRead,
}: {
  id: string;
  alreadyRead: boolean;
}) {
  const [state, setState] = useState<"read" | "pending" | "error">(
    alreadyRead ? "read" : "pending",
  );
  const sync = useCallback(async () => {
    setState("pending");
    const result = await requestNotificationApi<{ readAt: Date }>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      { method: "PATCH" },
    );
    setState(result.success ? "read" : "error");
    if (result.success)
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }, [id]);
  useEffect(() => {
    if (!alreadyRead) void sync();
  }, [alreadyRead, sync]);
  return (
    <span className="ml-auto text-xs text-slate-500" role="status">
      {state === "read" ? (
        "已读"
      ) : state === "pending" ? (
        "正在同步已读状态…"
      ) : (
        <>
          <span>已读状态同步失败</span>
          <button
            className="ml-2 text-sky-700 underline"
            onClick={() => void sync()}
          >
            重试
          </button>
        </>
      )}
    </span>
  );
}
