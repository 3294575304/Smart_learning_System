import { Role } from "@prisma/client";
import Link from "next/link";

import { AuditLogFilters } from "@/components/admin/audit-log-filters";
import { AuditLogList } from "@/components/admin/audit-log-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  auditLogListQuerySchema,
  type AuditLogListQuery,
} from "@/services/audit/schemas";
import { listAuditLogs } from "@/services/audit/service";

interface AuditLogsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValues(values: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function pageHref(query: AuditLogListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.action) params.set("action", query.action);
  if (query.actorId) params.set("actorId", query.actorId);
  if (query.targetId) params.set("targetId", query.targetId);
  if (query.from) params.set("from", query.from.toISOString());
  if (query.to) params.set("to", query.to.toISOString());
  return `/admin/audit-logs?${params.toString()}`;
}

export default async function AuditLogsPage({
  searchParams,
}: AuditLogsPageProps) {
  await requirePageRole(Role.ADMIN);
  const parsed = auditLogListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : auditLogListQuerySchema.parse({});
  const logs = await listAuditLogs(query);
  return (
    <section className="space-y-6">
      <PageHeader
        description="查看管理员对用户账号和系统配置执行的重要操作。日志仅提供查询，不提供修改或删除。"
        title="管理操作审计"
      />
      <AuditLogFilters query={query} />
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {logs.pagination.total} 条记录</span>
        <span>
          第 {logs.pagination.page} / {Math.max(logs.pagination.totalPages, 1)}{" "}
          页
        </span>
      </div>
      <AuditLogList logs={logs.items} />
      {logs.pagination.totalPages > 1 ? (
        <nav className="flex justify-center gap-3">
          {query.page > 1 ? (
            <Link
              className="rounded-md border px-3 py-2"
              href={pageHref(query, query.page - 1)}
            >
              上一页
            </Link>
          ) : null}
          {query.page < logs.pagination.totalPages ? (
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
