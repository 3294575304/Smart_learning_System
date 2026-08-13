import { z } from "zod";

import {
  sandboxErrorTypeSchema,
  sandboxResourceUsageSchema,
} from "@/services/sandbox-executor/schemas";

export const programmingAttemptPathSchema = z.object({
  attemptId: z.string().cuid(),
});

export const createPublicProgrammingRunSchema = z
  .object({
    assignmentQuestionId: z.string().cuid(),
    sourceCode: z.string().max(200_000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const createRecommendationProgrammingAttemptSchema = z
  .object({
    sourceCode: z.string().trim().min(1).max(200_000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const rejudgeProgrammingAttemptSchema = z
  .object({
    reason: z.string().trim().min(2).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const revokeProgrammingAttemptSchema = z
  .object({ reason: z.string().trim().min(2).max(500) })
  .strict();

export const programmingJobInputSchema = z
  .object({ programmingAttemptId: z.string().cuid() })
  .strict();

export const programmingJudgeCaseResultSchema = z
  .object({
    testCaseId: z.string().cuid(),
    passed: z.boolean(),
    errorType: sandboxErrorTypeSchema,
    stdout: z.string().max(65_536),
    stderr: z.string().max(65_536),
    resourceUsage: sandboxResourceUsageSchema.nullable(),
  })
  .strict();

export const programmingJudgeResultSchema = z
  .object({
    attemptId: z.string().cuid(),
    cases: z.array(programmingJudgeCaseResultSchema).min(1).max(100),
  })
  .strict();

export const programmingCompleteEnvelopeSchema = z
  .object({
    leaseId: z.string().uuid(),
    result: programmingJudgeResultSchema,
  })
  .strict();

export type ProgrammingJudgeResult = z.infer<
  typeof programmingJudgeResultSchema
>;
