import "server-only";

import { AuditTargetType } from "@prisma/client";

import { auditSnapshotSchema } from "@/services/audit/schemas";
import type { AuditLogListQuery } from "@/services/audit/schemas";
import {
  loadAuditLogPage,
  loadAuditTargetUsers,
} from "@/services/audit/repository";
import type { AuditLogListResult, AuditSnapshot } from "@/services/audit/types";

function safeSnapshot(value: unknown): AuditSnapshot | null {
  const parsed = auditSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function listAuditLogs(
  query: AuditLogListQuery,
): Promise<AuditLogListResult> {
  const { total, records } = await loadAuditLogPage(query);
  const targets = await loadAuditTargetUsers([
    ...new Set(
      records
        .filter((record) => record.targetType === AuditTargetType.USER)
        .map((record) => record.targetId),
    ),
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
        targetLabel:
          record.targetType === AuditTargetType.SYSTEM_CONFIG
            ? "系统配置"
            : record.targetType === AuditTargetType.ANNOUNCEMENT
              ? "系统公告"
              : record.targetType === AuditTargetType.COURSE
                ? `课程 ${record.targetId}`
                : record.targetType === AuditTargetType.COURSE_TEMPLATE
                  ? `课程模板 ${record.targetId}`
                  : record.targetType === AuditTargetType.COURSE_FILE
                    ? `课程文件 ${record.targetId}`
                    : record.targetType === AuditTargetType.STUDENT_IMPORT_BATCH
                      ? `导入批次 ${record.targetId}`
                      : record.targetType === AuditTargetType.QUESTION
                        ? `题目 ${record.targetId}`
                        : record.targetType === AuditTargetType.CLASSROOM
                          ? `班级 ${record.targetId}`
                          : record.targetType === AuditTargetType.SUBMISSION
                            ? `提交 ${record.targetId}`
                            : record.targetType === AuditTargetType.ASSIGNMENT
                              ? `作业 ${record.targetId}`
                              : (target?.profile?.displayName ??
                                  target?.email ??
                                  record.targetId),
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
