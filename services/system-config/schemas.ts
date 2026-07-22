import { z } from "zod";

import {
  systemConfigValuesSchema,
  type SystemConfigValues,
} from "@/services/system-config/definitions";

const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

export const systemConfigUpdatesSchema = systemConfigValuesSchema
  .partial()
  .strict()
  .superRefine((updates, context) => {
    if (Object.keys(updates).length === 0) {
      context.addIssue({ code: "custom", message: "至少需要修改一项配置" });
    }
    for (const key of Object.getOwnPropertyNames(updates)) {
      if (forbiddenKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "配置键不允许使用",
        });
      }
    }
  });

export const systemConfigUpdateRequestSchema = z
  .object({ updates: systemConfigUpdatesSchema })
  .strict();

export type SystemConfigUpdates = Partial<SystemConfigValues>;
export type SystemConfigUpdateRequest = z.output<
  typeof systemConfigUpdateRequestSchema
>;
