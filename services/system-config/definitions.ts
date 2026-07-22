import { z } from "zod";

export const systemConfigValueSchemas = {
  platformName: z.string().trim().min(1, "平台名称不能为空").max(50),
  platformAnnouncement: z.string().trim().max(2000),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().trim().min(1, "维护提示不能为空").max(500),
  allowSelfRegistration: z.boolean(),
  assignmentDefaultDueDays: z.number().int().min(1).max(365),
  assignmentAutosaveDelayMs: z.number().int().min(500).max(10_000),
  aiAnalysisEnabled: z.boolean(),
} as const;

export const systemConfigValuesSchema = z
  .object(systemConfigValueSchemas)
  .strict();

export type SystemConfigValues = z.output<typeof systemConfigValuesSchema>;
export type SystemConfigKey = keyof SystemConfigValues;
export type SystemConfigCategory = "GENERAL" | "ACCOUNT" | "ASSIGNMENT" | "AI";
export type SystemConfigValueType = "STRING" | "TEXT" | "BOOLEAN" | "INTEGER";

interface SystemConfigDefinition {
  category: SystemConfigCategory;
  label: string;
  description: string;
  type: SystemConfigValueType;
  defaultValue: string | number | boolean;
  editable: boolean;
  public: boolean;
  sensitive: boolean;
}

export const systemConfigDefinitions = {
  platformName: {
    category: "GENERAL",
    label: "平台名称",
    description: "显示在登录、注册和工作台中的平台名称。",
    type: "STRING",
    defaultValue: "智学课堂",
    editable: true,
    public: true,
    sensitive: false,
  },
  platformAnnouncement: {
    category: "GENERAL",
    label: "平台公告",
    description: "为空时不展示；填写后显示在登录页和工作台顶部。",
    type: "TEXT",
    defaultValue: "",
    editable: true,
    public: true,
    sensitive: false,
  },
  maintenanceMode: {
    category: "GENERAL",
    label: "维护模式",
    description: "开启后教师和学生的页面及业务接口暂停访问，管理员不受影响。",
    type: "BOOLEAN",
    defaultValue: false,
    editable: true,
    public: true,
    sensitive: false,
  },
  maintenanceMessage: {
    category: "GENERAL",
    label: "维护提示",
    description: "维护期间向教师和学生展示的提示文本。",
    type: "TEXT",
    defaultValue: "系统维护中，请稍后再试。",
    editable: true,
    public: true,
    sensitive: false,
  },
  allowSelfRegistration: {
    category: "ACCOUNT",
    label: "允许学生自主注册",
    description: "公开注册始终只能创建学生账号；关闭后管理员仍可创建用户。",
    type: "BOOLEAN",
    defaultValue: true,
    editable: true,
    public: true,
    sensitive: false,
  },
  assignmentDefaultDueDays: {
    category: "ASSIGNMENT",
    label: "作业默认截止天数",
    description: "教师新建作业时，截止时间相对发布时间的默认天数。",
    type: "INTEGER",
    defaultValue: 7,
    editable: true,
    public: false,
    sensitive: false,
  },
  assignmentAutosaveDelayMs: {
    category: "ASSIGNMENT",
    label: "答题自动保存延迟",
    description: "学生修改答案后等待多少毫秒再自动保存，避免过于频繁请求。",
    type: "INTEGER",
    defaultValue: 900,
    editable: true,
    public: false,
    sensitive: false,
  },
  aiAnalysisEnabled: {
    category: "AI",
    label: "启用 AI 增强学情分析",
    description: "关闭后不调用 AI Provider，学情分析继续使用现有规则能力。",
    type: "BOOLEAN",
    defaultValue: true,
    editable: true,
    public: false,
    sensitive: false,
  },
} as const satisfies Record<SystemConfigKey, SystemConfigDefinition>;

export const systemConfigKeys = Object.keys(
  systemConfigDefinitions,
) as SystemConfigKey[];

export const defaultSystemConfig: SystemConfigValues =
  systemConfigValuesSchema.parse(
    Object.fromEntries(
      systemConfigKeys.map((key) => [
        key,
        systemConfigDefinitions[key].defaultValue,
      ]),
    ),
  );

export const publicSystemConfigKeys = systemConfigKeys.filter(
  (key) =>
    systemConfigDefinitions[key].public &&
    !systemConfigDefinitions[key].sensitive,
);
