import { z } from "zod";

import { dashboardActivityTypes } from "@/services/admin/dashboard/types";

export const dashboardTrendQuerySchema = z
  .object({
    range: z.enum(["7d", "30d", "90d"]).default("30d"),
  })
  .strict();

export const dashboardActivityQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).default(10),
    type: z.enum(dashboardActivityTypes).default("ALL"),
  })
  .strict();

export type DashboardTrendQuery = z.output<typeof dashboardTrendQuerySchema>;
export type DashboardActivityQuery = z.output<
  typeof dashboardActivityQuerySchema
>;
