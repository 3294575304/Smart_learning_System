import { z } from "zod";

const optionalText = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((value) =>
      String(value).normalize("NFKC").replace(/\s+/gu, " ").trim(),
    )
    .refine((value) => value.length <= max, `内容不能超过 ${max} 个字符`)
    .optional();

export const courseCatalogFieldSchema = z.enum([
  "name",
  "courseNo",
  "credits",
  "hours",
  "term",
  "category",
  "nature",
]);

export type CourseCatalogField = z.infer<typeof courseCatalogFieldSchema>;

/** 表头识别结果：字段到列下标的映射。 */
export interface CourseCatalogColumns {
  name: number;
  courseNo?: number;
  credits?: number;
  hours?: number;
  term?: number;
  category?: number;
  nature?: number;
}

export interface CourseCatalogRow {
  rowNumber: number;
  name: string;
  courseNo: string;
  credits: string;
  hours: string;
  term: string;
  category: string;
  nature: string;
}

export interface CourseCatalogTable {
  sheetName: string;
  sheetIndex: number;
  headerRowNumber: number;
  columns: CourseCatalogColumns;
  rows: CourseCatalogRow[];
  duplicateCount: number;
}

/** 送入 AI 的表格切片，避免把整份工作簿塞进提示词。 */
export interface CourseCatalogAIInput {
  fileName: string;
  sheetName: string;
  headerLabels: string[];
  rows: Array<{ rowNumber: number; cells: string[] }>;
}

const aiCourseSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    courseNo: optionalText(50),
    credits: optionalText(20),
    hours: optionalText(20),
    term: optionalText(40),
    category: optionalText(60),
    nature: optionalText(60),
  })
  .strict();

export const courseCatalogAIOutputSchema = z
  .object({
    courses: z.array(aiCourseSchema).max(400),
  })
  .strict();

export type CourseCatalogAICourse = z.infer<typeof aiCourseSchema>;
export type CourseCatalogAIOutput = z.infer<typeof courseCatalogAIOutputSchema>;

export interface CourseCategoryImportCandidate {
  key: string;
  name: string;
  courseNo: string;
  credits: string;
  hours: string;
  term: string;
  category: string;
  nature: string;
  rowNumber: number | null;
  exists: boolean;
}

export interface CourseCategoryImportPreview {
  fileName: string;
  format: "csv" | "xls" | "xlsx";
  sheetName: string;
  headerRowNumber: number | null;
  extractor: "AI" | "RULE";
  aiNote: string | null;
  candidates: CourseCategoryImportCandidate[];
  warnings: string[];
  summary: {
    total: number;
    available: number;
    existing: number;
    ignored: number;
  };
}

export const courseCategoryBulkInputSchema = z
  .object({
    names: z.array(z.string().trim().min(1).max(100)).min(1).max(300),
    sourceFileName: z.string().trim().max(200).optional(),
    extractor: z.enum(["AI", "RULE"]).optional(),
  })
  .strict();

export type CourseCategoryBulkInput = z.infer<
  typeof courseCategoryBulkInputSchema
>;
