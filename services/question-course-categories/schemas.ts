import { z } from "zod";

import { courseNoSchema, optionalCourseNoSchema } from "@/lib/course-no";

const cuidSchema = z.string().cuid();

// School catalog migration assigned qc_ IDs to existing categories.
export const questionCourseCategoryIdSchema = z.string().refine(
  (id) => cuidSchema.safeParse(id).success || /^qc_[0-9a-f]{24}$/u.test(id),
  (id) => ({
    message: id.trim() ? "课程分类 ID 格式无效" : "请选择课程目录",
  }),
);

export const questionCourseCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1, "课程名称不能为空").max(100),
    courseNo: courseNoSchema,
  })
  .strict();

export const questionCourseCategoryUpdateSchema =
  questionCourseCategoryInputSchema.extend({
    // 编辑时可选：启停用只提交 name/isActive；传 null 表示清空课程号。
    courseNo: optionalCourseNoSchema,
    isActive: z.boolean().optional(),
  });

export type QuestionCourseCategoryInput = z.infer<
  typeof questionCourseCategoryInputSchema
>;
export type QuestionCourseCategoryUpdate = z.infer<
  typeof questionCourseCategoryUpdateSchema
>;
