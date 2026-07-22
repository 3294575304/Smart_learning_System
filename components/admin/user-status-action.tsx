"use client";

import { UserStatus } from "@prisma/client";
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
        className={
          disabling
            ? "text-sm text-red-600 disabled:text-gray-400"
            : "text-sm text-green-700 disabled:text-gray-400"
        }
        disabled={pending || isSelf}
        onClick={changeStatus}
        type="button"
      >
        {pending ? "处理中…" : disabling ? "禁用" : "启用"}
      </button>
    </span>
  );
}
