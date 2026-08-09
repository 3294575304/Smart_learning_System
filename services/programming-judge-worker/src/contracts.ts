import { z } from "zod";

export const sandboxLimitsSchema = z
  .object({
    cpuTimeMs: z.number().int().min(10).max(30_000),
    wallTimeMs: z.number().int().min(10).max(60_000),
    memoryBytes: z.number().int().min(1_048_576).max(536_870_912),
    outputBytes: z.number().int().min(1_024).max(1_048_576),
    processCount: z.number().int().min(1).max(64),
  })
  .strict();

export const pythonExecutionJobInputSchema = z
  .object({
    requestId: z.string().uuid(),
    sourceCode: z.string().min(1).max(200_000),
    stdin: z.string().max(65_536).default(""),
    limits: sandboxLimitsSchema,
  })
  .strict();

export const executorResultSchema = z
  .object({
    executionId: z.string(),
    status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
    executorVersion: z.string(),
    errorType: z.enum([
      "NONE",
      "SYNTAX_ERROR",
      "RUNTIME_ERROR",
      "TIME_LIMIT",
      "MEMORY_LIMIT",
      "OUTPUT_LIMIT",
      "PROCESS_LIMIT",
      "SECURITY_VIOLATION",
      "CANCELLED",
      "INTERNAL_ERROR",
    ]),
    exitCode: z.number().int().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    resourceUsage: z
      .object({
        cpuTimeMs: z.number().int().nonnegative().nullable(),
        wallTimeMs: z.number().int().nonnegative(),
        peakMemoryBytes: z.number().int().nonnegative().nullable(),
        outputBytes: z.number().int().nonnegative(),
        processCount: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    tests: z.array(z.unknown()),
  })
  .strict();

export const claimedJobSchema = z
  .object({
    id: z.string().cuid(),
    type: z.string(),
    input: z.unknown(),
    currentLeaseId: z.string().uuid(),
  })
  .passthrough();

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data }).strict();

export type ClaimedJob = z.infer<typeof claimedJobSchema>;
export type ExecutorResult = z.infer<typeof executorResultSchema>;

export const programmingAttemptPayloadSchema = z
  .object({
    attemptId: z.string().cuid(),
    kind: z.enum(["PUBLIC_RUN", "FORMAL_JUDGE"]),
    sourceCode: z.string().max(200_000),
    inputFingerprint: z.string().length(64),
    limits: sandboxLimitsSchema,
    testCases: z.array(
      z
        .object({
          id: z.string().cuid(),
          visibility: z.enum(["PUBLIC", "HIDDEN"]),
          stdin: z.string().max(65_536),
          expectedOutput: z.string().max(65_536),
          sortOrder: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export const programmingJobInputSchema = z
  .object({ programmingAttemptId: z.string().cuid() })
  .strict();

export const programmingJudgeResultSchema = z
  .object({
    attemptId: z.string().cuid(),
    cases: z.array(
      z
        .object({
          testCaseId: z.string().cuid(),
          passed: z.boolean(),
          errorType: executorResultSchema.shape.errorType,
          stdout: z.string(),
          stderr: z.string(),
          resourceUsage: executorResultSchema.shape.resourceUsage,
        })
        .strict(),
    ),
  })
  .strict();
