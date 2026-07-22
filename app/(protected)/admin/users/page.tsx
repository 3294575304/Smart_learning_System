import { Role } from "@prisma/client";
import { Plus } from "lucide-react";
import Link from "next/link";

import { UserFilters } from "@/components/admin/user-filters";
import { UserList } from "@/components/admin/user-list";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  adminUserListQuerySchema,
  type AdminUserListQuery,
} from "@/services/admin/users/schemas";
import { listAdminUsers } from "@/services/admin/users/service";
import { requirePageRole } from "@/services/auth/page-authorization";

interface AdminUsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValues(values: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function pageHref(query: AdminUserListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.role) params.set("role", query.role);
  if (query.status) params.set("status", query.status);
  return `/admin/users?${params.toString()}`;
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const admin = await requirePageRole(Role.ADMIN);
  const parsed = adminUserListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : adminUserListQuerySchema.parse({});
  const users = await listAdminUsers(query);

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            href="/admin/users/new"
          >
            <Plus className="h-4 w-4" />
            创建用户
          </Link>
        }
        description="查询、创建和维护平台账号。所有重要变更都会写入审计日志。"
        title="用户管理"
      />
      <UserFilters query={query} />
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {users.pagination.total} 位用户</span>
        <span>
          第 {users.pagination.page} /{" "}
          {Math.max(users.pagination.totalPages, 1)} 页
        </span>
      </div>
      <UserList currentAdminId={admin.id} users={users.items} />
      {users.pagination.totalPages > 1 ? (
        <nav className="flex justify-center gap-3">
          {query.page > 1 ? (
            <Link
              className="rounded-md border px-3 py-2"
              href={pageHref(query, query.page - 1)}
            >
              上一页
            </Link>
          ) : null}
          {query.page < users.pagination.totalPages ? (
            <Link
              className="rounded-md border px-3 py-2"
              href={pageHref(query, query.page + 1)}
            >
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
