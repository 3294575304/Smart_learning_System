import "server-only";

import { auditUserSnapshotSchema } from "@/services/audit/schemas";
import type { AuditLogListQuery } from "@/services/audit/schemas";
import {
  loadAuditLogPage,
  loadAuditTargetUsers,
} from "@/services/audit/repository";
import type {
  AuditLogListResult,
  AuditUserSnapshot,
} from "@/services/audit/types";

function safeSnapshot(value: unknown): AuditUserSnapshot | null {
  const parsed = auditUserSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function listAuditLogs(
  query: AuditLogListQuery,
): Promise<AuditLogListResult> {
  const { total, records } = await loadAuditLogPage(query);
  const targets = await loadAuditTargetUsers([
    ...new Set(records.map((record) => record.targetId)),
  ]);
  const targetById = new Map(targets.map((target) => [target.id, target]));

  return {
    items: records.map((record) => {
      const target = targetById.get(record.targetId);
      return {
        id: record.id,
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId,
        summary: record.summary,
        beforeData: safeSnapshot(record.beforeData),
        afterData: safeSnapshot(record.afterData),
        ipAddress: record.ipAddress,
        userAgent: record.userAgent,
        createdAt: record.createdAt,
        actor: {
          id: record.actor.id,
          email: record.actor.email,
          displayName: record.actor.profile?.displayName ?? record.actor.email,
        },
        target: target
          ? {
              id: target.id,
              email: target.email,
              displayName: target.profile?.displayName ?? target.email,
            }
          : null,
      };
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
