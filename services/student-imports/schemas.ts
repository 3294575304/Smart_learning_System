import { z } from "zod";

import {
  studentImportFields,
  type StudentImportField,
} from "@/services/student-imports/types";

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

const requiredMappingSelectionSchema = z
  .string()
  .min(1, "请选择对应的源文件列");
const optionalMappingSelectionSchema = z.string();

export const studentImportMappingFormSchema = z
  .object({
    academicTerm: requiredMappingSelectionSchema,
    courseNo: requiredMappingSelectionSchema,
    studentNo: requiredMappingSelectionSchema,
    studentName: requiredMappingSelectionSchema,
    className: requiredMappingSelectionSchema,
    email: optionalMappingSelectionSchema,
    phone: optionalMappingSelectionSchema,
    gradeMark: optionalMappingSelectionSchema,
    finalGrade: optionalMappingSelectionSchema,
    specialReason: optionalMappingSelectionSchema,
    gradeType: optionalMappingSelectionSchema,
    remark: optionalMappingSelectionSchema,
  })
  .superRefine((input, context) => {
    const selections = Object.entries(input).filter(
      (entry): entry is [StudentImportField, string] => entry[1] !== "",
    );
    const usedColumns = new Map<string, StudentImportField>();

    for (const [field, sourceColumnIndex] of selections) {
      if (!/^\d+$/u.test(sourceColumnIndex)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "源文件列格式无效",
        });
        continue;
      }

      const previousField = usedColumns.get(sourceColumnIndex);
      if (previousField) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "同一源文件列不能映射到多个字段",
        });
      } else {
        usedColumns.set(sourceColumnIndex, field);
      }
    }
  })
  .transform((input) => ({
    fieldMappings: Object.fromEntries(
      Object.entries(input)
        .filter(
          (entry): entry is [StudentImportField, string] => entry[1] !== "",
        )
        .map(([field, sourceColumnIndex]) => [
          field,
          Number(sourceColumnIndex),
        ]),
    ) as Partial<Record<StudentImportField, number>>,
  }));

export type StudentImportMappingFormInput = z.input<
  typeof studentImportMappingFormSchema
>;
export type StudentImportMappingFormData = z.output<
  typeof studentImportMappingFormSchema
>;
