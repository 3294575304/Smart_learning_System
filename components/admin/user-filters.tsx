import { Role, UserStatus } from "@prisma/client";
import Link from "next/link";

import {
  ROLE_LABELS,
  USER_STATUS_LABELS,
} from "@/components/admin/user-labels";
import type { AdminUserListQuery } from "@/services/admin/users/schemas";

export function UserFilters({ query }: { query: AdminUserListQuery }) {
  return (
    <form
      className="bg-card grid gap-3 rounded-xl border p-4 md:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]"
      method="get"
    >
      <input
        className="rounded-md border px-3 py-2 text-sm"
        defaultValue={query.keyword}
        maxLength={100}
        name="keyword"
        placeholder="搜索姓名或邮箱"
      />
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.role ?? ""}
        name="role"
      >
        <option value="">全部角色</option>
        {Object.values(Role).map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.status ?? ""}
        name="status"
      >
        <option value="">全部状态</option>
        {Object.values(UserStatus).map((status) => (
          <option key={status} value={status}>
            {USER_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          type="submit"
        >
          筛选
        </button>
        <Link
          className="rounded-md border px-4 py-2 text-sm"
          href="/admin/users"
        >
          重置
        </Link>
      </div>
      <input name="pageSize" type="hidden" value={query.pageSize} />
      <input name="sortBy" type="hidden" value={query.sortBy} />
      <input name="sortOrder" type="hidden" value={query.sortOrder} />
    </form>
  );
}
