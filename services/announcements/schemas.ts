import { AnnouncementStatus, AnnouncementTargetType } from "@prisma/client";
import { z } from "zod";

export const announcementIdSchema = z.string().cuid("公告 ID 格式无效");

const announcementFields = {
  title: z.string().trim().min(1, "公告标题不能为空").max(100),
  content: z.string().trim().min(1, "公告正文不能为空").max(2_000),
  targetType: z.nativeEnum(AnnouncementTargetType),
  expiresAt: z.coerce.date().nullable().optional(),
};

export const announcementCreateSchema = z.object(announcementFields).strict();

export const announcementUpdateSchema = z
  .object({
    title: announcementFields.title.optional(),
    content: announcementFields.content.optional(),
    targetType: announcementFields.targetType.optional(),
    expiresAt: announcementFields.expiresAt,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "至少更新一个字段");

export const announcementListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: z.nativeEnum(AnnouncementStatus).optional(),
    targetType: z.nativeEnum(AnnouncementTargetType).optional(),
  })
  .strict();

export type AnnouncementCreateInput = z.output<typeof announcementCreateSchema>;
export type AnnouncementUpdateInput = z.output<typeof announcementUpdateSchema>;
export type AnnouncementListQuery = z.output<
  typeof announcementListQuerySchema
>;
