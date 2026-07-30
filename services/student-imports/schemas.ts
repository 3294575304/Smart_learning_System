import { z } from "zod";

import { studentImportFields } from "@/services/student-imports/types";

export const studentImportBatchIdSchema = z
  .string()
  .cuid("导入批次 ID 格式无效");

export const studentImportFieldSchema = z.enum(studentImportFields);

const pageSchema = z.coerce
  .number()
  .int("页码必须是整数")
  .min(1, "页码不能小于 1")
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int("每页数量必须是整数")
  .min(1, "每页至少 1 条")
  .max(100, "每页不能超过 100 条")
  .default(25);

export const studentImportPreviewPaginationSchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

export const studentImportManualMappingsSchema = z
  .record(
    studentImportFieldSchema,
    z.number().int("列序号必须是整数").min(0, "列序号不能小于 0").max(255),
  )
  .optional();

export const studentImportPreviewRequestSchema = z
  .object({
    classroomId: z.string().cuid("目标班级 ID 格式无效").optional(),
    sheetName: z
      .string()
      .trim()
      .min(1, "工作表名称不能为空")
      .max(100, "工作表名称不能超过 100 个字符")
      .optional(),
    headerRowNumber: z
      .number()
      .int("表头行号必须是整数")
      .min(1, "表头行号不能小于 1")
      .max(100, "表头行号不能超过 100")
      .optional(),
    fieldMappings: studentImportManualMappingsSchema,
    confirmMapping: z.boolean().default(false),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

export type StudentImportPreviewRequestInput = z.input<
  typeof studentImportPreviewRequestSchema
>;
export type StudentImportPreviewRequestData = z.output<
  typeof studentImportPreviewRequestSchema
>;
export type StudentImportPreviewPaginationData = z.output<
  typeof studentImportPreviewPaginationSchema
>;
