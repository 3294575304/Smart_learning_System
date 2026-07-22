import "server-only";

import { AuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeSystemConfigAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import {
  systemConfigDefinitions,
  systemConfigKeys,
  systemConfigValuesSchema,
  type SystemConfigCategory,
  type SystemConfigKey,
  type SystemConfigValues,
} from "@/services/system-config/definitions";
import { SystemConfigOperationError } from "@/services/system-config/errors";
import {
  findSystemConfig,
  saveSystemConfig,
  type SystemConfigRecord,
} from "@/services/system-config/repository";
import {
  systemConfigUpdatesSchema,
  type SystemConfigUpdates,
} from "@/services/system-config/schemas";
import type {
  PublicSystemConfig,
  SystemConfigAdminView,
  SystemConfigCategoryView,
  SystemConfigUpdateResult,
} from "@/services/system-config/types";
import { resolveSystemConfigValues } from "@/services/system-config/values";

const SERIALIZABLE_RETRY_LIMIT = 3;
const CATEGORY_LABELS: Record<SystemConfigCategory, string> = {
  GENERAL: "基础设置",
  ACCOUNT: "用户与账号",
  ASSIGNMENT: "作业设置",
  AI: "AI 功能",
};
const CATEGORY_ORDER: SystemConfigCategory[] = [
  "GENERAL",
  "ACCOUNT",
  "ASSIGNMENT",
  "AI",
];

function categories(values: SystemConfigValues): SystemConfigCategoryView[] {
  return CATEGORY_ORDER.map((category) => ({
    key: category,
    label: CATEGORY_LABELS[category],
    items: systemConfigKeys
      .filter((key) => systemConfigDefinitions[key].category === category)
      .map((key) => {
        const definition = systemConfigDefinitions[key];
        return {
          key,
          label: definition.label,
          description: definition.description,
          type: definition.type,
          value: values[key],
          defaultValue: definition.defaultValue,
          editable: definition.editable,
        };
      }),
  }));
}

function adminView(
  record: SystemConfigRecord | null,
  values = resolveSystemConfigValues(record),
): SystemConfigAdminView {
  return {
    values,
    categories: categories(values),
    updatedAt: record?.updatedAt ?? null,
    updatedBy: record?.updatedBy
      ? {
          id: record.updatedBy.id,
          email: record.updatedBy.email,
          displayName:
            record.updatedBy.profile?.displayName ?? record.updatedBy.email,
        }
      : null,
  };
}

async function serializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002");
      if (conflict && attempt < SERIALIZABLE_RETRY_LIMIT) continue;
      if (conflict) {
        throw new SystemConfigOperationError("配置已被其他管理员修改，请重试");
      }
      throw error;
    }
  }
  throw new SystemConfigOperationError("配置已被其他管理员修改，请重试");
}

function changedKeys(
  before: SystemConfigValues,
  updates: SystemConfigUpdates,
): SystemConfigKey[] {
  return systemConfigKeys.filter(
    (key) => updates[key] !== undefined && updates[key] !== before[key],
  );
}

function snapshot(
  values: SystemConfigValues,
  keys: SystemConfigKey[],
): AuditConfigSnapshot {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

async function writeConfigAuditLogs(
  transaction: Prisma.TransactionClient,
  input: {
    actorId: string;
    targetId: string;
    before: SystemConfigValues;
    after: SystemConfigValues;
    changed: SystemConfigKey[];
    context: AuditRequestContext;
  },
): Promise<void> {
  const normalKeys = input.changed.filter(
    (key) => key !== "maintenanceMode" && key !== "aiAnalysisEnabled",
  );
  if (normalKeys.length > 0) {
    await writeSystemConfigAuditLog(transaction, {
      actorId: input.actorId,
      action: AuditAction.SYSTEM_CONFIG_UPDATED,
      targetId: input.targetId,
      summary: `更新系统配置：${normalKeys
        .map((key) => systemConfigDefinitions[key].label)
        .join("、")}`,
      beforeData: snapshot(input.before, normalKeys),
      afterData: snapshot(input.after, normalKeys),
      context: input.context,
    });
  }
  if (input.changed.includes("maintenanceMode")) {
    await writeSystemConfigAuditLog(transaction, {
      actorId: input.actorId,
      action: input.after.maintenanceMode
        ? AuditAction.MAINTENANCE_MODE_ENABLED
        : AuditAction.MAINTENANCE_MODE_DISABLED,
      targetId: input.targetId,
      summary: `${input.after.maintenanceMode ? "开启" : "关闭"}维护模式`,
      beforeData: snapshot(input.before, ["maintenanceMode"]),
      afterData: snapshot(input.after, ["maintenanceMode"]),
      context: input.context,
    });
  }
  if (input.changed.includes("aiAnalysisEnabled")) {
    await writeSystemConfigAuditLog(transaction, {
      actorId: input.actorId,
      action: input.after.aiAnalysisEnabled
        ? AuditAction.AI_FEATURE_ENABLED
        : AuditAction.AI_FEATURE_DISABLED,
      targetId: input.targetId,
      summary: `${input.after.aiAnalysisEnabled ? "开启" : "关闭"} AI 增强学情分析`,
      beforeData: snapshot(input.before, ["aiAnalysisEnabled"]),
      afterData: snapshot(input.after, ["aiAnalysisEnabled"]),
      context: input.context,
    });
  }
}

export async function getSystemConfig(): Promise<SystemConfigValues> {
  return resolveSystemConfigValues(await findSystemConfig());
}

export async function getSystemConfigValue<K extends SystemConfigKey>(
  key: K,
): Promise<SystemConfigValues[K]> {
  const config = await getSystemConfig();
  return config[key];
}

export async function getPublicSystemConfig(): Promise<PublicSystemConfig> {
  const config = await getSystemConfig();
  return {
    platformName: config.platformName,
    platformAnnouncement: config.platformAnnouncement,
    maintenanceMode: config.maintenanceMode,
    maintenanceMessage: config.maintenanceMessage,
    allowSelfRegistration: config.allowSelfRegistration,
  };
}

export async function getAdminSystemConfig(): Promise<SystemConfigAdminView> {
  return adminView(await findSystemConfig());
}

export async function updateSystemConfig(
  actorId: string,
  rawUpdates: unknown,
  context: AuditRequestContext,
): Promise<SystemConfigUpdateResult> {
  const updates = systemConfigUpdatesSchema.parse(rawUpdates);
  return serializableTransaction(async (transaction) => {
    const beforeRecord = await findSystemConfig(transaction);
    const before = resolveSystemConfigValues(beforeRecord);
    const changed = changedKeys(before, updates);
    if (changed.length === 0) {
      return { ...adminView(beforeRecord, before), changedKeys: [] };
    }
    const safeUpdates = Object.fromEntries(
      changed.map((key) => [key, updates[key]]),
    ) as SystemConfigUpdates;
    const afterValues = systemConfigValuesSchema.parse({
      ...before,
      ...safeUpdates,
    });
    const afterRecord = await saveSystemConfig(
      transaction,
      actorId,
      safeUpdates,
      afterValues,
    );
    await writeConfigAuditLogs(transaction, {
      actorId,
      targetId: afterRecord.id,
      before,
      after: afterValues,
      changed,
      context,
    });
    return { ...adminView(afterRecord, afterValues), changedKeys: changed };
  });
}
