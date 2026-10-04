"use client";

import { UserStatus } from "@prisma/client";
import { Ban, Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAdminApi } from "@/components/admin/request-api";
import type { AdminUserView } from "@/services/admin/users/types";

export function UserStatusAction({
  userId,
  displayName,
  status,
  isSelf,
}: {
  userId: string;
  displayName: string;
  status: UserStatus;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const disabling = status === UserStatus.ACTIVE;

  async function changeStatus() {
    if (
      disabling &&
      !window.confirm(
        `确认禁用“${displayName}”吗？该用户将无法继续登录，现有会话也会立即失效。`,
      )
    )
      return;
    setPending(true);
    const result = await requestAdminApi<AdminUserView>(
      `/api/admin/users/${userId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: disabling ? UserStatus.INACTIVE : UserStatus.ACTIVE,
        }),
      },
    );
    setPending(false);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    window.alert(disabling ? "用户已禁用。" : "用户已启用。");
    router.refresh();
  }

  return (
    <span
      className="inline-flex"
      title={isSelf ? "不能禁用当前登录的管理员账号" : undefined}
    >
      <button
        aria-label={`${disabling ? "禁用" : "启用"}用户 ${displayName}`}
        className={`inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-2 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm ${disabling ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
        disabled={pending || isSelf}
        onClick={changeStatus}
        title={isSelf ? "不能禁用当前登录的管理员账号" : undefined}
        type="button"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : disabling ? (
          <Ban aria-hidden="true" className="size-4" />
        ) : (
          <Check aria-hidden="true" className="size-4" />
        )}
        {pending ? "处理中…" : disabling ? "禁用" : "启用"}
      </button>
    </span>
  );
}
