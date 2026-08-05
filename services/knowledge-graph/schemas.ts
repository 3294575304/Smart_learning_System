import { z } from "zod";

import { syllabusSourceRefSchema } from "@/services/syllabus-parsing/schemas";

const key = z.string().trim().min(1).max(191);
const code = z.string().trim().min(1).max(100);
const refs = z.array(syllabusSourceRefSchema).max(20).default([]);

export const graphNodeSchema = z
  .object({
    key,
    conceptKey: key,
    type: z.enum(["COURSE", "CHAPTER", "KNOWLEDGE_POINT"]),
    code,
    name: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(6000).nullable(),
    importance: z.enum(["CORE", "NORMAL", "EXTENDED"]).nullable(),
    isKeyTopic: z.boolean(),
    isDifficultTopic: z.boolean(),
    objectiveMappings: z.array(code).max(100),
    assessmentMappings: z.array(code).max(100),
    sourceType: z.enum(["SYLLABUS", "AI_INFERRED", "TEACHER"]),
    sourceRefs: refs,
    confidence: z.number().min(0).max(1).nullable(),
    sourcePath: z.string().trim().min(1).max(500).nullable(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

export const graphEdgeSchema = z
  .object({
    key,
    type: z.enum(["CONTAINS", "PREREQUISITE", "RELATED"]),
    from: key,
    to: key,
    description: z.string().trim().min(1).max(4000).nullable(),
    sourceType: z.enum(["SYLLABUS", "AI_INFERRED", "TEACHER"]),
    sourceRefs: refs,
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const knowledgeGraphStructureSchema = z
  .object({
    nodes: z.array(graphNodeSchema).min(3).max(1000),
    edges: z.array(graphEdgeSchema).min(2).max(3000),
  })
  .strict();

export const relatedInferenceSchema = z
  .object({
    related: z
      .array(
        z
          .object({
            from: key,
            to: key,
            description: z.string().trim().min(1).max(1000).nullable(),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const saveKnowledgeGraphReviewSchema = z
  .object({
    expectedRevisionNumber: z.number().int().nonnegative(),
    structure: knowledgeGraphStructureSchema,
  })
  .strict();

export const publishKnowledgeGraphSchema = z
  .object({
    reviewRevisionId: z.string().cuid(),
  })
  .strict();

export type KnowledgeGraphStructure = z.output<
  typeof knowledgeGraphStructureSchema
>;
export type RelatedInference = z.output<typeof relatedInferenceSchema>;
