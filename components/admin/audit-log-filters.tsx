import { AuditAction } from "@prisma/client";
import Link from "next/link";

import { AUDIT_ACTION_LABELS } from "@/components/admin/user-labels";
import type { AuditLogListQuery } from "@/services/audit/schemas";

function dateValue(value: Date | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function AuditLogFilters({ query }: { query: AuditLogListQuery }) {
  return (
    <form
      className="bg-card grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(12rem,1fr)_11rem_10rem_10rem_auto]"
      method="get"
    >
      <input
        className="rounded-md border px-3 py-2 text-sm"
        defaultValue={query.keyword}
        maxLength={100}
        name="keyword"
        placeholder="搜索摘要或操作人"
      />
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.action ?? ""}
        name="action"
      >
        <option value="">全部操作</option>
        {Object.values(AuditAction).map((action) => (
          <option key={action} value={action}>
            {AUDIT_ACTION_LABELS[action]}
          </option>
        ))}
      </select>
      <input
        aria-label="开始日期"
        className="rounded-md border px-3 py-2 text-sm"
        defaultValue={dateValue(query.from)}
        name="from"
        type="date"
      />
      <input
        aria-label="结束日期"
        className="rounded-md border px-3 py-2 text-sm"
        defaultValue={dateValue(query.to)}
        name="to"
        type="date"
      />
      <div className="flex gap-2">
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          type="submit"
        >
          筛选
        </button>
        <Link
          className="rounded-md border px-4 py-2 text-sm"
          href="/admin/audit-logs"
        >
          重置
        </Link>
      </div>
      <input name="pageSize" type="hidden" value={query.pageSize} />
    </form>
  );
}
