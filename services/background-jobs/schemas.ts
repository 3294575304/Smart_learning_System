import { z } from "zod";

export const backgroundJobTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const createBackgroundJobSchema = z.object({
  type: backgroundJobTypeSchema,
  requestedById: z.string().cuid().nullable().optional(),
  courseId: z.string().cuid().nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(191),
  input: z.record(z.unknown()),
  maxAttempts: z.number().int().min(1).max(10).default(3),
});

export const claimBackgroundJobSchema = z.object({
  workerId: z.string().trim().min(1).max(191),
  executorVersion: z.string().trim().min(1).max(100),
  acceptedTypes: z.array(backgroundJobTypeSchema).min(1).max(20),
  leaseDurationMs: z.number().int().min(5_000).max(300_000).default(30_000),
});

export const heartbeatBackgroundJobSchema = z.object({
  leaseId: z.string().uuid(),
  progress: z.number().int().min(0).max(100),
  leaseDurationMs: z.number().int().min(5_000).max(300_000).default(30_000),
});

export const completeBackgroundJobSchema = z.object({
  leaseId: z.string().uuid(),
  result: z.record(z.unknown()).default({}),
  resourceUsage: z.record(z.unknown()).default({}),
});

export const failBackgroundJobSchema = z.object({
  leaseId: z.string().uuid(),
  errorCode: z.string().trim().min(1).max(100),
  retryable: z.boolean(),
  resourceUsage: z.record(z.unknown()).default({}),
});

export type CreateBackgroundJobInput = z.infer<
  typeof createBackgroundJobSchema
>;
export type ClaimBackgroundJobInput = z.infer<typeof claimBackgroundJobSchema>;
