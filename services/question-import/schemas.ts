import { QuestionType } from "@prisma/client";
import { z } from "zod";

import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";
import { questionAnswerSchema } from "@/services/questions/schemas";

const importOptionSchema = z.object({
  label: z.string().trim().min(1).max(8),
  content: z.string().trim().min(1).max(1000),
  sortOrder: z.number().int().min(1).max(20),
});

export const questionImportCommitItemSchema = z.object({
  programmingConfig: programmingConfigRevisionInputSchema.optional(),
  rowKey: z.string().trim().min(1).max(100),
  title: z.string(),
  content: z.string(),
  type: z.nativeEnum(QuestionType),
  difficulty: z.number(),
  options: z.array(importOptionSchema).max(20),
  answer: questionAnswerSchema,
  explanation: z.string(),
  tags: z.array(z.string()).max(10),
});

export const questionImportCommitSchema = z
  .object({
    source: z.object({
      fileName: z.string().trim().min(1).max(255),
      checksum: z.string().regex(/^[a-f0-9]{64}$/u),
    }),
    courseId: z.string().cuid("请选择有效课程").optional(),
    knowledgePointIds: z.array(z.string().cuid()).max(10).default([]),
    questions: z.array(questionImportCommitItemSchema).min(1).max(500),
  })
  .superRefine((value, context) => {
    if (!value.courseId && !value.knowledgePointIds.length)
      context.addIssue({
        code: "custom",
        path: ["courseId"],
        message: "请选择题目所属课程",
      });
    if (
      new Set(value.knowledgePointIds).size !== value.knowledgePointIds.length
    )
      context.addIssue({
        code: "custom",
        path: ["knowledgePointIds"],
        message: "知识点不能重复",
      });
  });

export type QuestionImportCommitData = z.infer<
  typeof questionImportCommitSchema
>;
