import {
  AUDIT_ACTION_LABELS,
  ROLE_LABELS,
  USER_STATUS_LABELS,
} from "@/components/admin/user-labels";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { AuditLogView, AuditUserSnapshot } from "@/services/audit/types";

function snapshotRows(
  before: AuditUserSnapshot | null,
  after: AuditUserSnapshot | null,
) {
  const fields = [
    ["姓名", before?.displayName, after?.displayName],
    ["邮箱", before?.email, after?.email],
    [
      "角色",
      before ? ROLE_LABELS[before.role] : undefined,
      after ? ROLE_LABELS[after.role] : undefined,
    ],
    [
      "状态",
      before ? USER_STATUS_LABELS[before.status] : undefined,
      after ? USER_STATUS_LABELS[after.status] : undefined,
    ],
  ] as const;
  return fields.filter(([, left, right]) => left !== right && (left || right));
}

export function AuditLogList({ logs }: { logs: AuditLogView[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        description="调整筛选条件后重试。"
        icon={ScrollText}
        title="没有找到审计记录"
      />
    );
  }
  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const changes = snapshotRows(log.beforeData, log.afterData);
        return (
          <article className="bg-card rounded-xl border p-4" key={log.id}>
            <div className="flex flex-col justify-between gap-2 sm:flex-row">
              <div>
                <p className="font-medium">
                  {AUDIT_ACTION_LABELS[log.action]} · {log.summary}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  操作人：{log.actor.displayName}（{log.actor.email}） ·
                  操作对象：{log.target?.displayName ?? log.targetId}
                </p>
              </div>
              <time className="text-muted-foreground shrink-0 text-sm">
                {log.createdAt.toLocaleString("zh-CN")}
              </time>
            </div>
            {changes.length > 0 ? (
              <details className="mt-3 rounded-md bg-gray-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  查看安全变更摘要
                </summary>
                <dl className="mt-3 grid gap-2">
                  {changes.map(([label, before, after]) => (
                    <div
                      className="grid grid-cols-[5rem_1fr] gap-2"
                      key={label}
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>
                        {before ?? "—"} → {after ?? "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
            {log.ipAddress || log.userAgent ? (
              <p className="text-muted-foreground mt-3 text-xs break-all">
                {log.ipAddress ? `IP：${log.ipAddress}` : ""}
                {log.ipAddress && log.userAgent ? " · " : ""}
                {log.userAgent ? `客户端：${log.userAgent}` : ""}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
import { ScrollText } from "lucide-react";
