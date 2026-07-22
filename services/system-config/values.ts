import {
  defaultSystemConfig,
  systemConfigValuesSchema,
  type SystemConfigValues,
} from "@/services/system-config/definitions";

export interface StoredSystemConfigValues {
  platformName: string;
  platformAnnouncement: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowSelfRegistration: boolean;
  assignmentDefaultDueDays: number;
  assignmentAutosaveDelayMs: number;
  aiAnalysisEnabled: boolean;
}

export function resolveSystemConfigValues(
  record: StoredSystemConfigValues | null,
): SystemConfigValues {
  if (!record) return { ...defaultSystemConfig };
  return systemConfigValuesSchema.parse({
    platformName: record.platformName,
    platformAnnouncement: record.platformAnnouncement,
    maintenanceMode: record.maintenanceMode,
    maintenanceMessage: record.maintenanceMessage,
    allowSelfRegistration: record.allowSelfRegistration,
    assignmentDefaultDueDays: record.assignmentDefaultDueDays,
    assignmentAutosaveDelayMs: record.assignmentAutosaveDelayMs,
    aiAnalysisEnabled: record.aiAnalysisEnabled,
  });
}
