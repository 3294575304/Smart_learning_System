import { z } from "zod";
const reason = z.string().trim().min(2, "请填写至少2字的原因").max(500);
export const extendAssignmentSchema = z
  .object({ requestId: z.string().uuid(), dueAt: z.coerce.date(), reason })
  .strict();
export const issueMakeupSchema = z
  .object({
    requestId: z.string().uuid(),
    studentIds: z
      .array(z.string().cuid())
      .min(1)
      .max(200)
      .refine((v) => new Set(v).size === v.length, "学生不能重复"),
    expiresAt: z.coerce.date(),
    reason,
  })
  .strict();
export const revokeMakeupSchema = z.object({ reason }).strict();
