import type {
  SystemConfigCategory,
  SystemConfigKey,
  SystemConfigValueType,
  SystemConfigValues,
} from "@/services/system-config/definitions";

export interface SystemConfigItemView {
  key: SystemConfigKey;
  label: string;
  description: string;
  type: SystemConfigValueType;
  value: string | number | boolean;
  defaultValue: string | number | boolean;
  editable: boolean;
}

export interface SystemConfigCategoryView {
  key: SystemConfigCategory;
  label: string;
  items: SystemConfigItemView[];
}

export interface SystemConfigAdminView {
  values: SystemConfigValues;
  categories: SystemConfigCategoryView[];
  updatedAt: Date | null;
  updatedBy: { id: string; displayName: string; email: string } | null;
}

export interface SystemConfigUpdateResult extends SystemConfigAdminView {
  changedKeys: SystemConfigKey[];
}

export interface PublicSystemConfig {
  platformName: string;
  platformAnnouncement: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowSelfRegistration: boolean;
}
