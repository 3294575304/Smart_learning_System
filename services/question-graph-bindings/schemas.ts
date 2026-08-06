import { QuestionGraphBindingType } from "@prisma/client";
import { z } from "zod";

export const graphBindingPathSchema = z.object({
  questionId: z.string().cuid(),
});

export const bindableNodePathSchema = z.object({
  courseId: z.string().cuid(),
});

export const bindableNodeQuerySchema = z.object({
  keyword: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const graphBindingCourseQuerySchema = z.object({
  courseId: z.string().cuid(),
});

export const clearGraphBindingsSchema = graphBindingCourseQuerySchema.extend({
  expectedRevision: z.number().int().min(0),
});

const bindingItemSchema = z.object({
  conceptId: z.string().cuid(),
  publishedNodeId: z.string().cuid(),
  type: z.nativeEnum(QuestionGraphBindingType),
});

export const saveGraphBindingsSchema = z
  .object({
    courseId: z.string().cuid(),
    graphVersionId: z.string().cuid(),
    expectedRevision: z.number().int().min(0),
    bindings: z.array(bindingItemSchema).max(30),
  })
  .superRefine((value, context) => {
    if (value.bindings.filter((item) => item.type === "PRIMARY").length > 1) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "主知识点只能有一个",
      });
    }
    const concepts = value.bindings.map((item) => item.conceptId);
    if (new Set(concepts).size !== concepts.length) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "同一知识点不能重复绑定",
      });
    }
  });

export type SaveGraphBindingsData = z.output<typeof saveGraphBindingsSchema>;
