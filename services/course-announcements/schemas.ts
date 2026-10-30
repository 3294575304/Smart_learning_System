import { AnnouncementStatus } from "@prisma/client";
import { z } from "zod";

import { classroomIdSchema, courseIdSchema } from "@/services/courses/schemas";

/** 课程通知的 ID 与公告同表，校验规则保持一致。 */
export const courseAnnouncementIdSchema = z.string().cuid("通知 ID 格式无效");

const titleField = z
  .string()
  .trim()
  .min(1, "通知标题不能为空")
  .max(100, "标题最多 100 字");

const contentField = z
  .string()
  .trim()
  .min(1, "通知正文不能为空")
  .max(2_000, "正文最多 2000 字");

/**
 * 有效期以「天数」下发，避免前端构造绝对时间时区偏移。
 * null / undefined 表示不自动过期；0 视为不过期，便于前端「永不过期」选项。
 */
const expiresInDaysField = z.coerce
  .number()
  .int("有效期必须是整数天")
  .min(0, "有效期不能为负")
  .max(365, "有效期最多 365 天")
  .nullable()
  .optional();

export const courseAnnouncementCreateSchema = z
  .object({
    courseId: courseIdSchema,
    classroomIds: z.array(classroomIdSchema).min(1, "至少选择一个班级").max(20),
    title: titleField,
    content: contentField,
    expiresInDays: expiresInDaysField,
    publish: z.boolean().optional().default(false),
    confirmDuplicate: z.boolean().optional().default(false),
  })
  .strict();

export const courseAnnouncementUpdateSchema = z
  .object({
    title: titleField.optional(),
    content: contentField.optional(),
    classroomId: classroomIdSchema.optional(),
    expiresInDays: expiresInDaysField,
  })
  .strict()
  .refine(
    // null 是合法值（清除有效期），因此只把 undefined 视为「未提供」。
    (value) => Object.values(value).some((item) => item !== undefined),
    "至少更新一个字段",
  );

export const courseAnnouncementListQuerySchema = z
  .object({
    courseId: courseIdSchema,
    classroomId: classroomIdSchema.optional(),
    status: z.nativeEnum(AnnouncementStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const courseAnnouncementAudienceQuerySchema = z
  .object({
    courseId: courseIdSchema,
    classroomIds: z
      .string()
      .transform((value) => value.split(",").filter(Boolean))
      .pipe(z.array(classroomIdSchema).min(1).max(20)),
  })
  .strict();

export const courseAnnouncementBatchSchema = z
  .object({
    courseId: courseIdSchema,
    batchId: z.string().min(1).max(128),
  })
  .strict();

export type CourseAnnouncementCreateInput = z.output<
  typeof courseAnnouncementCreateSchema
>;
export type CourseAnnouncementUpdateInput = z.output<
  typeof courseAnnouncementUpdateSchema
>;
export type CourseAnnouncementListQuery = z.output<
  typeof courseAnnouncementListQuerySchema
>;
export type CourseAnnouncementAudienceQuery = z.output<
  typeof courseAnnouncementAudienceQuerySchema
>;
export type CourseAnnouncementBatchInput = z.output<
  typeof courseAnnouncementBatchSchema
>;
