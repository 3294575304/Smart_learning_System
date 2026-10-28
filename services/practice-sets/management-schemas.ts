import { z } from "zod";
const item = {
  id: z.string().trim().min(1).max(128),
  expectedRevision: z.number().int().min(0),
};
export const practiceManagementSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("RENAME"),
      expectedRevision: item.expectedRevision,
      title: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      action: z.literal("END"),
      expectedRevision: item.expectedRevision,
    })
    .strict(),
  z
    .object({
      action: z.literal("TRASH"),
      expectedRevision: item.expectedRevision,
    })
    .strict(),
  z
    .object({
      action: z.literal("RESTORE"),
      expectedRevision: item.expectedRevision,
    })
    .strict(),
]);
export const practiceManagementBatchSchema = z
  .object({
    action: z.enum(["TRASH", "RESTORE"]),
    items: z.array(z.object(item).strict()).min(1).max(100),
  })
  .strict();
export interface PracticeManagementView {
  revision: number;
  title: string | null;
  endedAt: string | null;
  trashedAt: string | null;
}
