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

export const sandboxExecutionRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    language: z.literal("PYTHON"),
    sourceCode: z.string().min(1).max(200_000),
    stdin: z.string().max(65_536).default(""),
    networkAccess: z.literal(false),
    limits: sandboxLimitsSchema,
    metadata: z
      .object({
        jobId: z.string().cuid().optional(),
        purpose: z.enum(["SECURITY_PROBE", "FUTURE_JUDGE"]),
      })
      .strict(),
  })
  .strict();

export const sandboxErrorTypeSchema = z.enum([
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
]);

export const sandboxTestResultSchema = z
  .object({
    testId: z.string().min(1).max(100),
    visibility: z.enum(["PUBLIC", "HIDDEN"]),
    passed: z.boolean(),
    errorType: sandboxErrorTypeSchema,
    stdout: z.string().max(1_048_576),
    stderr: z.string().max(1_048_576),
  })
  .strict();

export const sandboxResourceUsageSchema = z
  .object({
    cpuTimeMs: z.number().int().nonnegative().nullable(),
    wallTimeMs: z.number().int().nonnegative(),
    peakMemoryBytes: z.number().int().nonnegative().nullable(),
    outputBytes: z.number().int().nonnegative(),
    processCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const sandboxExecutionResultSchema = z
  .object({
    executionId: z.string().min(1).max(191),
    status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
    executorVersion: z.string().min(1).max(100),
    errorType: sandboxErrorTypeSchema,
    exitCode: z.number().int().nullable(),
    stdout: z.string().max(1_048_576),
    stderr: z.string().max(1_048_576),
    resourceUsage: sandboxResourceUsageSchema.nullable(),
    tests: z.array(sandboxTestResultSchema).max(1_000),
  })
  .strict();

export const sandboxSubmissionReceiptSchema = z
  .object({
    executionId: z.string().min(1).max(191),
    executorVersion: z.string().min(1).max(100),
  })
  .strict();

export const sandboxHealthSchema = z
  .object({
    status: z.literal("ok"),
    executorVersion: z.string().min(1).max(100),
    active: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    maxConcurrency: z.number().int().positive(),
    maxQueueDepth: z.number().int().positive(),
  })
  .strict();

export type SandboxExecutionRequest = z.infer<
  typeof sandboxExecutionRequestSchema
>;
export type SandboxExecutionResult = z.infer<
  typeof sandboxExecutionResultSchema
>;
export type SandboxSubmissionReceipt = z.infer<
  typeof sandboxSubmissionReceiptSchema
>;
export type SandboxHealth = z.infer<typeof sandboxHealthSchema>;
