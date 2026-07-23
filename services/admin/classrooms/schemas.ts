import { ClassroomStatus } from "@prisma/client";
import { z } from "zod";

export const adminClassroomIdSchema = z.string().cuid("班级 ID 格式无效");

export const adminClassroomListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    keyword: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1).max(100).optional(),
    ),
    status: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.nativeEnum(ClassroomStatus).optional(),
    ),
  })
  .strict();

export type AdminClassroomListQuery = z.output<
  typeof adminClassroomListQuerySchema
>;
