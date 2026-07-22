import "server-only";

import { AuditTargetType, Prisma, type AuditAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AuditLogListQuery } from "@/services/audit/schemas";
import type {
  AuditRequestContext,
  AuditUserSnapshot,
} from "@/services/audit/types";

const auditLogSelect = Prisma.validator<Prisma.AuditLogSelect>()({
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  summary: true,
  beforeData: true,
  afterData: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
    },
  },
});

export type AuditLogRecord = Prisma.AuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

interface WriteUserAuditInput {
  actorId: string;
  action: AuditAction;
  targetId: string;
  summary: string;
  beforeData: AuditUserSnapshot | null;
  afterData: AuditUserSnapshot | null;
  context: AuditRequestContext;
}

function jsonSnapshot(snapshot: AuditUserSnapshot): Prisma.InputJsonObject {
  return {
    displayName: snapshot.displayName,
    email: snapshot.email,
    role: snapshot.role,
    status: snapshot.status,
  };
}

export async function writeUserAuditLog(
  transaction: Prisma.TransactionClient,
  input: WriteUserAuditInput,
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: AuditTargetType.USER,
      targetId: input.targetId,
      summary: input.summary,
      ...(input.beforeData
        ? { beforeData: jsonSnapshot(input.beforeData) }
        : {}),
      ...(input.afterData ? { afterData: jsonSnapshot(input.afterData) } : {}),
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
    },
  });
}

export async function loadAuditLogPage(query: AuditLogListQuery): Promise<{
  total: number;
  records: AuditLogRecord[];
}> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(query.keyword
      ? {
          OR: [
            {
              summary: {
                contains: query.keyword,
                mode: "insensitive",
              },
            },
            {
              actor: {
                email: { contains: query.keyword, mode: "insensitive" },
              },
            },
            {
              actor: {
                profile: {
                  is: {
                    displayName: {
                      contains: query.keyword,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, records] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      select: auditLogSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, records };
}

export async function loadAuditTargetUsers(targetIds: string[]) {
  if (targetIds.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: targetIds } },
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
    },
  });
}
