import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { SystemConfigValues } from "@/services/system-config/definitions";
import type { SystemConfigUpdates } from "@/services/system-config/schemas";

const systemConfigSelect = Prisma.validator<Prisma.SystemConfigSelect>()({
  id: true,
  singletonKey: true,
  platformName: true,
  platformAnnouncement: true,
  maintenanceMode: true,
  maintenanceMessage: true,
  allowSelfRegistration: true,
  assignmentDefaultDueDays: true,
  assignmentAutosaveDelayMs: true,
  aiAnalysisEnabled: true,
  updatedAt: true,
  updatedBy: {
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
    },
  },
});

export type SystemConfigRecord = Prisma.SystemConfigGetPayload<{
  select: typeof systemConfigSelect;
}>;

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export function findSystemConfig(
  client: DatabaseClient = prisma,
): Promise<SystemConfigRecord | null> {
  return client.systemConfig.findUnique({
    where: { singletonKey: "default" },
    select: systemConfigSelect,
  });
}

export function saveSystemConfig(
  transaction: Prisma.TransactionClient,
  actorId: string,
  updates: SystemConfigUpdates,
  valuesForCreate: SystemConfigValues,
): Promise<SystemConfigRecord> {
  return transaction.systemConfig.upsert({
    where: { singletonKey: "default" },
    update: { ...updates, updatedById: actorId },
    create: {
      singletonKey: "default",
      ...valuesForCreate,
      updatedById: actorId,
    },
    select: systemConfigSelect,
  });
}
