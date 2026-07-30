import { z } from "zod";

const templateCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "课程模板编码至少需要 3 个字符")
  .max(64, "课程模板编码不能超过 64 个字符")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    "课程模板编码只能包含小写字母、数字和连字符",
  );

const templateNameSchema = z
  .string()
  .trim()
  .min(2, "课程模板名称至少需要 2 个字符")
  .max(100, "课程模板名称不能超过 100 个字符");

const templateDescriptionSchema = z
  .string()
  .trim()
  .max(500, "课程模板描述不能超过 500 个字符")
  .transform((value) => value || null);

const templateVersionSchema = z
  .string()
  .trim()
  .min(1, "课程模板版本不能为空")
  .max(20, "课程模板版本不能超过 20 个字符");

const courseNoSchema = z
  .string()
  .trim()
  .min(1, "课程号不能为空")
  .max(50, "课程号不能超过 50 个字符")
  .transform((value) => value.toUpperCase());

const termSchema = z
  .string()
  .trim()
  .min(1, "学期不能为空")
  .max(50, "学期不能超过 50 个字符");

const courseNameSchema = z
  .string()
  .trim()
  .min(2, "课程名称至少需要 2 个字符")
  .max(100, "课程名称不能超过 100 个字符");

const courseDescriptionSchema = z
  .string()
  .trim()
  .max(1000, "课程描述不能超过 1000 个字符")
  .transform((value) => value || null);

export const courseTemplateIdSchema = z.string().cuid("课程模板 ID 格式无效");

export const courseIdSchema = z.string().cuid("课程 ID 格式无效");
export const classroomIdSchema = z.string().cuid("班级 ID 格式无效");

export const createCourseTemplateSchema = z
  .object({
    code: templateCodeSchema,
    name: templateNameSchema,
    description: templateDescriptionSchema,
    version: templateVersionSchema,
  })
  .strict();

export const updateCourseTemplateSchema = z
  .object({
    name: templateNameSchema,
    description: templateDescriptionSchema,
    version: templateVersionSchema,
  })
  .strict();

export const createCourseSchema = z
  .object({
    templateId: courseTemplateIdSchema,
    courseNo: courseNoSchema,
    term: termSchema,
    name: courseNameSchema,
    description: courseDescriptionSchema,
  })
  .strict();

export const updateCourseSchema = z
  .object({
    courseNo: courseNoSchema,
    term: termSchema,
    name: courseNameSchema,
    description: courseDescriptionSchema,
  })
  .strict();

export type CreateCourseTemplateInput = z.input<
  typeof createCourseTemplateSchema
>;
export type CreateCourseTemplateData = z.output<
  typeof createCourseTemplateSchema
>;
export type UpdateCourseTemplateInput = z.input<
  typeof updateCourseTemplateSchema
>;
export type UpdateCourseTemplateData = z.output<
  typeof updateCourseTemplateSchema
>;
export type CreateCourseInput = z.input<typeof createCourseSchema>;
export type CreateCourseData = z.output<typeof createCourseSchema>;
export type UpdateCourseInput = z.input<typeof updateCourseSchema>;
export type UpdateCourseData = z.output<typeof updateCourseSchema>;
