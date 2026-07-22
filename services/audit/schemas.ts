import { AuditAction, Role, UserStatus } from "@prisma/client";
import { z } from "zod";

function auditDateInput(value: unknown, endOfDay: boolean): unknown {
  if (value === "") return undefined;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`;
  }
  return value;
}

export const auditLogListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    action: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.nativeEnum(AuditAction).optional(),
    ),
    actorId: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().cuid("操作人 ID 格式无效").optional(),
    ),
    targetId: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().cuid("目标用户 ID 格式无效").optional(),
    ),
    from: z.preprocess(
      (value) => auditDateInput(value, false),
      z.coerce.date().optional(),
    ),
    to: z.preprocess(
      (value) => auditDateInput(value, true),
      z.coerce.date().optional(),
    ),
    keyword: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1).max(100).optional(),
    ),
  })
  .strict()
  .refine(
    (query) => !query.from || !query.to || query.from <= query.to,
    "开始时间不能晚于结束时间",
  );

export type AuditLogListQuery = z.output<typeof auditLogListQuerySchema>;

export const auditUserSnapshotSchema = z
  .object({
    displayName: z.string().max(50),
    email: z.string().max(254),
    role: z.nativeEnum(Role),
    status: z.nativeEnum(UserStatus),
  })
  .strict();

export const auditConfigSnapshotSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const auditSnapshotSchema = z.union([
  auditUserSnapshotSchema,
  auditConfigSnapshotSchema,
]);
