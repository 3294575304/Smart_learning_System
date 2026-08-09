import { z } from "zod";

export const assessmentLearningEventPayloadSchema = z
  .object({
    studentAnswerId: z.string().cuid(),
    assessmentRevisionKey: z.string().max(191).nullable().optional(),
    evidenceStatus: z.enum(["VALID", "REVOKED"]),
    gradingSource: z.enum(["AUTO_GRADING", "MANUAL_GRADING"]).nullable(),
    score: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    maxScore: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    gradedAt: z.string().datetime().nullable(),
    conceptSnapshotCount: z.number().int().positive(),
  })
  .strict();

export type AssessmentLearningEventPayload = z.infer<
  typeof assessmentLearningEventPayloadSchema
>;
