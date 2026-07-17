import { z } from "zod";

const knowledgePointIdSchema = z.string().trim().min(1).max(128);

export const analysisOverallLevelSchema = z.enum([
  "BEGINNER",
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
]);

export const analysisErrorPatternTypeSchema = z.enum([
  "CONCEPT",
  "CALCULATION",
  "CARELESS",
  "METHOD",
  "UNKNOWN",
]);

const masteredKnowledgePointSchema = z
  .object({
    knowledgePointId: knowledgePointIdSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const weakKnowledgePointSchema = z
  .object({
    knowledgePointId: knowledgePointIdSchema,
    severity: z.number().int().min(1).max(5),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const errorPatternSchema = z
  .object({
    type: analysisErrorPatternTypeSchema,
    evidence: z.string().trim().min(1).max(800),
  })
  .strict();

export const studentAnalysisOutputSchema = z
  .object({
    overallLevel: analysisOverallLevelSchema,
    masteredKnowledgePoints: z.array(masteredKnowledgePointSchema).max(50),
    weakKnowledgePoints: z.array(weakKnowledgePointSchema).max(50),
    errorPatterns: z.array(errorPatternSchema).max(20),
    suggestions: z.array(z.string().trim().min(1).max(500)).max(20),
    recommendedDifficulty: z.number().int().min(1).max(5),
    confidence: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((value, context) => {
    const masteredIds = value.masteredKnowledgePoints.map(
      (item) => item.knowledgePointId,
    );
    const weakIds = value.weakKnowledgePoints.map(
      (item) => item.knowledgePointId,
    );
    if (new Set(masteredIds).size !== masteredIds.length) {
      context.addIssue({
        code: "custom",
        path: ["masteredKnowledgePoints"],
        message: "已掌握知识点不能重复",
      });
    }
    if (new Set(weakIds).size !== weakIds.length) {
      context.addIssue({
        code: "custom",
        path: ["weakKnowledgePoints"],
        message: "薄弱知识点不能重复",
      });
    }
    const weakSet = new Set(weakIds);
    if (masteredIds.some((id) => weakSet.has(id))) {
      context.addIssue({
        code: "custom",
        path: ["weakKnowledgePoints"],
        message: "同一知识点不能同时标记为已掌握和薄弱",
      });
    }
  });

const analyzedAnswerSchema = z
  .object({
    knowledgePointIds: z.array(knowledgePointIdSchema).min(1).max(20),
    difficulty: z.number().int().min(1).max(5),
    studentAnswer: z.string().max(4_000),
    standardAnswer: z.string().max(4_000),
    isCorrect: z.boolean(),
    responseTimeMs: z.number().int().min(0).max(86_400_000).nullable(),
  })
  .strict();

const historicalAccuracySchema = z
  .object({
    knowledgePointId: knowledgePointIdSchema,
    correctCount: z.number().int().min(0),
    answeredCount: z.number().int().min(0),
    accuracy: z.number().min(0).max(1),
  })
  .strict();

const recentErrorSchema = z
  .object({
    knowledgePointIds: z.array(knowledgePointIdSchema).max(20),
    difficulty: z.number().int().min(1).max(5),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const studentAnalysisInputSchema = z
  .object({
    anonymousStudentId: z.string().regex(/^[a-f0-9]{64}$/u),
    answers: z.array(analyzedAnswerSchema).min(1).max(200),
    historicalKnowledgePointAccuracy: z
      .array(historicalAccuracySchema)
      .max(200),
    recentErrors: z.array(recentErrorSchema).max(10),
    tutoringSummaries: z.array(z.string().max(1_000)).max(5),
  })
  .strict();

export type StudentAnalysisInput = z.output<typeof studentAnalysisInputSchema>;
export type StudentAnalysisOutput = z.output<
  typeof studentAnalysisOutputSchema
>;
