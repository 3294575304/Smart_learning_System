import Link from "next/link";
import { Users } from "lucide-react";

import { UserStatusAction } from "@/components/admin/user-status-action";
import {
  ROLE_LABELS,
  USER_STATUS_LABELS,
} from "@/components/admin/user-labels";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { AdminUserView } from "@/services/admin/users/types";

function roleSummary(user: AdminUserView): string {
  if (user.role === "TEACHER") {
    return `${user.summary.teacherNo ?? "未设置工号"} · ${user.summary.taughtClassroomCount} 个班级`;
  }
  if (user.role === "STUDENT") {
    return `${user.summary.studentNo ?? "未设置学号"} · ${user.summary.classMembershipCount} 个班级 · ${user.summary.submissionCount} 次提交`;
  }
  return "平台管理员";
}

export function UserList({
  users,
  currentAdminId,
}: {
  users: AdminUserView[];
  currentAdminId: string;
}) {
  if (users.length === 0) {
    return (
      <EmptyState
        description="调整搜索或筛选条件后重试。"
        icon={Users}
        title="没有找到用户"
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">用户</th>
            <th className="px-4 py-3 font-medium">角色</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 font-medium">角色摘要</th>
            <th className="px-4 py-3 font-medium">创建时间</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((user) => {
            const isSelf = user.id === currentAdminId;
            return (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {user.displayName}
                    {isSelf ? "（当前账号）" : ""}
                  </p>
                  <p className="text-muted-foreground">{user.email}</p>
                </td>
                <td className="px-4 py-3">{ROLE_LABELS[user.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      user.status === "ACTIVE"
                        ? "rounded-full bg-green-50 px-2 py-1 text-green-700"
                        : "rounded-full bg-gray-100 px-2 py-1 text-gray-600"
                    }
                  >
                    {USER_STATUS_LABELS[user.status]}
                  </span>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {roleSummary(user)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {user.createdAt.toLocaleString("zh-CN")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <Link
                      className="text-sm underline underline-offset-4"
                      href={`/admin/users/${user.id}/edit`}
                    >
                      编辑
                    </Link>
                    <UserStatusAction
                      displayName={user.displayName ?? user.email ?? user.id}
                      isSelf={isSelf}
                      status={user.status}
                      userId={user.id}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
