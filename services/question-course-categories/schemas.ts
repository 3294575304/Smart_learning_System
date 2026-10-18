import { z } from "zod";

export const questionCourseCategoryIdSchema = z.string().cuid();

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
