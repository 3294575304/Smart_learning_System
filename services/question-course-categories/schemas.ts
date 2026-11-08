import { z } from "zod";

const cuidSchema = z.string().cuid();

// School catalog migration assigned qc_ IDs to existing categories.
export const questionCourseCategoryIdSchema = z
  .string()
  .refine(
    (id) => cuidSchema.safeParse(id).success || /^qc_[0-9a-f]{24}$/u.test(id),
    "课程分类 ID 格式无效",
  );

export const questionCourseCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1, "课程名称不能为空").max(100),
  })
  .strict();

export const questionCourseCategoryUpdateSchema =
  questionCourseCategoryInputSchema.extend({
    isActive: z.boolean().optional(),
  });

export type QuestionCourseCategoryInput = z.infer<
  typeof questionCourseCategoryInputSchema
>;
export type QuestionCourseCategoryUpdate = z.infer<
  typeof questionCourseCategoryUpdateSchema
>;
